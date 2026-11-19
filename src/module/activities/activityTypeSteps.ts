import { allGlobalStepChanges, allSteps, type ActivityCapability } from "../steps/steps.js";
import { getFlow, insertAnchor } from "../steps/flows.js";
import { activityPolicy } from "./activityPrototype.js";

/*
 * The activity-type table (M24): for each dnd5e activity type, what it can do (from its type's fields) and the steps of
 * the standard flow that act for it (each step's `actsOn`). For the "which mechanism" guide (docs/which-mechanism.md,
 * where the table is generated into) and the TroubleShooter.
 */

/** A type's field for each capability; `area` is any type with a target (whether a use has one is its data) */
const FIELD_FOR: Readonly<Record<Exclude<ActivityCapability, "area">, string>> = {
  attack: "attack", damage: "damage", healing: "healing", save: "save", check: "check", utilityRoll: "roll", transform: "transform"
};

/** What an activity type can do, from its schema's fields */
export function activityTypeCapabilities(type: string): ActivityCapability[] {
  // @ts-expect-error no dnd5e-types
  const fields: Record<string, unknown> | undefined = CONFIG.DND5E.activityTypes[type]?.documentClass?.schema?.fields;
  if (!fields) return [];
  const capabilities = (Object.entries(FIELD_FOR) as [ActivityCapability, string][]).filter(([, field]) => field in fields).map(([capability]) => capability);
  if ("target" in fields) capabilities.push("area");
  return capabilities;
}

/** What a paired other activity brings to a use (Workflow hasSave, the damage roll steps) */
const FROM_OTHER_ACTIVITY: readonly ActivityCapability[] = ["damage", "healing", "save", "check"];

/** Types whose use is handed to another activity, which runs the steps (dnd5e: Cast's spell, Forward's activity) */
const HANDS_OVER: Readonly<Record<string, string>> = { cast: "the spell's activity", forward: "the activity it forwards to" };

export interface ActivityTypeSteps {
  type: string;
  automated: boolean;
  /** The use is handed to another activity, which runs its own steps */
  handsOverTo?: string;
  capabilities: ActivityCapability[];
  /** Step id → "acts" (always for the type) or "data" (when the use has it: an area, or a paired other activity) */
  steps: Record<string, "acts" | "data">;
}

/**
 * Each activity type against the standard flow's steps, with the steps modules insert for every use at their anchors
 * (a change's `when` may still leave them out of a use), then the reaction steps
 */
export function activityTypeSteps(flowId = "midi-qol.standard"): { steps: string[], types: ActivityTypeSteps[] } {
  const known = allSteps();
  const ids = [...(getFlow(flowId)?.steps ?? [])];
  for (const change of allGlobalStepChanges()) {
    if (change.kind !== "insert" || ids.includes(change.step)) continue;
    const side = change.before ? "before" : "after";
    const at = ids.indexOf(insertAnchor((change.before ?? change.after)!, side));
    if (at >= 0) ids.splice(side === "before" ? at : at + 1, 0, change.step);
  }
  ids.push(...known.filter(step => step.inline).map(step => step.id));
  const shownIds = ids.filter(id => known.some(step => step.id === id));
  const types: string[] = Object.keys(CONFIG.DND5E.activityTypes ?? {});
  return {
    steps: shownIds,
    types: types.map(type => {
      const policy = activityPolicy(type);
      const capabilities = activityTypeCapabilities(type);
      const steps: Record<string, "acts" | "data"> = {};
      if (!policy.automated || HANDS_OVER[type]) return { type, automated: policy.automated, handsOverTo: HANDS_OVER[type], capabilities, steps };
      for (const id of shownIds) {
        const actsOn = known.find(step => step.id === id)?.actsOn;
        if (!actsOn) { steps[id] = "acts"; continue; }
        const own = actsOn.filter(capability => capabilities.includes(capability));
        // An area is the use's data; damage, healing and saves can also come from the activity it is paired with
        if (own.some(capability => capability !== "area")) steps[id] = "acts";
        else if (own.length || actsOn.some(capability => FROM_OTHER_ACTIVITY.includes(capability))) steps[id] = "data";
      }
      return { type, automated: policy.automated, capabilities, steps };
    })
  };
}

/**
 * The table as Markdown: ✔ the step acts for the type, ◐ when the use's data has it (an area, a paired activity's
 * damage or save), blank: it passes the use on; then the types the table leaves out (handed over, not automated).
 */
export function activityTypeStepsMarkdown(flowId?: string): string {
  const { steps, types } = activityTypeSteps(flowId);
  const shown = types.filter(t => t.automated && !t.handsOverTo);
  const short = (id: string) => id.replace(/^midi-qol\./, "");
  const header = `| step | ${shown.map(t => t.type).join(" | ")} |`;
  const rule = `|---|${shown.map(() => ":-:").join("|")}|`;
  const rows = steps.map(id => `| ${short(id)} | ${shown.map(t => t.steps[id] === "acts" ? "✔" : t.steps[id] === "data" ? "◐" : "").join(" | ")} |`);
  const notes = types.filter(t => !shown.includes(t))
    .map(t => t.handsOverTo ? `- ${t.type}: its use is handed to ${t.handsOverTo}, whose column applies` : `- ${t.type}: not automated (no midi workflow)`);
  return [header, rule, ...rows, "", ...notes].join("\n");
}
