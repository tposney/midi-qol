import { configSettings } from "../settings.js";
import { MODULE_ID, i18n } from "../../midi-qol.js";
import { followUpTargetModes } from "../followUps.js";
import { teleportMoverModes, teleportPlanModes } from "./teleport.js";

/*
 * midi's activity fields, added to dnd5e's own activity data models rather than defined by midi's subclasses, so any
 * activity class built on dnd5e's (midi's, dnd5e's own, another module's) keeps them. Field names and defaults are the
 * ones midi has always stored: an activity loaded by a schema without them is pruned and loses them on its next write.
 * Installed at init, before dnd5e builds the schemas (at i18nInit).
 */

type Fields = Record<string, object>;

function sharedFields(): Fields {
  const { StringField, ArrayField, BooleanField, SchemaField, NumberField, ColorField, SetField, ObjectField } = foundry.data.fields;
  return {
    useConditionText: new MidiConditionField({ name: "useCondition", initial: "" }),
    useConditionReason: new StringField({ name: "useConditionReason", initial: "" }),
    effectConditionText: new MidiConditionField({ name: "effectCondition", initial: "" }),
    // null means never set, so imported items follow configSettings.defaultOtherActivity
    otherActivityId: new StringField({ name: "otherActivity", initial: null, nullable: true }),
    macroData: new SchemaField({
      name: new StringField({ name: "name", initial: "" }),
      command: new StringField({ name: "command", initial: "" }),
    }),
    ignoreTraits: new SchemaField({
      idi: new BooleanField({ name: "idi", initial: false }),
      idr: new BooleanField({ name: "idr", initial: false }),
      idv: new BooleanField({ name: "idv", initial: false }),
      ida: new BooleanField({ name: "ida", initial: false }),
      idm: new BooleanField({ name: "idm", initial: false })
    }),
    midiProperties: new SchemaField({
      ignoreTraits: new SetField(new StringField(), { initial: [] }),
      triggeredActivityId: new StringField({ name: "triggeredActivity", initial: "none", required: true, blank: false }),
      //@ts-expect-error MidiConditionField in a nested schema (as before)
      triggeredActivityConditionText: new MidiConditionField({ name: "triggeredActivityCondition", initial: "" }),
      triggeredActivityTargets: new StringField({ name: "triggeredActivityTargets", initial: "targets", required: true, blank: false }),
      triggeredActivityRollAs: new StringField({ name: "triggeredActivityRollAs", initial: "self" }),
      triggeredActivityConsume: new BooleanField({ name: "triggeredActivityConsume", initial: true }),
      triggeredActivityConfigure: new BooleanField({ name: "triggeredActivityConfigure", initial: true }),
      // Near: creatures within this of the first hit (else first) target, at most Max, never one the chain took
      triggeredActivityNearWithin: new NumberField({ name: "triggeredActivityNearWithin", initial: 30, min: 0 }),
      triggeredActivityNearMax: new StringField({ name: "triggeredActivityNearMax", initial: "1" }),
      triggeredActivityNearDisposition: new StringField({ name: "triggeredActivityNearDisposition", initial: "any", required: true, blank: false,
        choices: { any: "midi-qol.Chain.Disposition.any", enemy: "midi-qol.Chain.Disposition.enemy", ally: "midi-qol.Chain.Disposition.ally" } }),
      // The most times the trigger runs along a chain (it may trigger itself): blank, once
      triggeredActivityChainLimit: new StringField({ name: "triggeredActivityChainLimit", initial: "" }),
      // Offered as a button on the card when another of the item's activities hits (followUps.ts).
      followUp: new BooleanField({ name: "followUp", initial: false }),
      followUpTargets: new StringField({ name: "followUpTargets", initial: "default", required: true, blank: false,
        choices: Object.fromEntries(followUpTargetModes.map(mode => [mode, mode === "default" ? "midi-qol.FollowUp.Targets.default" : `midi-qol.TriggeredActivityTargetOptions.${mode}`])) }),
      //@ts-expect-error MidiConditionField in a nested schema (as before)
      followUpCondition: new MidiConditionField({ name: "followUpCondition", initial: "" }),
      autoConsume: new BooleanField({ name: "autoConsume", initial: false }),
      forceConsumeDialog: new StringField({ name: "forceConsumeDialog", initial: "default" }),
      forceRollDialog: new StringField({ name: "forceRollDialog", initial: "default" }),
      forceDamageDialog: new StringField({ name: "forceDamageDialog", initial: "default" }),
      confirmTargets: new StringField({ name: "confirmTargets", initial: "default", required: true, blank: false }),
      autoTargetType: new StringField({ name: "autoTargetType", initial: "any", required: true, blank: false }),
      // Which of the creatures an area (placed, or of its range) takes may be affected, and its region's rules: a condition about `target`
      targetCondition: new StringField({ name: "targetCondition", initial: "" }),
      autoTargetAction: new StringField({ name: "autoTargetAction", initial: "default" }),
      automationOnly: new BooleanField({ name: "automationOnly", initial: false }),
      otherActivityCompatible: new BooleanField({ name: "otherActivityCompatible", initial: true }),
      otherActivityAsParentType: new BooleanField({ name: "otherActivityAsParentType", initial: true, required: false }),
      identifier: new StringField({ name: "identifier", initial: "", required: false }),
      displayActivityName: new BooleanField({ name: "displayActivityName", initial: false }),
      rollMode: new StringField({ name: "rollMode", initial: "default", required: true, blank: false }),
      chooseEffects: new BooleanField({ name: "chooseEffects", initial: false }),
      toggleEffect: new BooleanField({ name: "toggleEffect", initial: false }),
      ignoreFullCover: new BooleanField({ name: "ignoreFullCover", initial: false }),
      targetMustBeSeen: new BooleanField({ name: "targetMustBeSeen", initial: false }),
      removeChatButtons: new StringField({ name: "removeChatButtons", initial: "default", blank: false, required: true }),
      magicEffect: new BooleanField({ name: "magicEffect", initial: false }),
      magicDamage: new BooleanField({ name: "magicDamage", initial: false }),
      noConcentrationCheck: new BooleanField({ name: "noConcentrationCheck", initial: false }),
      skipConcentrationCheck: new BooleanField({ name: "skipConcentrationCheck", initial: false }),
      autoCEEffects: new StringField({ name: "autoCEEffects", initial: "default", blank: false, required: true }),
      // Conditions applied to the targets as the condition itself (as the token HUD does), with the activity's
      // effects: on a failed save, or always with onSave. specialDuration adds to the status's own.
      statuses: new ArrayField(new SchemaField({
        id: new StringField({ initial: "" }),
        specialDuration: new ArrayField(new StringField()),
        onSave: new BooleanField({ initial: false })
      }), { initial: [] }),
    }),
    isOverTimeFlag: new BooleanField({ name: "isOverTimeFlag", initial: false }),
    // The activity's changes to its use's steps (steps/api.ts, the activity layer), as data; left out unless set
    midiSteps: new ArrayField(new ObjectField(), { required: false, initial: undefined }),
    // The activity's choices (M28, lib/choices.ts), asked in the Choices step; left out unless set
    midiChoices: new ArrayField(new ObjectField(), { required: false, initial: undefined }),
    // The activity's entries (M15, lib/entries): what it does at events, as data; left out unless set
    midiEntries: new ArrayField(new ObjectField(), { required: false, initial: undefined }),
    // The activity's random table (M28, lib/tables.ts), rolled in the RollTable step; left out unless set
    midiTable: new ObjectField({ required: false, initial: undefined }),
    overTimeProperties: new SchemaField({
      // `default` is not a field option, so no initial value: unset reads as "start" (kept as stored data has it)
      turnChoice: new StringField({ blank: false, choices: ["start", "end"], default: "start" }),
      saveRemoves: new BooleanField({ initial: true }),
      rollAs: new StringField({ blank: false, choices: ["target", "source"], initial: "target" }),
      //@ts-expect-error MidiConditionField in a nested schema (as before)
      preRemoveConditionText: new MidiConditionField({ name: "removeCondition", initial: "" }),
      //@ts-expect-error MidiConditionField in a nested schema (as before)
      postRemoveConditionText: new MidiConditionField({ name: "postRemoveCondition", initial: "" }),
    }),
    regionBehavior: new SchemaField({
      enabled: new BooleanField({ initial: false }),
      dispositionFilter: new NumberField({ initial: -1, choices: { [-1]: "Enemies", [0]: "All", [1]: "Allies" } }),
      excludeSource: new BooleanField({ initial: true }),
      oncePerTurn: new BooleanField({ initial: true }),
      wallRestriction: new StringField({ initial: "none", choices: ["none", ...CONST.EDGE_RESTRICTION_TYPES] }),
      regionVisibility: new NumberField({ initial: CONST.REGION_VISIBILITY.ALWAYS, choices: Object.values(CONST.REGION_VISIBILITY) }),
      // "default" leaves the region stationary. "caster" attaches it to the caster's token;
      // "target" attaches it to a chosen target (prompts if multiple targets are selected).
      attachToken: new StringField({ initial: "default", choices: ["default", "caster", "target"] }),
      // Moves the region each turn of the caster: away from it, or in a direction its owner chooses.
      moveDistance: new NumberField({ initial: 0, min: 0 }),
      moveDirection: new StringField({ initial: "away", choices: ["away", "choose"] }),
      moveTiming: new StringField({ initial: "start", choices: ["start", "end"] }),
      // The caster's height a template is measured from; "default" follows the Template Origin Height setting.
      templateOrigin: new StringField({ initial: "default", required: true, blank: false, choices: ["default", "floor", "base", "top", "eye"] }),
      rules: new ChangeableListField(new SchemaField({
        trigger: new StringField({ required: true, blank: false, initial: "entry" }),
        action: new StringField({ required: true, blank: false, initial: "useActivity" }),
        targetId: new StringField({ required: true, blank: false, initial: "" }),
      })),
    }),
    // The area is a barrier: walls made for its region (regionBehaviors/MidiRegionBarrierBehaviorType.ts)
    regionBarrier: new SchemaField({
      enabled: new BooleanField({ initial: false }),
      move: new BooleanField({ initial: true }),
      sight: new StringField({ initial: "none", choices: ["none", "limited", "normal"] }),
      sound: new StringField({ initial: "none", choices: ["none", "limited", "normal"] }),
      direction: new StringField({ initial: "both", choices: ["both", "left", "right"] }),
      trace: new StringField({ initial: "auto", choices: ["auto", "axis", "outline", "middle"] }),
      // One side, chosen at the cast, affects creatures within this distance of it (Wall of Fire): the activity (its id)
      // used on a creature that ends its turn there, or enters the wall
      sideDepth: new NumberField({ initial: 0, min: 0 }),
      sideActivity: new StringField({ initial: "" }),
    }),
    regionLight: new SchemaField({
      enabled: new BooleanField({ initial: false }),
      dim: new NumberField({ initial: 0, min: 0 }),
      bright: new NumberField({ initial: 0, min: 0 }),
      color: new ColorField({ initial: null, nullable: true }),
      alpha: new NumberField({ initial: 0.5, min: 0, max: 1 }),
      luminosity: new NumberField({ initial: 0.5, min: 0, max: 1 }),
      animationType: new StringField({ initial: "", nullable: true }),
      animationSpeed: new NumberField({ initial: 5, min: 0, max: 10 }),
      animationIntensity: new NumberField({ initial: 5, min: 1, max: 10 }),
    }),
  };
}

