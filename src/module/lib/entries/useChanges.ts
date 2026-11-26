import { tokenFor } from "../tokenResolver.js";
import { i18n } from "../../../midi-qol.js";
import type { Activity } from "../../../globals.js";
import { unTimedExecuteAsGM } from "../../GMAction.js";
import { rollTable, type TableDeclaration } from "../tables.js";
import { conditionDataFor, registerAction, runActions, type ActionRun } from "./engine.js";
import type { Workflow } from "../../Workflow.js";
import type { FoundEntry } from "./types.js";
import type { EntryAction } from "./types.js";
import { actorsFor, useContext } from "./useEvents.js";
import { itemOfEffect } from "./rules.js";
import { planConditionRemoval, type EffectFacts } from "./conditionRemoval.js";
import { isEffectFilter, judgeEffect, type EffectFilter, type EffectFacts as FilterFacts } from "./effectFilter.js";
import { directRoll } from "./activityActions.js";
import { askUser, registerRequestHandler, type IncomingRequest } from "../requests.js";
import { MODULE_ID } from "../../../midi-qol.js";

/*
 * M15 stage 4b: the actions that change a use or act for it.
 * - `change` at `use.configure` changes the use before dnd5e's use runs: on the use's own copy of the item, so only this
 *   use is affected (the copy's source, so dnd5e's scaled copy for an upcast keeps it). `damageType` / `damageDie`
 *   before the damage is rolled (use.configure, use.targeted) change the activity's damage parts, so the damage is
 *   rolled as that; at `use.damageRoll` / `use.damageRolled` they relabel the rolled damage and work it out again.
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
  const item = (workflow.activity as Activity)?.item as Item.Implementation | undefined;
  const usage = run.context.event?.usage as { spell?: { slot?: string }, midiOptions?: { spellLevel?: number }, scaling?: number | false } | undefined;
  // After dnd5e's usage dialog (an entry chosen at casting) the level is the one cast: raised first, as that rebuilds
  // the copy's activities and the other changes are made on the rebuilt one
  if (run.context.event?.afterDialog && item && usage && spec.spellLevel !== undefined) {
    // @ts-expect-error no dnd5e-types
    const base = Number(item.system.level) || 0;
    const cast = base + (Number(usage.scaling) || 0);
    const level = typeof spec.spellLevel === "number" ? spec.spellLevel : await changed(String(spec.spellLevel).replace(/^\+/, "@value + "), cast, run.conditionData);
    if (level > 9) {
      ui.notifications?.warn(i18n("midi-qol.Entries.Casting.LevelMax").replace("{name}", run.found.entry.label ?? run.found.entry.id));
      workflow.aborted = true;
      return;
    }
    if (level > cast) {
      usage.scaling = level - base;
      item.updateSource({ "flags.dnd5e.scaling": level - base } as never);
      (item as unknown as { prepareFinalAttributes?(): void }).prepareFinalAttributes?.();
      // @ts-expect-error no dnd5e-types
      const rebuilt = item.system.activities?.get(workflow.activity?.id) as Activity | undefined;
      if (rebuilt) workflow.activity = rebuilt;
    }
  }
  const activity = workflow.activity as Activity;
  const rollData = run.conditionData;
  const updates: Record<string, unknown> = {};
  // A spell's activity takes these from the spell unless it overrides them
  if (typeof spec.activation === "string") Object.assign(updates, { "activation.type": spec.activation, "activation.override": true });
  for (const field of ["range", "duration"] as const) {
    const value = spec[field];
    if (value === undefined) continue;
    const current = (activity as unknown as Record<string, { value?: number | string, units?: string, concentration?: boolean }>)[field] ?? {};
    updates[`${field}.override`] = true;
    // An overridden duration is the activity's own: it keeps the spell's concentration
    if (field === "duration" && current.concentration !== undefined) updates["duration.concentration"] = current.concentration;
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
  if (item && usage && spec.spellLevel !== undefined && !run.context.event?.afterDialog) {
    // @ts-expect-error no dnd5e-types
    const base = Number(item.system.level) || 0;
    const level = typeof spec.spellLevel === "number" ? spec.spellLevel : await changed(String(spec.spellLevel).replace(/^\+/, "@value + "), base, rollData);
    if (level > 0) {
      usage.spell = { ...usage.spell, slot: `spell${level}` };
      usage.midiOptions = { ...usage.midiOptions, spellLevel: level };
    }
  }
}

/** A damage type change's target type ("@config.x": read from the condition data) */
function damageTypeTo(run: ActionRun, spec: { to?: string }): string {
  return typeof spec.to === "string" && spec.to.startsWith("@") ? String(foundry.utils.getProperty(run.conditionData, spec.to.slice(1)) ?? "") : spec.to ?? "";
}

