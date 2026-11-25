import { MODULE_ID } from "../../midi-qol.js";
import { Activity } from "../../globals.js";
import { Registry } from "../api/registry.js";
import { configSettings } from "../settings.js";
import { findAmmunitionActivity } from "./midiActivity.js";

/**
 * What midi does with each activity type, in place of per-type getter overrides on midi's subclasses.
 * A type with no policy is not automated: midi runs no workflow for it (dnd5e's `order`, another module's type until
 * it registers one).
 */
export interface ActivityPolicy {
  /** midi runs a workflow when this type is used */
  automated: boolean;
  /** may serve as another activity's "other activity" (its damage/save after the attack) */
  possibleOtherActivity: boolean;
  /** never an other activity, whatever the activity's otherActivityCompatible says */
  neverOtherActivity: boolean;
  /** may be a triggered activity */
  triggerable: boolean;
  /** only its own actor may trigger it */
  selfTriggerableOnly: boolean;
  /** target confirmation forced for this type ("never"), else the activity's own setting */
  forcedTargetConfirmation?: string;
  /** whether dnd5e runs the type's follow-up action after a use (e.g. placing an enchantment), midi doing the rest */
  subsequentActions: (activity: Activity) => boolean;
  /**
   * How midi runs its workflow for a use (useRelaunch.ts): "preUseActivity", the type's use goes through dnd5e's base
   * use (the default); "preUseLinkedSpell", it hands its use to a spell (Cast); false, its use bypasses dnd5e's base use
   * and midi runs no workflow for it.
   */
  useRestart: "preUseActivity" | "preUseLinkedSpell" | false;
}

const DEFAULT_POLICY: ActivityPolicy = { automated: false, possibleOtherActivity: false, neverOtherActivity: false, triggerable: true, selfTriggerableOnly: false,
  subsequentActions: () => true, useRestart: "preUseActivity" };
const none = () => false;
const automated = (policy: Partial<ActivityPolicy> = {}): Partial<ActivityPolicy> => ({ automated: true, ...policy });

const midiPolicies: Record<string, Partial<ActivityPolicy>> = {
  attack: automated({ neverOtherActivity: true, subsequentActions: none }),
  cast: automated({ forcedTargetConfirmation: "never", subsequentActions: none, useRestart: "preUseLinkedSpell" }),
  check: automated({ possibleOtherActivity: true, subsequentActions: none }),
  damage: automated({ possibleOtherActivity: true, subsequentActions: none }),
  enchant: automated(),
  // dnd5e 6.1's Forward and Save have no follow-up action: none (midi's empty overrides went in M14)
  forward: automated({ triggerable: false, forcedTargetConfirmation: "never", subsequentActions: none }),
  heal: automated({ possibleOtherActivity: true, subsequentActions: none }),
  save: automated({ possibleOtherActivity: true, subsequentActions: none }),
  summon: automated({ subsequentActions: none }),
  teleport: automated(),
  // dnd5e applies a chosen form (form mode) itself
  transform: automated({
    // @ts-expect-error no dnd5e-types
    subsequentActions: activity => activity.transform?.mode === "form"
  }),
  utility: automated({ possibleOtherActivity: true, subsequentActions: none }),
};

// By activity type (registry.ts); a registration is merged over what the type already has
const policies = new Registry<Partial<ActivityPolicy>>();
for (const [type, policy] of Object.entries(midiPolicies)) policies.set(type, policy);

/** For a module's own activity type: how midi treats it. Merged over what is registered. */
export function registerActivityPolicy(type: string, policy: Partial<ActivityPolicy>) {
  policies.set(type, { ...policies.get(type)?.value, ...policy });
  // After midi's setup: an automated type is adopted now (its wraps, sheet and card buttons installed)
  if (adoptionOpen && activityPolicy(type).automated) adoptActivityType(type);
}