function otherActivityAsParentType() {
  return new foundry.data.fields.BooleanField({
    name: "otherActivityAsParentType", initial: true, required: false,
    label: i18n("midi-qol.SHARED.FIELDS.otherActivityAsParentType.label"),
    hint: i18n("midi-qol.SHARED.FIELDS.otherActivityAsParentType.hint")
  });
}

function damageCritical() {
  const { SchemaField, BooleanField } = foundry.data.fields;
  return new SchemaField({ allow: new BooleanField(), bonus: new globalThis.dnd5e.dataModels.fields.FormulaField() });
}

/** Adds midi's `critical` to dnd5e's own damage block (Foundry 14 `SchemaField#extendFields`), so dnd5e keeps the rest. */
function extendDamageCritical(schema: Fields): Fields {
  const damage = schema.damage;
  if (damage instanceof foundry.data.fields.SchemaField && !("critical" in damage.fields)
    && "extendFields" in damage && typeof damage.extendFields === "function")
    damage.extendFields({ critical: damageCritical() });
  return {};
}

/** Extras per dnd5e activity data class (its export name in `dnd5e.dataModels.activity`). */
const typeFields: Record<string, (schema: Fields) => Fields> = {
  AttackActivityData: () => {
    const { StringField, NumberField } = foundry.data.fields;
    return {
      otherActivityAsParentType: otherActivityAsParentType(),
      attackMode: new StringField({ name: "attackMode", initial: "oneHanded" }),
      ammunition: new StringField({ name: "ammunition", initial: "" }),
      // deprecated
      otherActivityUuid: new StringField({ name: "otherActivityUuid", required: false, initial: "" }),
      attackRollPerTarget: new StringField({ name: "attackRollPerTarget", initial: "default", required: true }),
      // Ammunition spent when the attack has several targets: default (one per attack roll), use (one), target (one each)
      ammunitionPerTarget: new StringField({ name: "ammunitionPerTarget", initial: "default", required: true }),
      fumbleThreshold: new NumberField({ name: "fumbleThreshold", initial: 1, required: false }),
    };
  },
  SaveActivityData: schema => ({
    otherActivityAsParentType: otherActivityAsParentType(),
    ...extendDamageCritical(schema),
    friendlySave: new foundry.data.fields.StringField({ initial: "default", name: "friendlySave" }),
  }),
  CheckActivityData: () => {
    const { StringField, ArrayField, SchemaField } = foundry.data.fields;
    return {
      otherActivityAsParentType: otherActivityAsParentType(),
      // dnd5e's check has no damage: midi's check with damage
      damage: new SchemaField({
        onSave: new StringField({ initial: "half", name: "onSave",
          hint: i18n("DND5E.SAVE.FIELDS.damage.onSave.hint"), label: i18n("DND5E.SAVE.FIELDS.damage.onSave.label") }),
        parts: new ArrayField(new globalThis.dnd5e.dataModels.shared.DamageField()),
        critical: damageCritical(),
      }),
      friendlySave: new StringField({ initial: "default", name: "friendlySave" }),
    };
  },
  TeleportActivityData: () => {
    const { BooleanField, SchemaField, StringField } = foundry.data.fields;
    return {
      midiTeleport: new SchemaField({
        movers: new StringField({ initial: "default", required: true, blank: false,
          choices: Object.fromEntries(teleportMoverModes.map(mode => [mode, `midi-qol.TELEPORT.Movers.${mode}`])) }),
        plan: new StringField({ initial: "button", required: true, blank: false,
          choices: Object.fromEntries(teleportPlanModes.map(mode => [mode, `midi-qol.TELEPORT.PlanModes.${mode}`])) }),
        blocked: new StringField({ initial: "refuse", required: true, blank: false,
          choices: { refuse: "midi-qol.TELEPORT.BlockedModes.refuse", fail: "midi-qol.TELEPORT.BlockedModes.fail" } }),
        requireSight: new BooleanField({ initial: false })
      })
    };
  },
  SummonActivityData: () => ({
    friendlySummon: new foundry.data.fields.BooleanField({ initial: false, name: "friendlySummon", required: false })
  }),
};


