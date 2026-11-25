import { tokenFor } from "../tokenResolver.js";
import type { Workflow } from "../../Workflow.js";
import { collectEntries, registerEvent, runEffectEvent, runEvent, type EventContext } from "./engine.js";
import { raiseCreatureCue } from "../cues.js";

/*
 * M15 stage 6: the bearer's events (the spike's "The bearer" row). Raised for the creature itself, its items and
 * applied effects (`who: "bearer"` / `"owner"`), and for near entries about it.
 * - droppedToZero, bloodied: its hit points crossed 0 or half (any change, midi's or not: updateActor with dnd5e's
 *   previous hp); dies: it gained the dead status. Raised on the active GM, once.
 * - attacks, casts: it makes an attack, casts a spell (raised by its use's steps: useEvents); dealsDamage: its use
 *   damaged someone.
 */

async function raise(eventId: string, actor: Actor.Implementation | null | undefined, event: Record<string, unknown>, workflow?: Workflow): Promise<void> {
  if (!actor) return;
  const context: EventContext = { actor, event, ...(workflow ? { workflow } : {}) };
  if (!collectEntries(eventId, context).length) return;
  await runEvent(eventId, context);
}

function onUpdateActor(actor: Actor.Implementation, changes: object, options: Actor.Database.OnUpdateOptions) {
  if (!game.user?.isActiveGM) return;
  // @ts-expect-error no dnd5e-types: dnd5e's _preUpdate keeps the previous hp in the options
  const before = options.dnd5e?.hp as { value?: number } | undefined;
  if (before?.value === undefined || foundry.utils.getProperty(changes, "system.attributes.hp.value") === undefined) return;
  // @ts-expect-error no dnd5e-types
  const hp = actor.system.attributes?.hp as { value: number, max: number, effectiveMax?: number } | undefined;
  if (!hp) return;
  const max = hp.effectiveMax ?? hp.max;
  const event = { hp: { before: before.value, after: hp.value, max } };
  if (before.value > 0 && hp.value <= 0) {
    void raise("droppedToZero", actor, event);
    raiseCreatureCue("creature.dropped", tokenFor(actor));
  }
  if (before.value > max / 2 && hp.value <= max / 2 && hp.value > 0) void raise("bloodied", actor, event);
}

/** M11b: the effect ends (deleted, or disabled: DAE's Mark Expired): its own `ended` entries, on the active GM */
function onEffectEnded(effect: ActiveEffect.Implementation) {
  if (!game.user?.isActiveGM) return;
  // An enchantment on an owned item ends for the item's owner
  const enchanted = effect.parent instanceof Item && (effect as { isAppliedEnchantment?: boolean }).isAppliedEnchantment ? effect.parent.actor : undefined;
  const bearer = effect.parent instanceof Actor ? effect.parent : enchanted;
  if (!bearer) return;
  void runEffectEvent("ended", effect, bearer as Actor.Implementation).catch(err => console.warn(`midi-qol | ended entries of ${effect.name}`, err));
}

function onCreateEffect(effect: ActiveEffect.Implementation) {
  if (!game.user?.isActiveGM || !(effect.parent instanceof Actor) || !effect.statuses.has("dead")) return;
  void raise("dies", effect.parent, { effect });
}

const dealt = new WeakSet<Workflow>();

/** The use damaged a target: the user's dealsDamage, once per use */
export async function raiseDealsDamage(workflow: Workflow, target: TokenDocument.Implementation | undefined): Promise<void> {
  if (dealt.has(workflow)) return;
  dealt.add(workflow);
  await raise("dealsDamage", workflow.actor, { use: workflow, target }, workflow);
}

export function registerBearerEvents() {
  registerEvent("droppedToZero", { label: "The bearer drops to 0 hit points" });
  registerEvent("bloodied", { label: "The bearer drops to half its hit points or fewer" });
  registerEvent("dies", { label: "The bearer dies (the dead status)" });
  registerEvent("attacks", { label: "The bearer makes an attack" });
  registerEvent("casts", { label: "The bearer casts a spell" });
  registerEvent("dealsDamage", { label: "The bearer's use deals damage" });
  Hooks.on("updateActor", (actor, changes, options) => onUpdateActor(actor, changes, options));
  Hooks.on("createActiveEffect", effect => onCreateEffect(effect));
  registerEvent("ended", { label: "The effect holding the entry ends (deleted or disabled)" });
  Hooks.on("deleteActiveEffect", effect => onEffectEnded(effect));
  Hooks.on("updateActiveEffect", (effect, changes) => { if ((changes as { disabled?: boolean }).disabled === true) onEffectEnded(effect); });
}