export function activityPolicy(activityOrType: { type?: string } | string | undefined): ActivityPolicy {
  const type = typeof activityOrType === "string" ? activityOrType : activityOrType?.type;
  return { ...DEFAULT_POLICY, ...(type ? policies.get(type)?.value : undefined) };
}

/*
 * midi's activity getters, on dnd5e's shared activity data prototype so every activity has them, midi's subclass or not.
 * Each was a getter on MidiActivityMixin (or a per-type override, now the policy above); behaviour is unchanged.
 */
/** The activity properties these getters read and cache. */
interface MidiActivityLike extends Activity {
  img: string;
  macroData: { name: string, command: string };
  otherActivityId?: string | null;
  ammunitionActivity?: MidiActivityLike;
  _otherActivity?: MidiActivityLike | null;
  _ammunitionActivity?: MidiActivityLike | null;
  isOtherActivityCompatible?: boolean;
  identifier?: string;
  _source?: { name?: string };
  useConditionText?: string;
  effectConditionText?: string;
  prepareData(): void;
  update(data: object): unknown;
}

/** Activation types taken at their own time, never as part of an attack (auto-pairing skips them) */
const OWN_TIME = new Set(["bonus", "reaction", "minute", "hour", "day", "longRest", "shortRest", "encounter", "turnStart", "turnEnd", "legendary", "mythic", "lair"]);

const getters: Record<string, (this: MidiActivityLike) => unknown> = {
  isMidiActivity() { return activityPolicy(this).automated; },
  possibleOtherActivity() { return activityPolicy(this).possibleOtherActivity; },
  isOtherActivityCompatible() {
    const policy = activityPolicy(this);
    if (policy.neverOtherActivity || !policy.possibleOtherActivity) return false;
    return this.midiProperties?.otherActivityCompatible ?? false;
  },
  isTriggerableActivity() { return activityPolicy(this).triggerable; },
  isSelfTriggerableOnly() { return activityPolicy(this).selfTriggerableOnly; },
  forcedTargetConfirmation() {
    const forced = activityPolicy(this).forcedTargetConfirmation;
    if (forced) return forced;
    // A self-target activity can never confirm targets (requiresTargetConfirmation returns false first): show that
    if (this.target?.affects?.type === "self") return "never";
    return undefined;
  },
  effectiveActivationType() {
    if (this.type !== "cast") return this.activation?.type;
    // A Cast activity (M14: was its class's getter): its own activation when it overrides it, else the linked spell's
    // first usable activity's, else the item's
    // @ts-expect-error no dnd5e-types
    if (this.activation?.override) return this.activation.type;
    // @ts-expect-error no dnd5e-types
    const activities = this.cachedSpell?.system?.activities;
    const list: { canUse?: boolean, activation?: { type?: string } }[] = activities instanceof Collection ? activities.contents : Object.values(activities ?? {});
    const spellActivity = list.find(a => a.canUse) ?? list[0];
    if (spellActivity?.activation?.type) return spellActivity.activation.type;
    // @ts-expect-error no dnd5e-types
    return this.item?.system?.activation?.type ?? this.activation?.type;
  },
  validProperties() { return new Set(["idi", "idr", "idv", "ida"]); },
  identifier() {
    if (this.midiProperties?.identifier) return this.midiProperties.identifier;
    // An activity with no name of its own (dnd5e fills it in with its type's title as it prepares it) is identified by
    // dnd5e's title for its type ("save"), as midi's prepareData did before dnd5e's (M14)
    if (this._source?.name) return this.name.slugify();
    const metadata = (this.constructor as { metadata?: { dnd5eTitle?: string, title?: string } }).metadata;
    const title = metadata?.dnd5eTitle ?? metadata?.title;
    return title ? game.i18n?.localize(title).slugify() ?? "" : "";
  },
  otherSaveSource() {
    return [this.otherActivity, this.ammunitionActivity]
      .find((activity): activity is MidiActivityLike => !!activity && activity !== this && !!(activity.save || activity.check));
  },
  ammunitionActivity() {
    if (this._ammunitionActivity !== undefined) return this._ammunitionActivity ?? undefined;
    this._ammunitionActivity = findAmmunitionActivity(this.ammunitionItem) ?? null;
    return this._ammunitionActivity ?? undefined;
  },
  otherActivity() {
    if (this._otherActivity !== undefined) return this._otherActivity;
    if (this.otherActivityId === "none") return undefined;
    if (this.otherActivityId) {
      // @ts-expect-error no dnd5e-types
      this._otherActivity = this.item.system.activities.get(this.otherActivityId);
      // @ts-expect-error no dnd5e-types
      if (!this._otherActivity) this._otherActivity = this.item.system.activities.find((a: MidiActivityLike) => a.identifier === this.otherActivityId);
      this._otherActivity?.prepareData();
      return this._otherActivity;
    }
    // Auto-detect only applies to attack activities
    if (!this.attack) {
      this._otherActivity = null;
      return this._otherActivity;
    }
    // unset ("" or null) follows the configured default; new activities are stamped "none"
    if (configSettings.defaultOtherActivity === "none") {
      this._otherActivity = null;
      return this._otherActivity;
    }
    // Prefer a sole automationOnly candidate, else a sole compatible one; ambiguity means no pairing. Never a check (in
    // dnd5e's books every check beside an attack is the target's escape) or an activity with its own time (a Stirge's
    // turn-start damage, a bonus-action Cast)
    const soleCandidate = (filter: (a: MidiActivityLike) => boolean) => {
      // @ts-expect-error no dnd5e-types
      const options = this.item.system.activities.filter((a: MidiActivityLike) => filter(a) && a.isOtherActivityCompatible && a.uuid !== this.uuid
        && a.type !== "check" && !OWN_TIME.has(a.activation?.type ?? ""));
      return options.length === 1 ? options[0] : undefined;
    };
    this._otherActivity = soleCandidate(a => !!a.midiProperties?.automationOnly) ?? soleCandidate(() => true);
    this._otherActivity?.prepareData();
    if (!this._otherActivity) this._otherActivity = null;
    return this._otherActivity;
  },
  useCondition() { return this.useConditionText ?? ""; },
  effectCondition() { return this.effectConditionText ?? ""; },
  reactionCondition() { return this.useCondition ?? ""; },
  otherCondition() { return this.otherActivity?.useCondition ?? ""; },
  hasDamage() { return (this.damage?.parts?.length ?? 0) > 0; },
  hasHealing() { return this.healing !== undefined; },
  hasAttack() { return this.attack !== undefined; },
  hasSave() { return (!!this.save || !!this.check); },
};

