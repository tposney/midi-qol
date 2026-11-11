import type { MidiCardSection } from "../ChatClasses/UsageCardMessage.js";
/**
 * The workflow's state on its usage card: `system.midi.state` (scalars) and `system.midi.records` (one record per
 * token, keyed by scene id then token id, as a duplicated scene keeps its token ids; a token set is the records with its
 * field set). Read back when a workflow is rebuilt from its card.
 */

/**
 * Workflow scalars stored in `system.midi.state`: only what a rebuilt workflow cannot work out from its card (rolls,
 * activity) and the canvas, or what other readers need (the damage tray's matches).
 */
export const STATE_KEYS = [
  "isCritical",
  "isFumble",
  "templateUuids",
  "workflowOptions",
  // What a successful save does to each damage type, for the damage tray
  "saveMults",
  "damageOnly",
  // The other activity's consumption: what it consumed (for the card's refund), or declined/skipped; its scaling
  "otherConsumed",
  "otherDeclined",
  "otherScaling",
  // The ammunition's data when its last piece was spent (autoDestroy): the use's damage still rolls with it
  "ammunitionData",
  // When the use started: the actor in a combat, and on its turn
  "inCombat",
  "isTurn",
  // Concentration the use begins once it can no longer be cancelled (MidiActivityMixin)
  "deferredConcentration",
  // What the use changed in its item and activity, JSON (lib/useChanges.ts)
  "useChanges"
] as const;
export type StateKey = typeof STATE_KEYS[number];

/** Workflow token sets: record field, and its old flag name (a uuid array; `targets` was `{uuid, name}`). Macros change them, so they are stored. */
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

/** A token's facts on the card besides its sets: its save row, hits row and damage-tray matches, as midi decided them */
export type RecordFacts = {
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
export type CardRecord = { uuid: string } & Partial<Record<RecordSet, boolean>> & RecordFacts;

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
      otherDamageMatched: bool(), ammunitionDamageMatched: bool(),
      // A damage roll on its own (Workflow#damageOnly)
      damageOnly: bool(),
      otherConsumed: new ObjectField({ ...unset, nullable: true }), otherDeclined: bool(), otherScaling: num(),
      ammunitionData: new ObjectField(unset),
      inCombat: bool(), isTurn: bool(),
      deferredConcentration: new ObjectField({ ...unset, nullable: true }),
      useChanges: new StringField({ ...unset, blank: true, nullable: true })
    }, { required: false }),
    records: new TypedObjectField(new TypedObjectField(new SchemaField({
      uuid: new StringField({ required: true, blank: false }),
      ...Object.fromEntries(Object.keys(RECORD_SETS).map(key => [key, bool()])),
      saveTotal: num(), saveCover: new StringField({ ...unset, choices: ["half", "threeQuarters", "total"] }), saveCoverAuto: bool(), saveMode: num(),
      saveAttribution: new ArrayField(new ArrayField(new StringField()), unset),
      uncannyDodge: bool(), uncannyDodgeIcon: str(),
      otherDamage: bool(), ammunitionDamage: bool(), preSelected: num(),
      ...Object.fromEntries(["hitClass", "hitSymbol", "acDisplay", "acTooltip"].map(key => [key, new StringField({ ...unset, blank: true, nullable: true })])),
      hitShowAC: new BooleanField({ ...unset, nullable: true }),
      acIcons: new ArrayField(new ObjectField(), { ...unset, nullable: true })
    })), { required: false })
  };
}

/** A card's records: by scene id, then token id */
export type CardRecords = Record<string, Record<string, CardRecord>>;

/** Where a token's record is written: `system.midi.records.<sceneId>.<tokenId>` */
export function recordPath(document: TokenDocument.Implementation): string | undefined {
  const sceneId = document.parent?.id;
  return sceneId && document.id ? `system.midi.records.${sceneId}.${document.id}` : undefined;
}

/** Every record on a card */
export function recordList(records: CardRecords | undefined): CardRecord[] {
  return Object.values(records ?? {}).flatMap(scene => Object.values(scene ?? {}));
}

/** The record of the token with this uuid */
export function recordFor(records: CardRecords | undefined, tokenUuid: string): CardRecord | undefined {
  return recordList(records).find(record => record.uuid === tokenUuid);
}

/**
 * The other activity's consumption on a card: what it consumed, false when declined or skipped, undefined until settled;
 * and the scaling it was used at. Cards before 14.6.9 kept them as `flags.midi-qol.use.consumed`/`use.otherScaling`.
 */
export function cardOtherConsumption(message: ChatMessage.Implementation | undefined | null): { consumed?: object | false, scaling?: number } {
  const state = cardMidi(message).state;
  if (state?.otherDeclined) return { consumed: false };
  if (state?.otherConsumed) return { consumed: state.otherConsumed, scaling: state.otherScaling ?? undefined };
  const use = storedMidiFlag(message ?? undefined, "use") as { consumed?: object | false, otherScaling?: number | false } | undefined;
  return { consumed: use?.consumed, scaling: use?.otherScaling || undefined };
}

/** The damage tray's matches: token uuids the other activity's (or the ammunition's) damage applies to; undefined until worked out */
export function cardDamageMatches(midi: { state?: Record<string, any>, records?: CardRecords } | undefined,
  kind: "otherDamage" | "ammunitionDamage"): string[] | undefined {
  if (!midi?.state?.[`${kind}Matched`]) return undefined;
  return recordList(midi.records).filter(record => record[kind]).map(record => record.uuid);
}

/** The tokens targeted before the use, in order */
export function cardPreSelected(records: CardRecords | undefined): string[] {
  return recordList(records).filter(record => record.preSelected).sort((a, b) => a.preSelected! - b.preSelected!).map(record => record.uuid);
}