/** Before the damage roll: the activity's damage parts of the listed types (all when `from` is omitted) are rolled as `to` */
async function damagePartTypeChange(run: ActionRun, spec: { from?: string | string[], to?: string }) {
  const activity = run.context.workflow?.activity as Activity | undefined;
  const parts = (activity as unknown as { _source?: { damage?: { parts?: { types?: string[] }[] } } } | undefined)?._source?.damage?.parts;
  const to = damageTypeTo(run, spec);
  if (!activity || !parts?.length || !to) return;
  const from = spec.from === undefined ? undefined : [spec.from].flat();
  let any = false;
  const changedParts = parts.map(part => {
    const types = part.types ?? [];
    if (from && !types.some(t => from.includes(t))) return part;
    any = true;
    return { ...part, types: from ? [...new Set(types.map(t => from.includes(t) ? to : t))] : [to] };
  });
  if (any) await changeActivity(activity, { "damage.parts": changedParts });
}

/** The use's rolled damage of the listed types (all when `from` is omitted) becomes `to` ("@choices.x" read from the condition data) */
function damageTypeChange(run: ActionRun, spec: { from?: string | string[], to?: string }) {
  const workflow = run.context.workflow!;
  const to = damageTypeTo(run, spec);
  if (!to) return;
  const from = spec.from === undefined ? undefined : [spec.from].flat();
  let changed = false;
  for (const roll of workflow.damageRolls ?? []) {
    const options = roll.options as { type?: string };
    if ((!from || from.includes(options.type ?? "")) && options.type !== to) { options.type = to; changed = true; }
  }
  // Once rolled, the damage to apply was worked out from the rolls: work it out again, or only the label changes
  if (changed && run.eventId === "use.damageRolled") {
    workflow.deriveDamage();
    workflow.damageDetail = foundry.utils.deepClone(workflow.rawDamageDetail);
    workflow.syncDamageMessages();
  }
}

/** Before the damage roll: every damage die of the use's activity becomes `d<die>` (counts and scaling kept) */
async function damageDieChange(run: ActionRun, die: number) {
  const activity = run.context.workflow?.activity as Activity | undefined;
  const source = (activity as unknown as { _source?: { damage?: { parts?: { denomination?: number | null, custom?: { enabled?: boolean, formula?: string } }[] } } } | undefined)?._source;
  const parts = source?.damage?.parts;
  if (!activity || !parts?.length || !Number.isInteger(die) || die < 2) return;
  const changed = parts.map(part => part.custom?.enabled
    ? { ...part, custom: { ...part.custom, formula: (part.custom.formula ?? "").replace(/(\d*)d\d+/g, `$1d${die}`) } }
    : { ...part, denomination: die });
  await changeActivity(activity, { "damage.parts": changed });
}

/** Where a damage die can still change: before the use's damage is rolled */
const BEFORE_DAMAGE = new Set(["use.configure", "use.targeted"]);