type DefineSchema = (...args: unknown[]) => Fields;

export function installActivitySchema() {
  globalThis.libWrapper.register(MODULE_ID, "dnd5e.dataModels.activity.BaseActivityData.defineSchema",
    function (wrapped: DefineSchema, ...args: unknown[]) {
      return { ...wrapped(...args), ...sharedFields() };
    }, "WRAPPER");
  for (const [className, extra] of Object.entries(typeFields)) {
    if (!globalThis.dnd5e.dataModels.activity?.[className]) continue;
    globalThis.libWrapper.register(MODULE_ID, `dnd5e.dataModels.activity.${className}.defineSchema`,
      function (wrapped: DefineSchema, ...args: unknown[]) {
        const schema = wrapped(...args);
        return { ...schema, ...extra(schema) };
      }, "WRAPPER");
  }
}

/**
 * A list a change can set: a JSON list as its value (an overlay's changes giving an area its rules); core casts a text
 * value to one element (an empty one for a schema).
 */
export class ChangeableListField extends foundry.data.fields.ArrayField<foundry.data.fields.SchemaField.Any> {
  protected override _castChangeDelta(raw: unknown, replacementData?: Record<string, unknown>) {
    if (typeof raw === "string" && raw.trim().startsWith("[")) {
      try { raw = JSON.parse(raw); } catch { /* left as it is */ }
    }
    return super._castChangeDelta(raw as never, replacementData as never);
  }
}