/** A card's stored workflow state and records, if it has any */
export function cardMidiState(message: ChatMessage.Implementation | undefined): { state: Record<string, any>, records: CardRecords } | undefined {
  const midi = cardMidi(message);
  return midi.state?.workflowClass ? { state: midi.state, records: midi.records ?? {} } : undefined;
}

/** The type midi tags a roll with (`options.midi-qol.rollType`): attack, defaultDamage, bonusDamage, otherDamage, utility, save */
export function rollTypeOf(roll: unknown): string | undefined {
  const type = foundry.utils.getProperty(roll as object, "options.midi-qol.rollType");
  return typeof type === "string" ? type : undefined;
}

/** The rolls tagged with one of `types` */
export function rollsOfType(rolls: readonly Roll[] | undefined, types: string | readonly string[]): Roll[] {
  const wanted = typeof types === "string" ? [types] : types;
  return (rolls ?? []).filter(roll => wanted.includes(rollTypeOf(roll) ?? ""));
}

/** A card's attack roll, found by its tag rather than by position */
export function attackRollOf(message: { rolls?: readonly Roll[] } | undefined): Roll | undefined {
  return rollsOfType(message?.rolls, "attack")[0];
}

/** midi's data on a usage card (`system.midi`, UsageCardMessage's schema): the workflow's state and records (cardStateSchema) */
export type CardMidi = {
  state?: Record<string, any>, records?: CardRecords, sections?: Record<string, MidiCardSection | null>, progress?: Record<string, boolean>,
  hasAttack?: boolean, hasDamage?: boolean, hasEffects?: boolean, condensed?: boolean, mergeCardMulti?: boolean,
  confirmAttackDamage?: boolean, hideItemDetails?: boolean, displayProperties?: boolean, dmgBtnText?: string, attackBtnText?: string,
  followUps?: { activityUuid: string, label?: string, targetUuids: string[], critical: boolean, used: boolean }[],
  attackRollCount?: number, damageRollCount?: number
};

/** A card's `system.midi`, empty for a message without it */
export function cardMidi(message: ChatMessage.Implementation | null | undefined): CardMidi {
  return (message?.system as { midi?: CardMidi } | undefined)?.midi ?? {};
}

/**
 * midi's per-target detail for the damage tray's calculation (options.midi), from the card's records and state; older
 * cards held it on dnd5e's `system.targets` entries.
 */
export function cardTargetDetail(message: ChatMessage.Implementation | undefined, tokenUuid: string, descriptor: Record<string, any> = {}): Record<string, unknown> {
  const card = cardMidiState(message);
  if (!card || descriptor.saveMults) return descriptor;
  const record = recordFor(card.records, tokenUuid);
  return {
    ...descriptor, saved: !!record?.saved, superSaver: !!record?.superSaver, semiSuperSaver: !!record?.semiSuperSaver,
    saveMults: card.state.saveMults, uncannyDodge: !!record?.uncannyDodge, uncannyDodgeIcon: record?.uncannyDodgeIcon
  };
}

/**
 * Whether the attack on a card hit (the result players see on a masked card): with hits checked, any target hit;
 * otherwise the attack roll's own result against its target. Older cards stored it as `flags.midi-qol.isHit`.
 */
export function cardHitResult(message: ChatMessage.Implementation | undefined): boolean | undefined {
  const stored = storedMidiFlag(message, "isHit");
  if (stored !== undefined) return stored;
  const records = recordList(cardMidiState(message)?.records);
  if (records.some(record => typeof record.hitClass === "string")) return records.some(record => record.hit || record.hitEC);
  const attack = attackRollOf(message) as { isSuccess?: boolean } | undefined;
  return attack?.isSuccess;
}

/** Its attack is rolled and the hits are checked but not yet worked out: the old flag GMOnlyAttackRoll (shown to the GM only meanwhile) */
export function cardHitsPending(message: ChatMessage.Implementation | undefined, autoCheckHit: string): boolean {
  if (autoCheckHit === "none" || !attackRollOf(message)) return false;
  return !recordList(cardMidiState(message)?.records).some(record => typeof record.hitClass === "string");
}

/** The actor that used a card's activity: its own actor (dnd5e's), or the one a card stored (a damage-only workflow's) */
export function cardSourceActor(message: ChatMessage.Implementation | undefined): Actor.Implementation | undefined {
  const uuid = storedMidiFlag(message, "sourceActorUuid") as string | undefined;
  const stored = uuid ? fromUuidSync(uuid, { strict: false }) : undefined;
  if (stored instanceof Actor) return stored;
  const own = (message as { getAssociatedActor?: () => Actor.Implementation | null } | undefined)?.getAssociatedActor?.();
  return own ?? undefined;
}

/** A flag the card stores, read past the deprecated flag getters (which warn and read the workflow) */
export function storedMidiFlag(message: ChatMessage.Implementation | undefined, key: string): any {
  const flags = message?.flags?.["midi-qol"] as Record<string, unknown> | undefined;
  return flags ? Object.getOwnPropertyDescriptor(flags, key)?.value : undefined;
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

/**
 * The messages linked to message `id` by their `system.origin` (of `type`, if given), from dnd5e's message registry.
 * The registry keeps a message under an origin it was later moved from, so each one's origin is checked.
 */
export function messagesFrom(id: string, type?: string): ChatMessage.Implementation[] {
  const registry = (globalThis as { dnd5e?: { registry?: { messages?: { get(origin: string, type?: string): ChatMessage.Implementation[] } } } }).dnd5e?.registry?.messages;
  const candidates = registry ? registry.get(id, type) : (game.messages?.filter(m => !type || m.type === type) ?? []);
  return candidates.filter(m => (m._source.system as { origin?: string | null } | undefined)?.origin === id);
}