/** `{ change: { activation?, range?, duration?, components?, school?, spellLevel?, damageType?, damageDie? } }` */
async function changeAction(run: ActionRun) {
  const spec = run.action.change as Record<string, unknown> | undefined;
  if (!run.context.workflow || !spec || typeof spec !== "object") return;
  if (spec.damageDie !== undefined) {
    if (BEFORE_DAMAGE.has(run.eventId)) await damageDieChange(run, Number(spec.damageDie));
    else console.warn(`midi-qol | entry ${run.found.entry.id}: change damageDie can't be made at ${run.eventId} (use.configure or use.targeted)`);
    if (Object.keys(spec).length === 1) return;
  }
  // Before the damage is rolled: the parts are rolled as the new type (nothing to work out again afterwards)
  if (spec.damageType && BEFORE_DAMAGE.has(run.eventId)) {
    await damagePartTypeChange(run, spec.damageType as { from?: string[], to?: string });
    const rest = Object.keys(spec).filter(k => k !== "damageType" && k !== "damageDie");
    if (!rest.length) return;
  }
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
  const scene = tokenFor(actor)?.parent ?? canvas?.scene;
  const actors = new Set<Actor.Implementation>();
  for (const token of scene?.tokens ?? []) if (token.actor) actors.add(token.actor);
  return [...actors];
}

/**
 * `{ effect: "apply" | "remove", what, to? }`: `what` a status id, an effect on the entry's item (its id or name), or
 * for remove `{ origin: "this item" }` (the effects the entry's item applied). `to` as `for` (default "self"), or
 * "anyone" (every creature on the scene).
 */
type StatusConfig = { id: string, _id?: string, riders?: string[] };
/** A status by id (CONFIG.statusEffects is a list, with lookup by id in Foundry 14) */
function statusConfig(id: string): StatusConfig | undefined {
  const all = CONFIG.statusEffects as unknown as StatusConfig[] & Record<string, StatusConfig | undefined>;
  return all[id] ?? (Array.isArray(all) ? all.find(status => status.id === id) : undefined);
}

/**
 * The condition ends on the actor (lib/entries/conditionRemoval.ts): every effect of its own that carries the status,
 * not only dnd5e's bare status effect. An item's transfer effect is the item's and is left. `whole`: an effect that
 * carries more ends too, in place of losing just the status.
 */
export async function endCondition(actor: Actor.Implementation, statusId: string, { whole = false, reason }: { whole?: boolean, reason?: string } = {}): Promise<boolean> {
  if (!actor.uuid) return false;
  const facts: EffectFacts[] = actor.effects.map(effect => ({
    id: effect.id ?? "", uuid: effect.uuid ?? undefined, statuses: [...effect.statuses],
    hasChanges: ((effect.system as { changes?: unknown[] } | undefined)?.changes ?? []).length > 0,
    dependsOn: (effect.flags as Record<string, { dependentOn?: string } | undefined>).dnd5e?.dependentOn
  }));
  const plan = planConditionRemoval(facts, statusId, status => statusConfig(status)?.riders ?? [], whole);
  if (!plan.delete.length && !plan.strip.length) return false;
  // dnd5e's own status effect has a fixed id: removed through the actor's effect queue (midi's toggle)
  const bare = statusConfig(statusId)?._id;
  const ids = plan.delete.filter(id => id !== bare);
  if (bare && plan.delete.includes(bare)) await unTimedExecuteAsGM("toggleStatusEffect", { actorUuid: actor.uuid, statusId, options: { active: false } });
  if (ids.length) await unTimedExecuteAsGM("removeEffects", { actorUuid: actor.uuid, effects: ids, options: reason ? { "expiry-reason": reason } : {} });
  if (plan.strip.length) await unTimedExecuteAsGM("updateEffects", { actorUuid: actor.uuid, updates: plan.strip.map(({ id, statuses }) => ({ _id: id, statuses })) });
  return true;
}

/** `what` as a list: one value, several, or an entry's choice ("@choices.<id>": the conditions chosen) */
function whatList(run: ActionRun): unknown[] {
  const what = run.action.what;
  if (typeof what === "string" && what.startsWith("@choices.")) {
    const chosen = (run.conditionData.choices as Record<string, unknown> | undefined)?.[what.slice("@choices.".length)];
    return chosen === undefined || chosen === "" ? [] : [chosen].flat();
  }
  return Array.isArray(what) ? what : [what];
}

