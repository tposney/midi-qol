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
  // What a successful save does to each damage type, for the damage tray
  saveMults: "saveMults"
} as const;
export type StateKey = keyof typeof STATE_FIELDS;

/** The template a card section is drawn with when it stores none */
export const SECTION_TEMPLATES: Record<string, string> = {
  hits: "modules/midi-qol/templates/hits.html",
  saves: "modules/midi-qol/templates/saves.html"
};

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

/** What a save row shows that the roll and the token do not: the result as midi decided it */
export type SaveFacts = {
  saveTotal?: number | null,
  // Cover at the save; total cover from a module makes it automatic
  saveCover?: "half" | "threeQuarters" | "total", saveCoverAuto?: boolean,
  // Advantage mode, and why: [type, source, name]
  saveMode?: number | null, saveAttribution?: string[][],
  // For the damage tray: the damage calculation's Uncanny Dodge
  uncannyDodge?: boolean, uncannyDodgeIcon?: string,
  // For the damage tray: the other activity's and the ammunition's damage apply to this token (state.otherDamageMatched...)
  otherDamage?: boolean, ammunitionDamage?: boolean,
  // Targeted before the use (workflowOptions.preSelectedTargetUuids), by position
  preSelected?: number | null,
  // The hits row (hits.html) as the attack left it: AC and its modifiers at the time. Null clears the row.
  hitClass?: string | null, hitSymbol?: string | null, hitShowAC?: boolean | null, acDisplay?: string | null, acTooltip?: string | null,
  acIcons?: { img?: string, icon?: string, tooltip?: string, cssClass?: string, useDnd5eIcon?: boolean }[] | null
};
export type CardRecord = { uuid: string } & Partial<Record<RecordSet, boolean>> & SaveFacts;

export function cardStateSchema() {
  const { ArrayField, BooleanField, NumberField, ObjectField, SchemaField, StringField, TypedObjectField } = foundry.data.fields;
  // Unset fields are left out of the card, not stored as defaults
  const unset = { required: false, initial: undefined };
  const bool = () => new BooleanField(unset);
  const num = () => new NumberField({ ...unset, nullable: true });
  const str = () => new StringField({ ...unset, blank: true });
  return {
    state: new SchemaField({
      // Workflow class: a card with none recorded is never rebuilt. Where it waits is worked out (Workflow.cardResumePoint)
      workflowClass: str(),
      isCritical: bool(), isFumble: bool(),
      templateUuids: new ArrayField(new StringField(), unset),
      workflowOptions: new ObjectField(unset),
      saveMults: new ObjectField(unset),
      // The damage tray's matches have been worked out (the records say which tokens): absent, they apply to every target
      otherDamageMatched: bool(), ammunitionDamageMatched: bool()
    }, { required: false }),
    records: new TypedObjectField(new SchemaField({
      uuid: new StringField({ required: true, blank: false }),
      ...Object.fromEntries(Object.keys(RECORD_SETS).map(key => [key, bool()])),
      saveTotal: num(), saveCover: new StringField({ ...unset, choices: ["half", "threeQuarters", "total"] }), saveCoverAuto: bool(), saveMode: num(),
      saveAttribution: new ArrayField(new ArrayField(new StringField()), unset),
      uncannyDodge: bool(), uncannyDodgeIcon: str(),
      otherDamage: bool(), ammunitionDamage: bool(), preSelected: num(),
      ...Object.fromEntries(["hitClass", "hitSymbol", "acDisplay", "acTooltip"].map(key => [key, new StringField({ ...unset, blank: true, nullable: true })])),
      hitShowAC: new BooleanField({ ...unset, nullable: true }),
      acIcons: new ArrayField(new ObjectField(), { ...unset, nullable: true })
    }), { required: false })
  };
}

/** The old `flags.midi-qol` keys the state and records replace */
export const LEGACY_CARD_FLAG_KEYS = [...Object.values(STATE_FIELDS).filter(key => key !== "saveMults"), ...Object.values(RECORD_SETS), "templateUuid", "currentAction", "saveAttribution",
  "damageDetail", "otherDamageDetail", "bonusDamageDetail", "otherDamageMatchUuids", "ammunitionDamageMatchUuids",
  "isHit", "isHitEC", "otherDamageTotal", "bonusDamageTotal"];

/** The damage tray's matches: token uuids the other activity's (or the ammunition's) damage applies to; undefined until worked out */
export function cardDamageMatches(midi: { state?: Record<string, any>, records?: Record<string, CardRecord> } | undefined,
  kind: "otherDamage" | "ammunitionDamage"): string[] | undefined {
  if (!midi?.state?.[`${kind}Matched`]) return undefined;
  return Object.values(midi.records ?? {}).filter(record => record[kind]).map(record => record.uuid);
}

/** The tokens targeted before the use, in order */
export function cardPreSelected(records: Record<string, CardRecord> | undefined): string[] {
  return Object.values(records ?? {}).filter(record => record.preSelected).sort((a, b) => a.preSelected! - b.preSelected!).map(record => record.uuid);
}

/**
 * The old keys on a card's in-memory flags, as getters computing their value from the state and records when read,
 * each read warning that it is deprecated. Only keys the card does not really have (older cards keep theirs).
 */
