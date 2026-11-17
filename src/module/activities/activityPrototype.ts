import { Activity } from "../../globals.js";
import { configSettings } from "../settings.js";
import { findAmmunitionActivity } from "./MidiActivityMixin.js";

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
}

const DEFAULT_POLICY: ActivityPolicy = { automated: false, possibleOtherActivity: false, neverOtherActivity: false, triggerable: true, selfTriggerableOnly: false };
const automated = (policy: Partial<ActivityPolicy> = {}): Partial<ActivityPolicy> => ({ automated: true, ...policy });

const policies: Record<string, Partial<ActivityPolicy>> = {
  attack: automated({ neverOtherActivity: true }),
  cast: automated({ forcedTargetConfirmation: "never" }),
  check: automated({ possibleOtherActivity: true }),
  damage: automated({ possibleOtherActivity: true }),
  enchant: automated(),
  forward: automated({ triggerable: false, forcedTargetConfirmation: "never" }),
  heal: automated({ possibleOtherActivity: true }),
  save: automated({ possibleOtherActivity: true }),
  summon: automated(),
  teleport: automated(),
  transform: automated(),
  utility: automated({ possibleOtherActivity: true }),
};

/** For a module's own activity type: how midi treats it. Merged over what is registered. */
export function registerActivityPolicy(type: string, policy: Partial<ActivityPolicy>) {
  policies[type] = { ...policies[type], ...policy };
}

export function activityPolicy(activityOrType: { type?: string } | string | undefined): ActivityPolicy {
  const type = typeof activityOrType === "string" ? activityOrType : activityOrType?.type;
  return { ...DEFAULT_POLICY, ...(type ? policies[type] : undefined) };
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
  useConditionText?: string;
  effectConditionText?: string;
  prepareData(): void;
  update(data: object): unknown;
}

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
  effectiveActivationType() { return this.activation?.type; },
  validProperties() { return new Set(["idi", "idr", "idv", "ida"]); },
  identifier() {
    if (this.midiProperties?.identifier) return this.midiProperties.identifier;
    return this.name.slugify();
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
    // Prefer a sole automationOnly candidate, else a sole compatible one; ambiguity means no pairing
    const soleCandidate = (filter: (a: MidiActivityLike) => boolean) => {
      // @ts-expect-error no dnd5e-types
      const options = this.item.system.activities.filter((a: MidiActivityLike) => filter(a) && a.isOtherActivityCompatible && a.uuid !== this.uuid);
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
