/** A roll hook's subject is this activity (by uuid: a clone made for the roll counts) */
export function isRollOf(subject: unknown, activity: { uuid: string }): boolean {
  return !!subject && typeof subject === "object" && "uuid" in subject && subject.uuid === activity.uuid;
}