export class MidiConditionField extends globalThis.dnd5e.dataModels.fields.FormulaField {
  _validateType(value: unknown) {
    return typeof value === "string";
  }
  constructor(options: any) {
    super(options);
  }
  static get _defaults(): any {
    return foundry.utils.mergeObject(super._defaults, {
      deterministic: false
    });
  }

  /**
   * Override _toInput to wrap the text input with a condition editor button.
   * The button opens the ConditionEditor which provides autocomplete for condition expressions.
   */
  _toInput(config: any): HTMLElement {
    // A plain text input: Foundry 14 draws formula fields with its dice Formula Editor (the λ button), not for conditions
    const input = foundry.applications.fields.createTextInput(config) as HTMLInputElement;

    if (!configSettings.conditionEditorEnabled) return input;

    // Create wrapper container
    const wrapper = document.createElement("div");
    wrapper.classList.add("midi-condition-field-wrapper");
    wrapper.appendChild(input);

    // Create editor button using data-action pattern (event listeners don't survive Handlebars outerHTML serialization)
    const fieldName = config.name ?? this.name;
    const fieldLabel = this.label ?? config.name ?? this.name;
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("midi-condition-editor-btn", "unbutton", "control-button");
    button.dataset.action = "openConditionEditor";
    button.dataset.fieldName = fieldName;
    button.dataset.fieldLabel = fieldLabel;
    button.innerHTML = '<i class="fas fa-code" inert></i>';
    button.dataset.tooltip = i18n("midi-qol.ConditionEditor.Tooltip");
    button.ariaLabel = i18n("midi-qol.ConditionEditor.Tooltip");

    wrapper.appendChild(button);
    return wrapper;
  }
}
