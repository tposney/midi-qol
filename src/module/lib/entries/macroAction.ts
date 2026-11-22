import type { Activity } from "../../../globals.js";
import { resolveActivityMacro, resolveItemMacro } from "../../utils.js";
import { entryItem } from "./config.js";
import { registerAction, type ActionRun } from "./engine.js";

/*
 * { macro: "ItemMacro" | "ActivityMacro" | "<world macro name or uuid>" }: an entry runs a macro. During a use it is
 * called as midi's on-use macros are (the workflow's arguments, macroPass "entry.<event>", tag "Entry"); otherwise
 * (an effect's turn end, a region event) the macro runs with the event's data in scope.
 */

/** The macro's name with nothing given: the item's own */
export function macroName(action: { macro?: unknown }): string {
  return typeof action.macro === "string" && action.macro.trim() ? action.macro.trim() : "ItemMacro";
}

type ActivityLike = { item?: Item.Implementation, id?: string };

async function macroAction(run: ActionRun) {
  const name = macroName(run.action as { macro?: unknown });
  const item = entryItem(run.found) ?? run.context.item;
  const own = (run.found.document as ActivityLike).item ? run.found.document as unknown as Activity : run.context.activity;
  const data = { entryId: run.found.entry.id, entryEvent: run.eventId, target: run.context.target, event: run.context.event };
  const workflow = run.context.workflow;
  if (workflow) {
    await workflow.callMacros(item, name, "Entry", `entry.${run.eventId}`, data);
    return;
  }
  let macro: Macro.Implementation | undefined;
  if (name === "ItemMacro" || name.startsWith("ItemMacro.")) {
    const resolved = await resolveItemMacro(name, { actor: run.found.actor, originItem: item });
    if (resolved) macro = globalThis.DAE?.createSyntheticMacro(String(resolved.macroData.command), String(resolved.macroData.name));
  } else if (name === "ActivityMacro" || name.startsWith("ActivityMacro")) {
    macro = (await resolveActivityMacro(name, { originItem: item, originActivity: own }))?.macro;
  } else macro = await globalThis.DAE?.resolveWorldMacro(name);
  if (!macro) {
    console.warn(`midi-qol | entry ${run.found.entry.id}: macro "${name}" not found`);
    return;
  }
  const actor = run.context.actor;
  await macro.execute({ actor, token: actor.getActiveTokens()[0], item, activity: own, entry: run.found.entry, ...data } as never);
}

export function registerMacroAction() {
  registerAction("macro", macroAction);
}