/* Ending effects by what they are (lib/entries/effectFilter.ts) */

const END_EFFECT_REQUEST = "midi-qol.endEffect";

type SpellFlags = { castData?: { castLevel?: number, baseLevel?: number } };

/** What an effect on `actor` is, for a filter */
function filterFacts(effect: ActiveEffect.Implementation, actor: Actor.Implementation): FilterFacts {
  const midi = (effect.flags as Record<string, SpellFlags | undefined>)[MODULE_ID];
  const dnd5e = (effect.flags as Record<string, { spellLevel?: number | { value?: number }, item?: { type?: string } } | undefined>).dnd5e;
  const item = itemOfEffect(effect) as (Item.Implementation & { system: { level?: number, duration?: { units?: string } } }) | undefined;
  // dnd5e's item types (spell) aren't in the core types
  const itemType: string | undefined = item?.type;
  const fromSpell = itemType === "spell" || dnd5e?.item?.type === "spell";
  const flagged = typeof dnd5e?.spellLevel === "number" ? dnd5e.spellLevel : dnd5e?.spellLevel?.value;
  const level = midi?.castData?.castLevel ?? midi?.castData?.baseLevel ?? flagged ?? (itemType === "spell" ? item?.system.level : undefined);
  const isSpell = fromSpell || !!midi?.castData || flagged !== undefined;
  const creator = item?.actor;
  return {
    statuses: [...effect.statuses],
    changeKeys: ((effect.system as { changes?: { key?: string }[] } | undefined)?.changes ?? []).map(c => c.key ?? ""),
    ...(isSpell ? { spell: { ...(typeof level === "number" ? { level } : {}), instantaneous: itemType === "spell" && item?.system.duration?.units === "inst" } } : {}),
    originType: (creator?.system as { details?: { type?: { value?: string } } } | undefined)?.details?.type?.value,
    concentration: effect.statuses.has("concentrating"),
    fromOwnItem: !!effect.transfer && !!creator && creator === actor
  };
}

/** The GM decides an effect whose spell level isn't known */
async function gmEnds(effect: ActiveEffect.Implementation, actor: Actor.Implementation, label: string): Promise<boolean> {
  const gm = game.users?.activeGM;
  if (!gm) return false;
  const request = askUser<boolean>(gm, {
    type: END_EFFECT_REQUEST, data: { effect: effect.name, actor: actor.name, label }, kind: "endEffect", actorUuid: actor.uuid ?? undefined,
    label: `${label}: ${effect.name}`, timeoutMs: 0, fallback: () => false
  });
  try { return !!(await request.settled).value; } catch { return false; }
}

async function answerEndEffect(data: { effect: string, actor: string, label: string }, request: IncomingRequest): Promise<boolean> {
  const content = `<p>${foundry.utils.escapeHTML(game.i18n?.format("midi-qol.EndEffect.Ask", { effect: data.effect, actor: data.actor }) ?? "")}</p>`;
  const yes = await foundry.applications.api.DialogV2.confirm({ window: { title: data.label }, content, rejectClose: false });
  if (request.settledHow || !await request.claim()) return false;
  return !!yes;
}

/** A number, or a formula over the condition data (`@use.spellLevel`) */
async function filterNumber(value: unknown, run: ActionRun): Promise<number | undefined> {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  try { return (await new Roll(value, run.conditionData).evaluate()).total ?? undefined; } catch { return undefined; }
}

/**
 * The effects on `actor` the filter ends: at or below its level, by the user's spellcasting check above it (`check`),
 * the GM's call where the level isn't known. A spell's effect on this creature only (Sage Advice SA183), unless the
 * world's DispelEndsWholeSpell: then the caster's concentration on it ends, and with it the spell everywhere.
 */
