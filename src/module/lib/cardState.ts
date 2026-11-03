/**
 * The workflow's state on its usage card: `system.midi.state` (scalars) and `system.midi.records` (one record per
 * token, keyed by token id; a token set is the records with its field set). Read back when a workflow is rebuilt from
 * its card, and offered under the old `flags.midi-qol` names to anything that still reads those (legacyCardFlags).
 */

/**
 * Workflow scalar fields: state key, and its old flag name. Only what a rebuilt workflow cannot work out from its card
 * (rolls, activity) and the canvas, or what other readers need (the damage tray's matches).
 */
export const STATE_FIELDS = {
  isCritical: "isCritical",
  isFumble: "isFumble",
  templateUuids: "templateUuids",
  workflowOptions: "workflowOptions",
  // As macros left them: worked out again they could lose a macro's change
  damageDetail: "damageDetail",
  otherDamageDetail: "otherDamageDetail",
  bonusDamageDetail: "bonusDamageDetail",
  // Null until worked out; empty when no target matched (the damage tray tells the two apart)
  otherDamageMatchUuids: "otherDamageMatchUuids",
  ammunitionDamageMatchUuids: "ammunitionDamageMatchUuids"
} as const;
export type StateKey = keyof typeof STATE_FIELDS;

/** Workflow token sets: record field, and its old flag name (a uuid array). Macros change them, so they are stored. */
export const RECORD_SETS = {
  targets: "targets",
  hit: "hitTargetUuids",
  hitEC: "hitECTargetUuids",
  saved: "saveUuids",
  superSaver: "superSaverUuids",
  semiSuperSaver: "semiSuperSaverUuids",
  failedSave: "failedSaveUuids",
  fumbleSave: "fumbleSaveUuids",
  criticalSave: "criticalSaveUuids",
  advantageSave: "advantageSaveUuids"
} as const;
export type RecordSet = keyof typeof RECORD_SETS;

export type CardRecord = { uuid: string, saveAttribution?: Record<string, unknown> } & Partial<Record<RecordSet, boolean>>;

export function cardStateSchema() {
  const { ArrayField, BooleanField, ObjectField, SchemaField, StringField, TypedObjectField } = foundry.data.fields;
  // Unset fields are left out of the card, not stored as defaults
  const unset = { required: false, initial: undefined };
  const bool = () => new BooleanField(unset);
  const str = () => new StringField({ ...unset, blank: true });
  const details = () => new ArrayField(new ObjectField(), unset);
  return {
    state: new SchemaField({
      // Workflow class and state name: a card with none recorded is never rebuilt
      workflowClass: str(),
      action: str(),
      isCritical: bool(), isFumble: bool(),
      templateUuids: new ArrayField(new StringField(), unset),
      workflowOptions: new ObjectField(unset),
      damageDetail: details(), otherDamageDetail: details(), bonusDamageDetail: details(),
      otherDamageMatchUuids: new ArrayField(new StringField(), { ...unset, nullable: true }),
      ammunitionDamageMatchUuids: new ArrayField(new StringField(), { ...unset, nullable: true })
    }, { required: false }),
    records: new TypedObjectField(new SchemaField({
      uuid: new StringField({ required: true, blank: false }),
      ...Object.fromEntries(Object.keys(RECORD_SETS).map(key => [key, bool()])),
      saveAttribution: new ObjectField(unset)
    }), { required: false })
  };
}

/** The old `flags.midi-qol` keys, from a card's state and records */
export function legacyCardFlags(midi: { state?: Record<string, any>, records?: Record<string, CardRecord> } | undefined): Record<string, unknown> {
  const state = midi?.state;
  if (!state?.workflowClass) return {};
  const flags: Record<string, unknown> = {};
  for (const [key, flag] of Object.entries(STATE_FIELDS)) {
    const value = state[key];
    if (value !== null && value !== undefined && value !== "") flags[flag] = value;
  }
  flags.templateUuid = state.templateUuids?.[0] ?? "";
  flags.currentAction = [state.workflowClass, state.action];
  const records = Object.values(midi?.records ?? {});
  for (const [key, flag] of Object.entries(RECORD_SETS)) {
    const members = records.filter(record => record[key as RecordSet]);
    flags[flag] = key === "targets"
      ? members.map(({ uuid }) => ({ uuid, name: (fromUuidSync(uuid) as { name?: string } | null)?.name ?? "" }))
      : members.map(record => record.uuid);
  }
  const attribution = Object.fromEntries(records.filter(record => record.saveAttribution && !foundry.utils.isEmpty(record.saveAttribution))
    .map(record => [record.uuid, record.saveAttribution]));
  if (!foundry.utils.isEmpty(attribution)) flags.saveAttribution = attribution;
  return flags;
}
