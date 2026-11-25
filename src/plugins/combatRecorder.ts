import type { Cue } from "../module/lib/cues.js";
import type { CombatRecordProvider, EventsQuery, Knowledge, KnowledgeQuery, RecordEvent } from "../module/services/combatRecord/service.js";

/*
 * Combat recorder: midi's combatRecord provider, written as a plugin so it can move into a module (Encounter
 * Chronicle) unchanged. It uses only what it is given (midi's public API: services, reveals, tokenFor), midi's hooks and
 * Foundry's; the imports above are types only.
 *
 * Records just what midi's hub reads:
 * - events of the current combats, in memory on every client (each sees every cue: `midi-qol.cue` where the use runs,
 *   `midi-qol.cueReceived` elsewhere), from the cues' per-target outcomes and effects created and deleted; a token's
 *   turn ending marks "since my last turn";
 * - knowledge per creature kind (its base actor's name), learned in combat: an AC range from hits and misses (not natural 20s or 1s), saves
 *   seen, resistances, immunities and vulnerabilities from damage rolled against applied, uses seen. Kept across
 *   sessions in a world setting the active GM saves; every client records too and takes the GM's saved copy.
 * Answers are for the asking user: an unseen creature is "someone unseen", an AC range only where hits and misses are
 * shown to them.
 */

export interface RecorderApi {
  services: { register(serviceId: string, providerId: string, provider: CombatRecordProvider, options?: { label?: string, priority?: number }): unknown };
  reveals(query: { subject: string, user?: User.Implementation | null, target?: Actor.Implementation }): boolean;
  tokenFor(ref: Actor.Implementation | TokenDocument.Implementation | null | undefined): TokenDocument.Implementation | undefined;
}

const NAMESPACE = "midi-qol";
const KNOWLEDGE_SETTING = "combatRecorderKnowledge";
/** midi's economy markers: not effects a creature gains */
const MARKERS = new Set(["dnd5ereaction000", "dnd5ebonusaction", "dnd5eturn0000000"]);
const HEALING = new Set(["healing", "temphp"]);

interface Stored extends RecordEvent { seq: number, combat: string, subject: string }
interface KindRecord {
  name: string;
  atLeast?: number;
  atMost?: number;
  saves: Record<string, { seen: number, succeeded: number }>;
  resists: string[];
  immune: string[];
  vulnerable: string[];
  uses: string[];
}