export function defineLegacyCardFlags(flags: Record<string, unknown>, midi: Parameters<typeof legacyCardFlags>[0],
  derived: Record<string, () => unknown> = {}): void {
  if (!midi?.state?.workflowClass) return;
  let legacy: Record<string, unknown> | undefined;
  for (const key of LEGACY_CARD_FLAG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(flags, key)) continue;
    Object.defineProperty(flags, key, {
      configurable: true, enumerable: false,
      get() {
        foundry.utils.logCompatibilityWarning(`midi-qol | a usage card's flags.midi-qol.${key} is deprecated: read its system.midi.state and system.midi.records instead (MidiQOL.cardSaveRoll for a save roll).`,
          { since: "14.6.9", until: "14.8.0", once: true });
        return key in derived ? derived[key]() : (legacy ??= legacyCardFlags(midi))[key];
      }
    });
  }
}

/** A card's stored workflow state and records, if it has any */
export function cardMidiState(message: ChatMessage.Implementation | undefined): { state: Record<string, any>, records: Record<string, CardRecord> } | undefined {
  const midi = (message?.system as { midi?: { state?: Record<string, any>, records?: Record<string, CardRecord> } } | undefined)?.midi;
  return midi?.state?.workflowClass ? { state: midi.state, records: midi.records ?? {} } : undefined;
}

/**
 * midi's per-target detail for the damage tray's calculation (options.midi), from the card's records and state; older
 * cards held it on dnd5e's `system.targets` entries.
 */
export function cardTargetDetail(message: ChatMessage.Implementation | undefined, tokenUuid: string, descriptor: Record<string, any> = {}): Record<string, unknown> {
  const card = cardMidiState(message);
  if (!card || descriptor.saveMults) return descriptor;
  const record = card.records[tokenUuid.split(".").pop() ?? ""];
  // @ts-expect-error no dnd5e-types
  const itemType = message?.getAssociatedItem?.()?.type;
  return {
    ...descriptor, saved: !!record?.saved, superSaver: !!record?.superSaver, semiSuperSaver: !!record?.semiSuperSaver,
    saveMults: card.state.saveMults, itemType, uncannyDodge: !!record?.uncannyDodge, uncannyDodgeIcon: record?.uncannyDodgeIcon
  };
}

/**
 * Whether the attack on a card hit (the result players see on a masked card): with hits checked, any target hit;
 * otherwise the attack roll's own result against its target. Older cards stored it as `flags.midi-qol.isHit`.
 */
export function cardHitResult(message: ChatMessage.Implementation | undefined): boolean | undefined {
  const stored = storedMidiFlag(message, "isHit");
  if (stored !== undefined) return stored;
  const records = Object.values(cardMidiState(message)?.records ?? {});
  if (records.some(record => typeof record.hitClass === "string")) return records.some(record => record.hit || record.hitEC);
  const attack = (message?.rolls ?? []).find(roll => foundry.utils.getProperty(roll, "options.midi-qol.rollType") === "attack") as { isSuccess?: boolean } | undefined;
  return attack?.isSuccess;
}

/** The actor that used a card's activity: its own actor (dnd5e's), or the one a card stored (a damage-only workflow's) */
export function cardSourceActor(message: ChatMessage.Implementation | undefined): Actor.Implementation | undefined {
  const uuid = storedMidiFlag(message, "sourceActorUuid") as string | undefined;
  const stored = uuid ? fromUuidSync(uuid, { strict: false }) : undefined;
  if (stored instanceof Actor) return stored;
  const own = (message as { getAssociatedActor?: () => Actor.Implementation | null } | undefined)?.getAssociatedActor?.();
  return own ?? undefined;
}

/** A flag the card really has, not one of the deprecated getters */
export function storedMidiFlag(message: ChatMessage.Implementation | undefined, key: string): any {
  const flags = message?.flags?.["midi-qol"] as Record<string, unknown> | undefined;
  return flags ? Object.getOwnPropertyDescriptor(flags, key)?.value : undefined;
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
  if (flags.workflowOptions) flags.workflowOptions = { ...(flags.workflowOptions as object), preSelectedTargetUuids: cardPreSelected(midi?.records) };
  for (const kind of ["otherDamage", "ammunitionDamage"] as const) {
    const matches = cardDamageMatches(midi, kind);
    if (matches) flags[`${kind}MatchUuids`] = matches;
  }
  const records = Object.values(midi?.records ?? {});
  for (const [key, flag] of Object.entries(RECORD_SETS)) {
    const members = records.filter(record => record[key as RecordSet]);
    flags[flag] = key === "targets"
      ? members.map(({ uuid }) => ({ uuid, name: (fromUuidSync(uuid) as { name?: string } | null)?.name ?? "" }))
      : members.map(record => record.uuid);
  }
  const attribution = Object.fromEntries(records.filter(record => record.saveAttribution?.length)
    .map(record => [record.uuid, attributionMap(record.saveAttribution!)]));
  if (!foundry.utils.isEmpty(attribution)) flags.saveAttribution = attribution;
  return flags;
}

/** Attribution as [type, source, name] triples (a source can contain dots, which an update would split) */
export function attributionTriples(map: Record<string, Record<string, string>> | undefined): string[][] {
  return Object.entries(map ?? {}).flatMap(([type, sources]) => Object.entries(sources ?? {}).map(([source, name]) => [type, source, String(name)]));
}

export function attributionMap(triples: string[][] | undefined): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  for (const [type, source, name] of triples ?? []) (map[type] ??= {})[source] = name;
  return map;
}