async function removeByFilter(run: ActionRun, actor: Actor.Implementation, spec: EffectFilter & { maxLevel?: unknown }) {
  const filter: EffectFilter = { ...spec, maxLevel: await filterNumber(spec.maxLevel, run) };
  const user = run.found.actor ?? run.context.actor;
  const label = typeof run.action.label === "string" ? run.action.label : (run.found.document as { name?: string }).name ?? run.found.entry.id;
  const ended: ActiveEffect.Implementation[] = [];
  for (const effect of actor.effects.contents) {
    const verdict = judgeEffect(filterFacts(effect, actor), filter);
    if (verdict.verdict === "end") ended.push(effect);
    else if (verdict.verdict === "ask" && await gmEnds(effect, actor, label)) ended.push(effect);
    else if (verdict.verdict === "check" && user) {
      const ability = (user.system as { attributes?: { spellcasting?: string } }).attributes?.spellcasting || "int";
      if (await directRoll(user, "check", { ability, dc: 10 + verdict.level }, run.conditionData)) ended.push(effect);
    }
  }
  if (!ended.length || !actor.uuid) return;
  const reason = { "expiry-reason": `midi-qol:entry:${run.found.entry.id}` };
  await unTimedExecuteAsGM("removeEffects", { actorUuid: actor.uuid, effects: ended.map(e => e.id!), options: reason });
  if (!game.settings?.get(MODULE_ID, "DispelEndsWholeSpell")) return;
  // The whole spell: the concentration it depends on
  for (const effect of ended) {
    const on = (effect.flags as Record<string, { dependentOn?: string } | undefined>).dnd5e?.dependentOn;
    const concentration = on ? fromUuidSync(on, { strict: false }) : undefined;
    if (concentration instanceof ActiveEffect && concentration.parent instanceof Actor && concentration.parent.uuid)
      await unTimedExecuteAsGM("removeEffects", { actorUuid: concentration.parent.uuid, effects: [concentration.id!], options: reason });
  }
}

async function effectAction(run: ActionRun) {
  const mode = run.action.effect;
  if (mode !== "apply" && mode !== "remove") return;
  // Several things to apply or remove (a list, or the conditions an entry's choice picked): each in turn
  const list = whatList(run);
  if (list.length !== 1 || list[0] !== run.action.what) {
    for (const what of list) await effectAction({ ...run, action: { ...run.action, what } });
    return;
  }
  const what = run.action.what;
  // "anyone": every creature on the scene (removing what this item applied wherever it is: Emboldening Bond)
  const actors = run.action.to === "anyone" ? sceneActors(run) : actorsFor(run.action.to, run, "self");
  const item = entryItem(run);
  const status = typeof what === "string" ? statusConfig(what) : undefined;
  for (const actor of actors) {
    if (!actor.uuid) continue;
    if (status) {
      // Removing a condition ends it wherever it comes from, not only dnd5e's bare status
      if (mode === "remove") await endCondition(actor, status.id, { whole: run.action.whole === true, reason: `midi-qol:entry:${run.found.entry.id}` });
      else if (!actor.statuses.has(status.id)) await unTimedExecuteAsGM("toggleStatusEffect", { actorUuid: actor.uuid, statusId: status.id, options: { active: true } });
      continue;
    }
    if (mode === "remove" && isEffectFilter(what)) {
      await removeByFilter(run, actor, what as EffectFilter);
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
    // dependsOn "concentration": lasts while the actor concentrates on the use's item; not applied without it
    if (run.action.dependsOn === "concentration") {
      const used = run.context.workflow?.item?.uuid;
      const effects = [...((actor as Actor.Implementation & { concentration?: { effects?: Set<ActiveEffect.Implementation> } }).concentration?.effects ?? [])];
      const concentration = effects.find(e => typeof e.origin === "string" && !!used && e.origin.startsWith(used));
      if (!concentration?.uuid) continue;
      foundry.utils.setProperty(data, "flags.dnd5e.dependentOn", concentration.uuid);
    }
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
  registerRequestHandler(END_EFFECT_REQUEST, answerEndEffect);
  registerAction("table", tableAction);
}
