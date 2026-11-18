import { computeDistance } from "../services/distance/provider.js";
import { MODULE_ID } from "../../midi-qol.js";
import { convertLengthTo, itemIsMagical, itemIsSpell } from "../utils.js";
import { unTimedExecuteAsGM } from "../GMAction.js";
import type { DamageApplicationOptions, Dnd5eChatMessage } from "../../globals.js";
import Token = foundry.canvas.placeables.Token;

// An effect another creature can end with a check (a wound to stanch). The effect carries flags.midi-qol.stanch, as its
// own flag or as a change with that key: "dc=15, skill=med, range=5, healing=spell" (a bare number is the DC; an object
// as a flag). A check of that skill (Medicine by default) by the affected creature, or by a creature within range whose
// user targets it, ends the effect when its total reaches the DC. healing: restoring hit points also ends it, from a
// spell, from a spell or magic item (magical), or from anything (any); none by default. Undoing damage on a damage card
// is not healing.
// Read when used: this module is loaded before midi-qol.ts has set MODULE_ID
const stanchKey = () => `flags.${MODULE_ID}.stanch`;
type Healing = "none" | "spell" | "magical" | "any";
export interface StanchDetails { dc: number; skill: string; range: number; healing: Healing }
const isHealing = (value: string): value is Healing => ["none", "spell", "magical", "any"].includes(value);

function parse(raw: unknown): StanchDetails | undefined {
  if (raw === undefined || raw === null || raw === "" || raw === false) return undefined;
  let fields: Record<string, unknown> = {};
  if (typeof raw === "object") fields = { ...raw };
  else if (typeof raw === "number" || /^\s*\d+\s*$/.test(String(raw))) fields = { dc: raw };
  else for (const part of String(raw).split(",")) {
    const [key, ...rest] = part.split("=");
    if (key.trim()) fields[key.trim()] = rest.join("=").trim();
  }
  const dc = Number(fields.dc);
  const range = Number(fields.range ?? 5);
  const healing = String(fields.healing ?? "none");
  return {
    dc: Number.isFinite(dc) ? dc : 10,
    skill: String(fields.skill || "med"),
    range: Number.isFinite(range) ? range : 5,
    healing: isHealing(healing) ? healing : "none"
  };
}

function changesOf(effect: ActiveEffect.Implementation): { key: string, value: unknown }[] {
  // @ts-expect-error fvtt-types v14 ActiveEffect
  return effect.system?.changes ?? [];
}

/** The stanch details of an effect, or undefined. */
export function stanchDetails(effect: ActiveEffect.Implementation): StanchDetails | undefined {
  const flag = effect.flags?.[MODULE_ID]?.stanch;
  if (flag !== undefined && flag !== null) return parse(flag);
  return parse(changesOf(effect).find(change => change.key === stanchKey())?.value);
}

interface Stanchable { effect: ActiveEffect.Implementation; details: StanchDetails }

/** An actor's active effects that can be stanched. */
export function stanchableEffects(actor: Actor.Implementation | null | undefined): Stanchable[] {
  const found: Stanchable[] = [];
  for (const effect of actor?.effects ?? []) {
    const details = effect.active ? stanchDetails(effect) : undefined;
    if (details) found.push({ effect, details });
  }
  return found;
}

/** The lowest DC among the effects of `actor` that a check of `skill` can stanch, or undefined. */
export function stanchDC(actor: Actor.Implementation | null | undefined, skill = "med"): number | undefined {
  const dcs = stanchableEffects(actor).filter(({ details }) => details.skill === skill).map(({ details }) => details.dc);
  return dcs.length ? Math.min(...dcs) : undefined;
}

// Every stack of a stacking effect (DAE removes one stack unless told how many). Returns the effects that are gone.
async function endEffects(actor: Actor.Implementation, effects: ActiveEffect.Implementation[]): Promise<ActiveEffect.Implementation[]> {
  for (const effect of effects) {
    const removeStacks = Math.max(1, Number(foundry.utils.getProperty(effect, "flags.dae.stacks") ?? 1));
    await unTimedExecuteAsGM("removeEffects", { actorUuid: actor.uuid, effects: [effect.id], options: { removeStacks } });
  }
  return effects.filter(effect => !actor.effects.has(effect.id ?? ""));
}

// Distances are in the scene's units; an effect's range is in feet
function toFeet(distance: number): number {
  return distance < 0 ? distance : convertLengthTo(distance, canvas?.scene?.grid?.units, "ft");
}

/**
 * A check of `skill` totalling `total` by `roller` (a token) for the effects of `target` (a token): the target itself,
 * or a creature within each effect's range in feet. Ends the effects whose DC it reaches; returns those ended.
 */
export async function stanchEffects(roller: Token.Implementation | undefined, target: Token.Implementation, skill: string, total: number): Promise<ActiveEffect.Implementation[]> {
  const actor = target.actor;
  const candidates = stanchableEffects(actor).filter(({ details }) => details.skill === skill);
  if (!actor || !candidates.length || !roller) return [];
  const self = roller.document === target.document;
  // Between the creatures' spaces, as midi measures reach
  const distance = self ? 0 : toFeet(computeDistance(roller, target, { wallsBlock: false, includeCover: false }));
  const reached = candidates.filter(({ details }) => (self || (distance >= 0 && distance <= details.range)) && total >= details.dc).map(({ effect }) => effect);
  const closed = await endEffects(actor, reached);
  if (closed.length) ui.notifications?.info(game.i18n?.format("midi-qol.Stanched", { name: target.name, effects: [...new Set(closed.map(effect => effect.name))].join(", ") }) ?? "");
  return closed;
}

function healedBy(options: DamageApplicationOptions): "spell" | "magical" | "any" {
  const message: Dnd5eChatMessage | undefined = options.originatingMessage;
  const item = message?.getAssociatedItem?.();
  if (itemIsSpell(item)) return "spell";
  return itemIsMagical(item) ? "magical" : "any";
}

function currentHp(actor: Actor.Implementation): number {
  // @ts-expect-error no dnd5e-types
  return actor.system.attributes?.hp?.value ?? 0;
}

export function registerStanchHooks() {
  // The roller's own effects, and those of the creatures its user targets
  Hooks.on("dnd5e.rollSkill", async (rolls, { skill, subject } = {}) => {
    if (!rolls?.length || !skill || !subject) return;
    const roller = subject.getActiveTokens()[0];
    if (!roller) return;
    const has = (actor: Actor.Implementation | null | undefined) => stanchableEffects(actor).some(({ details }) => details.skill === skill);
    const targets = [...(game.user?.targets ?? [])].filter(token => has(token.actor));
    if (has(subject) && !targets.some(token => token.actor === subject)) targets.push(roller);
    for (const target of targets) await stanchEffects(roller, target, skill, rolls[0].total ?? 0);
  });
  Hooks.on("dnd5e.preApplyDamage", (actor, _amount, updates, options) => {
    if (options?.midiUndo) return;
    const candidates = stanchableEffects(actor).filter(({ details }) => details.healing !== "none");
    if (!candidates.length) return;
    const newHp: unknown = foundry.utils.getProperty(updates, "system.attributes.hp.value");
    if (!(typeof newHp === "number" && newHp > currentHp(actor))) return;
    const source = healedBy(options ?? {});
    const closes: Record<Healing, string[]> = { none: [], spell: ["spell"], magical: ["spell", "magical"], any: ["spell", "magical", "any"] };
    endEffects(actor, candidates.filter(({ details }) => closes[details.healing].includes(source)).map(({ effect }) => effect))
      .catch(err => console.warn("midi-qol | stanch: could not end effects", err));
  });
}
