import { getStaticID } from "../../../midi-qol.js";
import type { Cue } from "../../lib/cues.js";
import { tokenFor } from "../../lib/tokenResolver.js";
import { reveals } from "../revealPolicy/service.js";
import { combatRecordService, type CombatRecordProvider, type EventsQuery, type Knowledge, type KnowledgeQuery, type RecordEvent } from "./service.js";

/*
 * midi's combatRecord provider: a stub keeping this session in memory, on every client (each sees every cue and effect
 * change), so the hub works without a recording module. Events per combat, cleared when it ends; knowledge per creature
 * kind (its base actor's name) for the session. Encounter Chronicle replaces it with records it keeps.
 */

interface Stored extends RecordEvent {
  seq: number;
  combat: string;
  /** Token uuid the event happened to */
  subject: string;
}

interface Kind {
  name: string;
  atLeast?: number;
  atMost?: number;
  saves: Map<string, { seen: number, succeeded: number }>;
  resists: Set<string>;
  immune: Set<string>;
  vulnerable: Set<string>;
  uses: Set<string>;
}

let seq = 0;
const events: Stored[] = [];
/** The seq when each token's last turn ended */
const turnEnded = new Map<string, number>();
const kinds = new Map<string, Kind>();
/** Uses whose attack, save and damage outcomes are recorded (a use raises several cues) */
const seen = new Set<string>();

const MARKERS = () => new Set([getStaticID("reaction"), getStaticID("bonusaction"), getStaticID("turn")]);

function combatOf(tokenUuid: string | undefined): Combat.Implementation | undefined {
  if (!tokenUuid) return undefined;
  return game.combats?.find(c => c.started && c.combatants.some(x => x.token?.uuid === tokenUuid)) ?? undefined;
}

function kindName(actor: Actor.Implementation | null | undefined): string | undefined {
  if (!actor) return undefined;
  const base = actor.isToken ? game.actors?.get(actor.id ?? "") : actor;
  return base?.name ?? actor.name ?? undefined;
}

function kindOf(actor: Actor.Implementation | null | undefined): Kind | undefined {
  const name = kindName(actor);
  if (!name) return undefined;
  let kind = kinds.get(name);
  if (!kind) kinds.set(name, kind = { name, saves: new Map(), resists: new Set(), immune: new Set(), vulnerable: new Set(), uses: new Set() });
  return kind;
}

const actorOfToken = (uuid: string | undefined) => (uuid ? (fromUuidSync(uuid) as TokenDocument.Implementation | null)?.actor : undefined) ?? undefined;
const nameOf = (uuid: string | undefined) => (uuid ? (fromUuidSync(uuid) as { name?: string } | null)?.name : undefined) ?? undefined;

function push(subject: string, event: RecordEvent & { source?: { uuid?: string, name: string } }, combat: Combat.Implementation) {
  events.push({ ...event, seq: ++seq, combat: combat.id ?? "", subject, round: combat.round ?? 0, turn: combat.turn ?? 0 });
}