const methods: Record<string, (this: MidiActivityLike, ...args: never[]) => unknown> = {
  async getTriggeredActivity() {
    // @ts-expect-error no dnd5e-types
    let activity = this.item.system.activities.find((a: MidiActivityLike) => a.id === this.midiProperties?.triggeredActivityId);
    // @ts-expect-error no dnd5e-types
    if (!activity) activity = this.item.system.activities.find((a: MidiActivityLike) => a.identifier === this.midiProperties?.triggeredActivityId);
    if (!activity && this.midiProperties?.triggeredActivityId) activity = await fromUuid(this.midiProperties.triggeredActivityId);
    return activity;
  },
};

export function installActivityPrototype() {
  const proto = globalThis.dnd5e.dataModels.activity.BaseActivityData.prototype;
  for (const [name, get] of Object.entries(getters)) Object.defineProperty(proto, name, { get, configurable: true });
  Object.defineProperty(proto, "macro", {
    get(this: MidiActivityLike) {
      return new Macro({ name: this.macroData.name || this.name, command: this.macroData.command, img: this.img, type: "script" });
    },
    set(this: MidiActivityLike, macro: Macro) {
      this.update({ macroData: { name: macro.name, command: macro.command } });
    },
    configurable: true
  });
  for (const [name, value] of Object.entries(methods)) Object.defineProperty(proto, name, { value, writable: true, configurable: true });
}

