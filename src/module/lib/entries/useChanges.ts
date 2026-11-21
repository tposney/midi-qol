import type { Activity } from "../../../globals.js";
import { unTimedExecuteAsGM } from "../../GMAction.js";
import { rollTable, type TableDeclaration } from "../tables.js";
import { conditionDataFor, registerAction, runActions, type ActionRun } from "./engine.js";
import type { Workflow } from "../../Workflow.js";
import type { FoundEntry } from "./types.js";
import type { EntryAction } from "./types.js";
import { actorsFor, useContext } from "./useEvents.js";
import { itemOfEffect } from "./rules.js";

/*
 * M15 stage 4b: the actions that change a use or act for it.
 * - `change` at `use.configure` changes the use before dnd5e's use runs: on the use's own copy of the item, so only this
 *   use is affected (the copy's source, so dnd5e's scaled copy for an upcast keeps it). At `use.damageRoll`: the
 *   damage type of the rolled damage.
 * - `effect` applies or removes an effect: a status, one of the entry's item's effects, or (remove) the effects the
 *   entry's item applied.
 * - `table` draws a table and runs the drawn row's actions as the entry's.
 */

/** A number sets; a string is a formula over `@value` (the current value): "@value * 2", "min(@value * 2, 1440)" */
type NumericChange = number | string;

async function changed(change: NumericChange, value: number, rollData: Record<string, unknown>): Promise<number> {
  if (typeof change === "number") return change;
  const roll = await new Roll(change, { ...rollData, value }).evaluate();
  return roll.total ?? value;
}

/** The activity's own source (shared with the item copy's source) and prepared data, changed together */
async function changeActivity(activity: Activity, updates: Record<string, unknown>) {
  const model = activity as unknown as { updateSource(changes: Record<string, unknown>): unknown, prepareData?(): void, prepareFinalData?(): void };
  model.updateSource(updates);
  model.prepareData?.();
  model.prepareFinalData?.();
}

/** An item-level field of the use's copy: its source (for dnd5e's scaled copy) and the prepared value */
function changeItemField(item: Item.Implementation, path: string, source: unknown, prepared: unknown) {
  foundry.utils.setProperty(item._source, path, source);
  foundry.utils.setProperty(item, path, prepared);
}

const COMPONENTS = ["vocal", "somatic", "material"];

async function useConfigureChange(run: ActionRun, spec: Record<string, unknown>) {
  const workflow = run.context.workflow!;
  const activity = workflow.activity as Activity;
  const item = activity?.item as Item.Implementation | undefined;
  const usage = run.context.event?.usage as { spell?: { slot?: string }, midiOptions?: { spellLevel?: number } } | undefined;
  const rollData = run.conditionData;
  const updates: Record<string, unknown> = {};
  // A spell's activity takes these from the spell unless it overrides them
  if (typeof spec.activation === "string") Object.assign(updates, { "activation.type": spec.activation, "activation.override": true });
  for (const field of ["range", "duration"] as const) {
    const value = spec[field];
    if (value === undefined) continue;
    const current = (activity as unknown as Record<string, { value?: number | string, units?: string }>)[field] ?? {};
    updates[`${field}.override`] = true;
    if (current.units && !(typeof value === "object" && value && "units" in value)) updates[`${field}.units`] = current.units;
    if (typeof value === "object" && value) {
      const { value: v, units } = value as { value?: NumericChange, units?: string };
      if (units) updates[`${field}.units`] = units;
      if (v !== undefined) updates[`${field}.value`] = String(await changed(v, Number(current.value) || 0, rollData));
    } else updates[`${field}.value`] = String(await changed(value as NumericChange, Number(current.value) || 0, rollData));
  }
  if (Object.keys(updates).length) await changeActivity(activity, updates);
  if (item && spec.components !== undefined) {
    const remove = spec.components === "none" ? COMPONENTS : [spec.components].flat().map(String);
    // @ts-expect-error no dnd5e-types
    const properties: Set<string> = item.system.properties;
    const kept = [...properties].filter(p => !remove.includes(p));
    changeItemField(item, "system.properties", kept, new Set(kept));
  }
  if (item && typeof spec.school === "string") changeItemField(item, "system.school", spec.school, spec.school);
  if (item && usage && spec.spellLevel !== undefined) {
    // @ts-expect-error no dnd5e-types
    const base = Number(item.system.level) || 0;
    const level = typeof spec.spellLevel === "number" ? spec.spellLevel : await changed(String(spec.spellLevel).replace(/^\+/, "@value + "), base, rollData);
    if (level > 0) {
      usage.spell = { ...usage.spell, slot: `spell${level}` };
      usage.midiOptions = { ...usage.midiOptions, spellLevel: level };
    }
  }
}

/** The use's rolled damage of the listed types (all when `from` is omitted) becomes `to` ("@choices.x" read from the condition data) */
function damageTypeChange(run: ActionRun, spec: { from?: string | string[], to?: string }) {
  const workflow = run.context.workflow!;
  const to = typeof spec.to === "string" && spec.to.startsWith("@")
    ? String(foundry.utils.getProperty(run.conditionData, spec.to.slice(1)) ?? "") : spec.to;
  if (!to) return;
  const from = spec.from === undefined ? undefined : [spec.from].flat();
  for (const roll of workflow.damageRolls ?? []) {
    const options = roll.options as { type?: string };
    if (!from || from.includes(options.type ?? "")) options.type = to;
  }
}