/** A use's cues: its per-target outcomes, once per use for each part */
function onCue(cue: Cue) {
  const source = cue.source ? { uuid: cue.source, name: nameOf(cue.source) ?? "" } : undefined;
  const item = cue.itemName ?? nameOf(cue.item);
  const once = (part: string) => {
    const key = `${cue.useId ?? ""}|${part}`;
    if (!cue.useId || seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  if (cue.cue === "use.start" && item) kindOf(actorOfToken(cue.source))?.uses.add(item);
  const attack = cue.cue.startsWith("attack.") && cue.cue !== "attack.roll" && once("attack");
  const saves = cue.cue.startsWith("save.") && once("saves");
  const damage = (cue.cue === "damage.applied" || cue.cue === "heal.applied") && once(cue.cue);
  if (!attack && !saves && !damage) return;
  for (const outcome of cue.outcomes) {
    const combat = combatOf(outcome.target);
    const kind = kindOf(actorOfToken(outcome.target));
    if (attack && outcome.attack) {
      const a = outcome.attack;
      if (combat) push(outcome.target, { kind: "attacked", source, item, outcome: a.critical ? "critical" : a.hit ? "hit" : "miss", round: 0, turn: 0 }, combat);
      // A natural 20 or 1 says nothing about the AC
      if (kind && a.total !== undefined && !a.critical && !a.fumble) {
        if (a.hit) kind.atMost = Math.min(kind.atMost ?? Infinity, a.total);
        else kind.atLeast = Math.max(kind.atLeast ?? -Infinity, a.total + 1);
      }
    }
    if (saves && outcome.save) {
      const s = outcome.save;
      if (combat) push(outcome.target, { kind: "saved", source, item, outcome: s.success ? "success" : "failure", round: 0, turn: 0 }, combat);
      if (kind && s.ability) {
        const entry = kind.saves.get(s.ability) ?? { seen: 0, succeeded: 0 };
        entry.seen += 1;
        if (s.success) entry.succeeded += 1;
        kind.saves.set(s.ability, entry);
      }
    }
    if (damage && outcome.damage) {
      const d = outcome.damage;
      const amount = d.hp + d.temp;
      const top = Object.entries(d.applied).sort((x, y) => y[1] - x[1])[0]?.[0];
      if (combat && amount > 0) push(outcome.target, { kind: "damaged", source, item, amount, damageType: top, round: 0, turn: 0 }, combat);
      if (combat && d.healed > 0) push(outcome.target, { kind: "healed", source, item, amount: d.healed, round: 0, turn: 0 }, combat);
      // What the damage shows of the creature, when no save changed it
      if (kind && !outcome.save?.success) for (const [type, rolled] of Object.entries(d.rolled)) {
        if (rolled <= 0 || ["healing", "temphp"].includes(type)) continue;
        const applied = d.applied[type] ?? 0;
        if (applied === 0) kind.immune.add(type);
        else if (applied * 2 <= rolled) kind.resists.add(type);
        else if (applied >= rolled * 2) kind.vulnerable.add(type);
      }
    }
  }
}

function onEffect(effect: ActiveEffect.Implementation, kind: "effectGained" | "effectEnded") {
  const actor = effect.parent;
  if (!(actor instanceof Actor) || MARKERS().has(effect.id ?? "")) return;
  const token = tokenFor(actor);
  const combat = combatOf(token?.uuid ?? undefined);
  if (!token?.uuid || !combat) return;
  const origin = typeof effect.origin === "string" ? fromUuidSync(effect.origin) as { name?: string, actor?: Actor.Implementation } | null : null;
  const sourceActor = origin instanceof Actor ? origin : origin?.actor;
  push(token.uuid, { kind, effect: effect.name ?? "", source: sourceActor && sourceActor !== actor ? { uuid: sourceActor.uuid ?? undefined, name: sourceActor.name ?? "" } : undefined, round: 0, turn: 0 }, combat);
}

/** The name a viewer may know for a source: none for a creature they can't see */
function visibleSource(event: Stored): Stored["source"] {
  if (!event.source) return undefined;
  const doc = event.source.uuid ? fromUuidSync(event.source.uuid) : undefined;
  const object = doc instanceof TokenDocument ? doc.object : doc instanceof Actor ? tokenFor(doc)?.object : undefined;
  if (object && !object.visible) return { name: game.i18n?.localize("midi-qol.Record.Someone") ?? "Someone" };
  return event.source;
}

export const midiCombatRecord: CombatRecordProvider = {
  events({ subject, since, kinds: wanted }: EventsQuery): RecordEvent[] {
    const combat = combatOf(subject);
    if (!combat) return [];
    const inRange = (e: Stored) => since === "lastTurn" ? e.seq > (turnEnded.get(subject) ?? 0)
      : e.round > since.round || (e.round === since.round && e.turn >= since.turn);
    return events.filter(e => e.subject === subject && e.combat === combat.id && (!wanted || wanted.includes(e.kind)) && inRange(e))
      .map(({ seq: _seq, combat: _combat, subject: _subject, ...event }) => ({ ...event, source: visibleSource({ ...event, seq: 0, combat: "", subject }) }));
  },
  knowledge({ subject, viewer }: KnowledgeQuery): Knowledge | undefined {
    const actor = actorOfToken(subject);
    const name = kindName(actor);
    const kind = name ? kinds.get(name) : undefined;
    if (!kind) return undefined;
    // An AC range only for a viewer shown hits and misses
    const hits = viewer.isGM || reveals({ subject: "hitResult", user: viewer, target: actor ?? undefined });
    const ac = hits && (kind.atLeast !== undefined || kind.atMost !== undefined)
      ? { ...(Number.isFinite(kind.atLeast) ? { atLeast: kind.atLeast } : {}), ...(Number.isFinite(kind.atMost) ? { atMost: kind.atMost } : {}) } : undefined;
    return {
      name: kind.name,
      ...(ac ? { ac } : {}),
      saves: [...kind.saves.entries()].map(([ability, s]) => ({ ability, ...s })),
      resists: [...kind.resists], immune: [...kind.immune], vulnerable: [...kind.vulnerable],
      uses: [...kind.uses]
    };
  }
};

export function registerMidiCombatRecord() {
  combatRecordService.register("midi-qol", midiCombatRecord, { label: "Midi-QOL: this session", priority: -100 });
  Hooks.on("midi-qol.cue" as never, onCue as never);
  Hooks.on("midi-qol.cueReceived" as never, onCue as never);
  Hooks.on("createActiveEffect", (effect: ActiveEffect.Implementation) => onEffect(effect, "effectGained"));
  Hooks.on("deleteActiveEffect", (effect: ActiveEffect.Implementation) => onEffect(effect, "effectEnded"));
  // A turn ending: what comes after is "since my last turn"
  Hooks.on("combatTurnChange", (combat: Combat.Implementation, prior: { combatantId?: string | null }) => {
    const token = prior?.combatantId ? combat.combatants.get(prior.combatantId)?.token : undefined;
    if (token?.uuid) turnEnded.set(token.uuid, seq);
  });
  Hooks.on("deleteCombat", (combat: Combat.Implementation) => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].combat === combat.id) events.splice(i, 1);
    for (const c of combat.combatants) if (c.token?.uuid) turnEnded.delete(c.token.uuid);
  });
}