/**
 * A new activity (an item's add button, `Item5e#createActivity`) pairs with no other activity unless the data says so:
 * `otherActivityId: "none"`. Stored activities without the field keep "unset" (midi works out the pairing). A wrap,
 * not a hook (M14 D2): by `preUpdateItem` the activity's data always has the field, so a duplicated or copied activity
 * set to unset couldn't be told from a new one; here the caller's data is still as given.
 */
export function installActivityCreation(types: Set<string>) {
  globalThis.libWrapper.register(MODULE_ID, "CONFIG.Item.documentClass.prototype.createActivity",
    function (this: Item.Implementation, wrapped: (...args: unknown[]) => unknown, type: string, data: Record<string, unknown> = {}, ...rest: unknown[]) {
      if (types.has(type) && !("otherActivityId" in data)) data = { ...data, otherActivityId: "none" };
      return wrapped(type, data, ...rest);
    }, "WRAPPER");
}

/** The dnd5e activity types midi uses (its wraps, hooks and sheet additions are on these) */
export const adoptedActivityTypes = new Set<string>();

/**
 * The labels of midi's fields on each type's sheet: midi's localization prefixes around dnd5e's own, in the order
 * midi's activity classes gave them (M14: the classes are gone; their LOCALIZATION_PREFIXES are set on dnd5e's).
 */
const LOCALIZATION: Record<string, { before?: string[], after: string[] }> = {
  attack: { after: ["midi-qol.SHARED", "midi-qol.ATTACK"] },
  check: { after: ["midi-qol.SHARED", "midi-qol.SAVE", "midi-qol.CHECK", "DND5E.DAMAGE"] },
  damage: { after: ["midi-qol.SHARED"] },
  save: { after: ["midi-qol.SHARED", "DND5E.DAMAGE", "midi-qol.SAVE"] },
  ...Object.fromEntries(["cast", "enchant", "forward", "heal", "summon", "teleport", "transform", "utility"]
    .map(type => [type, { before: [`midi-qol.${type.toUpperCase()}`], after: ["midi-qol.SHARED"] }]))
};

/** What midi installs for an adopted type (wraps, sheet parts, card buttons, a type's own setup): each told of every type */
type AdoptionListener = (type: string) => void;
const adoptionListeners: AdoptionListener[] = [];
/** midi's setup has run: a policy registered from now on adopts its type at once */
let adoptionOpen = false;

/** Install something for every adopted type: those adopted already, and each one adopted later */
export function onActivityTypeAdopted(listener: AdoptionListener): void {
  adoptionListeners.push(listener);
  for (const type of adoptedActivityTypes) listener(type);
}

/**
 * Every dnd5e activity type whose policy is automated: midi's own (midiPolicies) and any a module registered (M14:
 * adoption follows the policy, not a list of type names). A type with no policy is not automated.
 */
export function adoptAutomatedTypes(): void {
  adoptionOpen = true;
  for (const type of Object.keys(CONFIG.DND5E.activityTypes ?? {})) if (activityPolicy(type).automated) adoptActivityType(type);
}

/** midi uses dnd5e's activity type `type`: its localization prefixes, then what each installer adds (onActivityTypeAdopted) */
export function adoptActivityType(type: string): void {
  // @ts-expect-error no dnd5e-types
  const cls: { LOCALIZATION_PREFIXES?: string[] } | undefined = CONFIG.DND5E.activityTypes[type]?.documentClass;
  if (!cls || adoptedActivityTypes.has(type)) return;
  adoptedActivityTypes.add(type);
  const prefixes = LOCALIZATION[type] ?? { after: ["midi-qol.SHARED"] };
  Object.defineProperty(cls, "LOCALIZATION_PREFIXES", { configurable: true, writable: true,
    value: [...(prefixes.before ?? []), ...(cls.LOCALIZATION_PREFIXES ?? []), ...prefixes.after] });
  for (const listener of adoptionListeners) listener(type);
}

