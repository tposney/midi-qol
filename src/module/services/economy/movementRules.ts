/* M6: the movement budget's pure parts (unit-tested) */

/** Allowed and remaining for a speed, the movement spent and the dashes taken */
export function movementBudget(spent: number, speed: number, dashes: number): { allowed: number, remaining: number } {
  const allowed = Math.max(0, speed) * (1 + Math.max(0, dashes));
  return { allowed, remaining: Math.max(0, allowed - Math.max(0, spent)) };
}

/** An activity that is a Dash or a Disengage: by its identifier or name, or its item's when it is the item's only one */
export function actionKindOf(activity: { name?: string | null, identifier?: string, item?: Item.Implementation } | undefined): "dash" | "disengage" | undefined {
  if (!activity) return undefined;
  const words = [activity.identifier, activity.name].map(w => String(w ?? "").trim().toLowerCase());
  const item = activity.item;
  const activities = (item?.system as { activities?: { size?: number } } | undefined)?.activities;
  if (item && (activities?.size ?? 0) <= 1) words.push(String((item.system as { identifier?: string }).identifier ?? "").toLowerCase());
  if (words.includes("dash")) return "dash";
  if (words.includes("disengage")) return "disengage";
  return undefined;
}

