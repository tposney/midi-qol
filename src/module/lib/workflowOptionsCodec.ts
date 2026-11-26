/**
 * Other modules' data in `workflowOptions`, made to survive serialisation (sockets, chat-card flags) through a
 * Foundry DataModel per namespace. A module declares what `workflowOptions.<namespace>` carries; midi sends the
 * model's source (a Set becomes an array) and rebuilds it on receipt (the SetField makes it a Set again).
 *
 * Keys a schema does not declare are per-use state: they are not transmitted, persisted or passed to child
 * workflows. Namespaces nobody registered pass through unchanged; on the card they are stored with a deprecation
 * warning for now (cardWorkflowOptions).
 */

type FieldMap = foundry.data.fields.DataSchema;
type ModelClass = new (source: object) => foundry.abstract.DataModel.Any;

const models = new Map<string, ModelClass>();

/** Declare the data a module keeps under `workflowOptions.<namespace>`: a DataModel class or a schema function. */
export function registerWorkflowOptionsSchema(namespace: string, schema: ModelClass | (() => FieldMap)) {
  if (!(schema.prototype instanceof foundry.abstract.DataModel)) {
    const defineSchema = schema as () => FieldMap;
    schema = class extends foundry.abstract.DataModel<FieldMap, null> { static defineSchema(): FieldMap { return defineSchema(); } };
  }
  models.set(namespace, schema as ModelClass);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => foundry.utils.getType(value) === "Object";

/** The model's initialised values as a plain object: Sets and other field types restored, undeclared keys gone. */
function initialised(model: foundry.abstract.DataModel.Any): Record<string, unknown> {
  const fields = (model.constructor as unknown as { schema: { fields: object } }).schema.fields;
  return Object.fromEntries(Object.keys(fields).map(key => [key, (model as unknown as Record<string, unknown>)[key]]));
}

function convert<T>(options: T, toWire: boolean): T {
  if (!models.size || !isPlainObject(options)) return options;
  let out: Record<string, unknown> | undefined;
  for (const [namespace, Model] of models) {
    const value = options[namespace];
    if (!isPlainObject(value)) continue;
    try {
      // A copy: constructing a DataModel cleans its source in place.
      const model = new Model(foundry.utils.deepClone(value));
      (out ??= { ...options })[namespace] = toWire ? model.toObject() : initialised(model);
    } catch (err) {
      console.warn(`midi-qol | workflowOptions.${namespace} does not match its registered schema`, err);
    }
  }
  return (out ?? options) as T;
}

/** For sending or persisting: registered namespaces become their JSON-safe model source. */
export const encodeWorkflowOptions = <T>(options: T): T => convert(options, true);
/** For receiving: registered namespaces are rebuilt through their model. */
export const decodeWorkflowOptions = <T>(options: T): T => convert(options, false);
/** What a child workflow inherits: exactly what transmission would carry. */
export const inheritableWorkflowOptions = <T>(options: T): T => decodeWorkflowOptions(encodeWorkflowOptions(options));

/**
 * midi's own option keys (WorkflowOptions, MidiOptions, and what midi reads from either). Any other key is another
 * module's: stored on the card through a registered schema (its namespace), or, for now, as it is.
 */
export const MIDI_OPTION_KEYS = new Set([
  "activityId", "activityIdentifier", "addOptionalBonuses", "advantage", "allowIncapacitated", "asUser", "attackMode",
  "attackPerTarget", "attackRollDSN", "attackSplit", "autoConsumeResource", "autoFastAttack", "autoRollAttack",
  "autoRollDamage", "cardNote", "castUsesBonusAction", "castUsesReaction", "chain", "chatMessage", "checkGMStatus", "checkGMstatus", "choices", "damageTypeChoice",
  "configureDialog", "coverOrigin", "createWorkflow", "critical", "damageRollDSN", "disadvantage", "event", "excludeTargets",
  "fastForward", "fastForwardAbility", "fastForwardAttack", "fastForwardDamage", "fastForwardSet", "fixedDice",
  "forceCompletion", "forceTemplateTargeting", "formulaDSN", "fumble", "grantsActor", "grantsToken", "ignoreUserTargets",
  "inboxMode", "includeTargets", "isConcentrationCheck", "isCritical", "isDummy", "isFumble", "isMagicSave", "isOverTime", "isReaction",
  "isTriggered", "item", "itemCardUuid", "itemUuid", "noConcentrationCheck", "noOnUseMacro", "noProvokeReaction", "areaTargets",
  "noTargetOnUseMacro", "noUseWarning", "notBonusAction", "notReaction", "onlyOnUseItemMacros", "other",
  "overTimeEffectUuid", "parts", "powerLevel", "preSelectedTargetUuids", "presentation", "preview", "proceedChecks", "recomputeAdvantage",
  "requestClaim", "rollAs", "rollAttackPerTarget", "rollOptions", "rollToggle", "rollType", "saveActivityUuid", "saveDC",
  "saveItem", "saveItemUuid", "simulate", "sourceActorUuid", "spellLevel", "steps", "target", "targetConfirmation",
  "targets", "targetsToUse", "targetUuids", "teleport", "templateUuid", "triggeredActivity", "triggeringActivityUuid",
  "triggeringWorkflowId", "triggeringUserId", "reactionTrigger", "unattended", "updateWorkflow", "versatile", "workflowName", "workflowOptions"
]);

/**
 * Whether options no module registered are stored on the card. True while other modules move to
 * registerWorkflowOptionsSchema (they warn meanwhile); false then: only midi's keys and registered namespaces are
 * stored, and other keys last for the use only.
 */
let storeUnregistered = true;
/** Internal: the change of rule above, when its time comes (and for tests) */
export function setStoreUnregisteredWorkflowOptions(value: boolean): void { storeUnregistered = value; }

const warned = new Set<string>();

/**
 * The options as a card stores them for a rebuilt workflow: registered namespaces as their schema's data; other
 * modules' keys as they are (with a deprecation warning, once per key) or, once that ends, not at all.
 */
export function cardWorkflowOptions<T>(options: T): T {
  const encoded = encodeWorkflowOptions(options);
  if (!isPlainObject(encoded)) return encoded;
  let out: Record<string, unknown> | undefined;
  for (const key of Object.keys(encoded)) {
    if (MIDI_OPTION_KEYS.has(key) || models.has(key) || encoded[key] === undefined) continue;
    if (!storeUnregistered) {
      delete (out ??= { ...encoded })[key];
      continue;
    }
    if (warned.has(key)) continue;
    warned.add(key);
    foundry.utils.logCompatibilityWarning(`midi-qol | workflowOptions.${key} is kept on the use's chat card for a workflow rebuilt from it, `
      + `but nothing registered it. A module keeping data there should put it under its own namespace and declare it with `
      + `MidiQOL.registerWorkflowOptionsSchema("<namespace>", schema); options nobody registered will stop being stored.`,
      { since: "15.0.0", once: true });
  }
  return (out ?? encoded) as T;
}

/** Applies `fn` to every `workflowOptions` object in a socket payload, copying only the path to what changed. */
export function mapPayload(value: unknown, fn: (options: object) => object, depth = 0): unknown {
  if (depth > 6) return value;
  if (Array.isArray(value)) {
    const mapped = value.map(v => mapPayload(v, fn, depth + 1));
    return mapped.some((v, i) => v !== value[i]) ? mapped : value;
  }
  if (!isPlainObject(value)) return value;
  let out: Record<string, unknown> | undefined;
  for (const [key, v] of Object.entries(value)) {
    const mapped = key === "workflowOptions" && isPlainObject(v) ? fn(v) : mapPayload(v, fn, depth + 1);
    if (mapped !== v) (out ??= { ...value })[key] = mapped;
  }
  return out ?? value;
}

const SENDERS = new Set(["executeAsGM", "executeAsUser", "executeForAllGMs", "executeForOtherGMs", "executeForEveryone", "executeForOthers", "executeForUsers"]);

/**
 * socketlib with the codec at both ends: calls encode the `workflowOptions` in their arguments, handlers decode them,
 * and results come back the same way. Local calls (to oneself) go through it too, so they see what remote ones do.
 */
export function withWorkflowOptionsCodec<T extends object>(socket: T): T {
  const encode = (v: unknown) => mapPayload(v, encodeWorkflowOptions);
  const decode = (v: unknown) => mapPayload(v, decodeWorkflowOptions);
  return new Proxy(socket, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      if (prop === "register") {
        return (name: string, handler: (...args: unknown[]) => unknown) =>
          value.call(target, name, async function (this: unknown, ...args: unknown[]) {
            return encode(await handler.apply(this, args.map(decode)));
          });
      }
      if (typeof prop === "string" && SENDERS.has(prop))
        return async (...args: unknown[]) => decode(await value.apply(target, args.map(encode)));
      return value.bind(target);
    }
  });
}