/** `{ change: { activation?, range?, duration?, components?, school?, spellLevel?, damageType? } }` */
async function changeAction(run: ActionRun) {
  const spec = run.action.change as Record<string, unknown> | undefined;
  if (!run.context.workflow || !spec || typeof spec !== "object") return;
  if (run.eventId === "use.configure") await useConfigureChange(run, spec);
  else if (spec.damageType && ["use.damageRoll", "use.damageRolled"].includes(run.eventId)) damageTypeChange(run, spec.damageType as { from?: string[], to?: string });
  else console.warn(`midi-qol | entry ${run.found.entry.id}: change ${Object.keys(spec).join(", ")} can't be made at ${run.eventId}`);
}

/** The item holding the entry (an effect's: the item it came from) */
function entryItem(run: ActionRun): Item.Implementation | undefined {
  const document = run.found.document as { item?: Item.Implementation, parent?: unknown, origin?: string };
  if (document instanceof Item) return document;
  if (document instanceof ActiveEffect) return itemOfEffect(document);
  return document.item;
}

/** The creatures on the scene of the entry's actor */
function sceneActors(run: ActionRun): Actor.Implementation[] {
  const actor = run.found.actor ?? run.context.actor;
  const scene = (actor.getActiveTokens(false, true)[0] as TokenDocument.Implementation | undefined)?.parent ?? canvas?.scene;
  const actors = new Set<Actor.Implementation>();
  for (const token of scene?.tokens ?? []) if (token.actor) actors.add(token.actor);
  return [...actors];
}

/**
 * `{ effect: "apply" | "remove", what, to? }`: `what` a status id, an effect on the entry's item (its id or name), or
 * for remove `{ origin: "this item" }` (the effects the entry's item applied). `to` as `for` (default "self"), or
 * "anyone" (every creature on the scene).
 */
async function effectAction(run: ActionRun) {
  const mode = run.action.effect;
  const what = run.action.what;
  if (mode !== "apply" && mode !== "remove") return;
  // "anyone": every creature on the scene (removing what this item applied wherever it is: Emboldening Bond)
  const actors = run.action.to === "anyone" ? sceneActors(run) : actorsFor(run.action.to, run, "self");
  const item = entryItem(run);
  const status = typeof what === "string" ? CONFIG.statusEffects.find(s => s.id === what) : undefined;
  for (const actor of actors) {
    if (!actor.uuid) continue;
    if (status) {
      const has = actor.statuses.has(status.id);
      if ((mode === "apply") !== has) await unTimedExecuteAsGM("toggleStatusEffect", { actorUuid: actor.uuid, statusId: status.id, options: { active: mode === "apply" } });
      continue;
    }
    if (mode === "remove") {
      const origin = what && typeof what === "object" && "origin" in what ? item?.uuid : undefined;
      // Applied by the item or one of its activities
      const fromItem = (e: ActiveEffect.Implementation) => !!e.origin && (e.origin === origin || e.origin.startsWith(`${origin}.`));
      const ids = actor.effects.filter(e => origin ? fromItem(e) : (e.id === what || e.name === what)).map(e => e.id!);
      if (ids.length) await unTimedExecuteAsGM("removeEffects", { actorUuid: actor.uuid, effects: ids, options: { "expiry-reason": `midi-qol:entry:${run.found.entry.id}` } });
      continue;
    }
    const source = typeof what === "string" ? item?.effects.find(e => e.id === what || e.name === what) : undefined;
    if (!source) {
      console.warn(`midi-qol | entry ${run.found.entry.id}: no effect or status ${JSON.stringify(what)} to apply`);
      continue;
    }
    const data = source.toObject() as ActiveEffect.CreateData & Record<string, unknown>;
    delete data._id;
    Object.assign(data, { origin: item?.uuid, transfer: false, disabled: false });
    await unTimedExecuteAsGM("createEffects", { actorUuid: actor.uuid, effects: [data] });
  }
}

/** `{ table: TableDeclaration | uuid }`: drawn, and the drawn row's actions run as this entry's */
async function tableAction(run: ActionRun) {
  const spec = run.action.table;
  const declaration: TableDeclaration | undefined = typeof spec === "string" ? { id: run.found.entry.id, table: spec }
    : spec && typeof spec === "object" ? { id: run.found.entry.id, ...(spec as Omit<TableDeclaration, "id">) } : undefined;
  if (!declaration) return;
  const drawn = await rollTable(declaration, { workflow: run.context.workflow, rollData: run.conditionData, name: (run.found.document as { name?: string }).name });
  if (!drawn?.do?.length) return;
  const ran: string[] = [];
  const { action: _action, ...rest } = run;
  await runActions(drawn.do as EntryAction[], rest, ran);
}

/** Actions run for a use as its activity's own (a drawn table row of the activity's table) */
export async function runActivityActions(workflow: Workflow, id: string, list: readonly EntryAction[]): Promise<string[]> {
  const context = useContext(workflow);
  const found: FoundEntry = { entry: { id, on: "table", do: [...list] }, home: "activity", document: workflow.activity as unknown as FoundEntry["document"], who: "this", actor: workflow.actor };
  const ran: string[] = [];
  await runActions(list, { eventId: "table", found, context, conditionData: conditionDataFor(found, context) }, ran);
  return ran;
}

export function registerUseChanges() {
  registerAction("change", changeAction);
  registerAction("effect", effectAction);
  registerAction("table", tableAction);
}