export function registerCombatRecorder(api: RecorderApi) {
  let seq = 0;
  const events: Stored[] = [];
  const turnEnded = new Map<string, number>();
  let kinds: Record<string, KindRecord> = {};
  const seen = new Set<string>();

  game.settings?.register(NAMESPACE as never, KNOWLEDGE_SETTING as never, {
    name: "Combat recorder: what is known about creatures",
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: (value: unknown) => { kinds = foundry.utils.deepClone((value ?? {}) as Record<string, KindRecord>); }
  } as never);
  Hooks.once("ready", () => { kinds = foundry.utils.deepClone((game.settings?.get(NAMESPACE as never, KNOWLEDGE_SETTING as never) ?? {}) as Record<string, KindRecord>); });
  // The active GM keeps the knowledge (a short wait gathers a use's changes into one save)
  const save = foundry.utils.debounce(() => {
    if (game.users?.activeGM?.isSelf) void game.settings?.set(NAMESPACE as never, KNOWLEDGE_SETTING as never, kinds as never);
  }, 2000);

  const combatOf = (tokenUuid: string | undefined) => tokenUuid
    ? game.combats?.find(c => c.started && c.combatants.some(x => x.token?.uuid === tokenUuid)) ?? undefined : undefined;
  const actorOf = (uuid: string | undefined) => (uuid ? (fromUuidSync(uuid) as TokenDocument.Implementation | null)?.actor : undefined) ?? undefined;
  const nameOf = (uuid: string | undefined) => (uuid ? (fromUuidSync(uuid) as { name?: string } | null)?.name : undefined) ?? undefined;
  const kindName = (actor: Actor.Implementation | undefined) => {
    if (!actor) return undefined;
    const base = actor.isToken ? game.actors?.get(actor.id ?? "") : actor;
    return base?.name ?? actor.name ?? undefined;
  };
  // Learned in combat only (a creature in a started combat): the combat record, not every use in the world
  const kindOf = (actor: Actor.Implementation | undefined) => {
    const token = actor ? api.tokenFor(actor) : undefined;
    if (!combatOf(token?.uuid ?? undefined)) return undefined;
    const name = kindName(actor);
    if (!name) return undefined;
    return kinds[name] ??= { name, saves: {}, resists: [], immune: [], vulnerable: [], uses: [] };
  };
  const add = (list: string[], value: string) => { if (!list.includes(value)) list.push(value); };
  const push = (subject: string, event: Omit<RecordEvent, "round" | "turn">, combat: Combat.Implementation) => {
    events.push({ ...event, seq: ++seq, combat: combat.id ?? "", subject, round: combat.round ?? 0, turn: combat.turn ?? 0 });
  };

  function onCue(cue: Cue) {
    const source = cue.source ? { uuid: cue.source, name: nameOf(cue.source) ?? "" } : undefined;
    const item = cue.itemName ?? nameOf(cue.item);
    const once = (part: string) => {
      const key = `${cue.useId ?? ""}|${part}`;
      if (!cue.useId || seen.has(key)) return false;
      seen.add(key);
      return true;
    };
    let learned = false;
    if (cue.cue === "use.start" && item) {
      const kind = kindOf(actorOf(cue.source));
      if (kind && !kind.uses.includes(item)) { kind.uses.push(item); learned = true; }
    }
    const attack = cue.cue.startsWith("attack.") && cue.cue !== "attack.roll" && once("attack");
    const saves = cue.cue.startsWith("save.") && once("saves");
    const damage = (cue.cue === "damage.applied" || cue.cue === "heal.applied") && once(cue.cue);
    for (const outcome of (attack || saves || damage) ? cue.outcomes : []) {
      const combat = combatOf(outcome.target);
      const kind = kindOf(actorOf(outcome.target));
      if (attack && outcome.attack) {
        const a = outcome.attack;
        if (combat) push(outcome.target, { kind: "attacked", source, item, outcome: a.critical ? "critical" : a.hit ? "hit" : "miss" }, combat);
        if (kind && a.total !== undefined && !a.critical && !a.fumble) {
          if (a.hit) kind.atMost = Math.min(kind.atMost ?? Infinity, a.total);
          else kind.atLeast = Math.max(kind.atLeast ?? -Infinity, a.total + 1);
          learned = true;
        }
      }
      if (saves && outcome.save) {
        const s = outcome.save;
        if (combat) push(outcome.target, { kind: "saved", source, item, outcome: s.success ? "success" : "failure" }, combat);
        if (kind && s.ability) {
          const entry = kind.saves[s.ability] ??= { seen: 0, succeeded: 0 };
          entry.seen += 1;
          if (s.success) entry.succeeded += 1;
          learned = true;
        }
      }
      if (damage && outcome.damage) {
        const d = outcome.damage;
        // Hit points this viewer may not learn are left out of their cue (hpState): no event for them
        const amount = d.hp === undefined ? 0 : d.hp + (d.temp ?? 0);
        const top = Object.entries(d.applied).sort((x, y) => y[1] - x[1])[0]?.[0];
        if (combat && amount > 0) push(outcome.target, { kind: "damaged", source, item, amount, damageType: top }, combat);
        if (combat && (d.healed ?? 0) > 0) push(outcome.target, { kind: "healed", source, item, amount: d.healed }, combat);
        // What the damage shows of the creature, when no save changed it
        if (kind && !outcome.save?.success) for (const [type, rolled] of Object.entries(d.rolled)) {
          if (rolled <= 0 || HEALING.has(type)) continue;
          const applied = d.applied[type] ?? 0;
          if (applied === 0) add(kind.immune, type);
          else if (applied * 2 <= rolled) add(kind.resists, type);
          else if (applied >= rolled * 2) add(kind.vulnerable, type);
          learned = true;
        }
      }
    }
    if (learned) save();
  }

  function onEffect(effect: ActiveEffect.Implementation, kind: "effectGained" | "effectEnded") {
    const actor = effect.parent;
    if (!(actor instanceof Actor) || MARKERS.has(effect.id ?? "")) return;
    const token = api.tokenFor(actor);
    const combat = combatOf(token?.uuid ?? undefined);
    if (!token?.uuid || !combat) return;
    const origin = typeof effect.origin === "string" ? fromUuidSync(effect.origin) as { actor?: Actor.Implementation } | null : null;
    const from = origin instanceof Actor ? origin : origin?.actor;
    push(token.uuid, { kind, effect: effect.name ?? "", source: from && from !== actor ? { uuid: from.uuid ?? undefined, name: from.name ?? "" } : undefined }, combat);
  }

  /** The source as the asking user may know it */
  const visible = (source: RecordEvent["source"]): RecordEvent["source"] => {
    if (!source?.uuid) return source;
    const doc = fromUuidSync(source.uuid);
    const object = doc instanceof TokenDocument ? doc.object : doc instanceof Actor ? api.tokenFor(doc)?.object : undefined;
    return object && !object.visible ? { name: game.i18n?.localize("midi-qol.Record.Someone") ?? "someone unseen" } : source;
  };

  const provider: CombatRecordProvider = {
    events({ subject, since, kinds: wanted }: EventsQuery): RecordEvent[] {
      const combat = combatOf(subject);
      if (!combat) return [];
      const inRange = (e: Stored) => since === "lastTurn" ? e.seq > (turnEnded.get(subject) ?? 0)
        : e.round > since.round || (e.round === since.round && e.turn >= since.turn);
      return events.filter(e => e.subject === subject && e.combat === combat.id && (!wanted || wanted.includes(e.kind)) && inRange(e))
        .map(({ seq: _seq, combat: _combat, subject: _subject, ...event }) => ({ ...event, source: visible(event.source) }));
    },
    knowledge({ subject, viewer }: KnowledgeQuery): Knowledge | undefined {
      const actor = actorOf(subject);
      const name = kindName(actor);
      const kind = name ? kinds[name] : undefined;
      if (!kind) return undefined;
      const hits = viewer.isGM || api.reveals({ subject: "hitResult", user: viewer, target: actor });
      const ac = hits && (kind.atLeast !== undefined || kind.atMost !== undefined)
        ? { ...(Number.isFinite(kind.atLeast) ? { atLeast: kind.atLeast } : {}), ...(Number.isFinite(kind.atMost) ? { atMost: kind.atMost } : {}) } : undefined;
      return {
        name: kind.name,
        ...(ac ? { ac } : {}),
        saves: Object.entries(kind.saves).map(([ability, s]) => ({ ability, ...s })),
        ...(viewer.isGM || api.reveals({ subject: "resistances", user: viewer, target: actor })
          ? { resists: [...kind.resists], immune: [...kind.immune], vulnerable: [...kind.vulnerable] }
          : { resists: [], immune: [], vulnerable: [] }),
        uses: [...kind.uses]
      };
    }
  };

  api.services.register("combatRecord", "midi-qol.combatRecorder", provider, { label: "Midi-QOL: combat recorder", priority: -100 });
  Hooks.on("midi-qol.cue" as never, onCue as never);
  Hooks.on("midi-qol.cueReceived" as never, onCue as never);
  Hooks.on("createActiveEffect", (effect: ActiveEffect.Implementation) => onEffect(effect, "effectGained"));
  Hooks.on("deleteActiveEffect", (effect: ActiveEffect.Implementation) => onEffect(effect, "effectEnded"));
  Hooks.on("combatTurnChange", (combat: Combat.Implementation, prior: { combatantId?: string | null }) => {
    const token = prior?.combatantId ? combat.combatants.get(prior.combatantId)?.token : undefined;
    if (token?.uuid) turnEnded.set(token.uuid, seq);
  });
  Hooks.on("deleteCombat", (combat: Combat.Implementation) => {
    for (let i = events.length - 1; i >= 0; i--) if (events[i].combat === combat.id) events.splice(i, 1);
    for (const c of combat.combatants) if (c.token?.uuid) turnEnded.delete(c.token.uuid);
  });
}
