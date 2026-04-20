import { i18n } from "../../midi-qol.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface ConditionEditorOptions {
  value: string;
  key: string;
  effect?: ActiveEffect;
  label?: string;
  parent: Actor | Item | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/**
 * Build a static completion tree representing everything available in the
 * condition evaluation sandbox. Derived from createConditionData() and
 * asyncMySafeEval() — assumes a workflow is active, which is the case
 * for all advantage/disadvantage/grants condition flags.
 *
 * Pulls rich type info (children, instanceChildren, staticChildren) from the
 * existing macro-autocomplete tree where available, then overlays
 * condition-specific fields and helper functions.
 */
function buildConditionCompletions(api: any): Record<string, any> {
  const completions: Record<string, any> = {};
  const tree = api.tree;

  /**
   * Clone a tree entry, preserving children/instanceChildren/staticChildren
   * references and overlaying extra children and/or overriding top-level fields.
   */
  function cloneWithExtras(
    treeEntry: any,
    overrides?: Record<string, any>,
    extraChildren?: Record<string, any>
  ): Record<string, any> {
    if (!treeEntry) return overrides ?? {};
    const entry: Record<string, any> = { ...treeEntry, ...overrides };
    if (extraChildren) {
      entry.children = { ...(treeEntry.children ?? {}), ...extraChildren };
    }
    return entry;
  }

  // Actor system schema children — used for root-level and target getRollData() fields
  const actorSystemChildren = tree.actor?.children?.system?.children ?? {};

  // ── Direct properties set by createConditionData ──
  completions.isAttuned = { type: "property", detail: "boolean", info: "Whether the triggering item is attuned" };
  completions.options = { type: "property", detail: "object", info: "Roll options passed to the evaluation" };
  completions.isConcentrationCheck = { type: "property", detail: "boolean", info: "Whether this is a concentration check" };
  completions.isDeathSave = { type: "property", detail: "boolean", info: "Whether this is a death saving throw" };

  // ── actor sub-object — plain object, NOT the full Actor document ──
  // In createConditionData: rollData.actor = {}; only raceOrType, typeOrRace, isCombatTurn are set
  completions.actor = {
    type: "property",
    detail: "object",
    info: "Actor sub-object (raceOrType, typeOrRace, isCombatTurn only)",
    children: {
      raceOrType: { type: "property", detail: "string", info: "Race (PCs) or creature type (NPCs)" },
      typeOrRace: { type: "property", detail: "string", info: "Creature type (NPCs) or race (PCs)" },
      isCombatTurn: { type: "property", detail: "boolean", info: "Whether it's this actor's combat turn" },
    }
  };

  // items/equippedItems arrays
  completions.items = { type: "property", detail: "array", info: "All actor item roll data (array)" };
  completions.equippedItems = { type: "property", detail: "array", info: "Equipped item roll data (array)" };
  completions.worldTime = { type: "property", detail: "number", info: "Current world time (game.time.worldTime)" };

  // ── Target sub-object — getRollData() spread + system getter + condition fields ──
  // In createConditionData: rollData.target = { get system() {...}, ...theTargetActor.getRollData() }
  // getRollData() flattens actor.system to root, so target has abilities, attributes, etc. directly
  const actorSystemEntry = tree.actor?.children?.system;
  completions.target = {
    type: "property",
    detail: "object",
    info: "Target data (getRollData spread + condition fields)",
    children: {
      ...actorSystemChildren,
      system: actorSystemEntry
        ? cloneWithExtras(actorSystemEntry, { info: "Target actor's system data (getter)" })
        : { type: "property", detail: "object", info: "Target actor's system data (getter)" },
      raceOrType: { type: "property", detail: "string", info: "Target's race or creature type" },
      typeOrRace: { type: "property", detail: "string", info: "Target's creature type or race" },
      items: { type: "property", detail: "array", info: "Target's item roll data" },
      equippedItems: { type: "property", detail: "array", info: "Target's equipped item roll data" },
      saved: { type: "property", detail: "boolean", info: "Whether target passed the save" },
      failedSave: { type: "property", detail: "boolean", info: "Whether target failed the save" },
      superSaver: { type: "property", detail: "boolean", info: "Whether target is a super saver" },
      semiSuperSaver: { type: "property", detail: "boolean", info: "Whether target is a semi-super saver" },
      isHit: { type: "property", detail: "boolean", info: "Whether target was hit by the attack" },
      isHitEC: { type: "property", detail: "boolean", info: "Whether target was hit (EC)" },
      canSense: { type: "property", detail: "boolean", info: "Whether target can sense the attacker" },
      canSee: { type: "property", detail: "boolean", info: "Whether target can see the attacker" },
      isCombatTurn: { type: "property", detail: "boolean", info: "Whether it's the target's combat turn" },
    }
  };

  // Target identity fields at root level
  completions.targetUuid = { type: "property", detail: "string", info: "Target token document UUID" };
  completions.targetId = { type: "property", detail: "string", info: "Target token ID" };
  completions.targetActorUuid = { type: "property", detail: "string", info: "Target actor UUID" };
  completions.targetActorId = { type: "property", detail: "string", info: "Target actor ID" };
  completions.raceOrType = { type: "property", detail: "string", info: "Target's race or creature type" };
  completions.typeOrRace = { type: "property", detail: "string", info: "Target's creature type or race" };

  // Visibility at root level
  completions.canSense = { type: "property", detail: "boolean", info: "Whether actor can sense the target" };
  completions.canSee = { type: "property", detail: "boolean", info: "Whether actor can see the target" };

  // General
  completions.humanoid = { type: "property", detail: "string[]", info: "Array of humanoid race/type strings" };
  completions.tokenUuid = { type: "property", detail: "string", info: "Actor's token document UUID" };
  completions.tokenId = { type: "property", detail: "string", info: "Actor's token ID (deprecated)" };

  // ── Workflow — pull rich children from midiCompletions tree entry ──
  completions.workflow = cloneWithExtras(tree.workflow,
    { info: "The active midi-qol Workflow instance" }
  );
  completions.w = cloneWithExtras(tree.workflow,
    { detail: "Workflow", info: "Alias for workflow" }
  );

  // ── Activity — pull rich children from midiCompletions tree entry ──
  completions.activity = cloneWithExtras(tree.activity,
    { info: "The workflow's triggering activity" }
  );
  completions.a = cloneWithExtras(tree.activity,
    { detail: "Activity", info: "Alias for activity" }
  );
  completions.otherDamageActivity = cloneWithExtras(tree.activity,
    { detail: "Activity", info: "Other/versatile damage activity" }
  );

  completions.riderStatuses = { type: "property", detail: "object", info: "Status effects from applied effect riders ({status: true})" };
  completions.hasSave = { type: "property", detail: "boolean", info: "Whether the workflow includes a save" };
  completions.shouldRollDamage = { type: "property", detail: "boolean", info: "Whether damage should be rolled" };
  completions.hasAttack = { type: "property", detail: "boolean", info: "Whether the activity has an attack roll" };
  completions.hasDamage = { type: "property", detail: "boolean", info: "Whether the activity deals damage" };

  // ── item — item roll data (getRollData().item), NOT the full Item document ──
  // In createConditionData: rollData.item = data.workflow.item.getRollData().item
  // This is item.system data spread + name, type, img, etc.
  const itemSystemChildren = tree.item?.children?.system?.children ?? {};
  completions.item = {
    type: "property",
    detail: "object",
    info: "Item roll data (from getRollData().item, not the full Item document)",
    children: {
      ...itemSystemChildren,
      actionType: { type: "property", detail: "string", info: "Activity action type (mwak, rsak, save, etc.)" },
    }
  };

  // ── Damage type info ──
  completions.damageTypes = { type: "property", detail: "object", info: "Damage types from the roll ({type: true})" };
  completions.defaultDamageType = { type: "property", detail: "object", info: "Default damage type from the roll" };

  // ── Combat fields ──
  completions.combatRound = { type: "property", detail: "number", info: "Current combat round number" };
  completions.combatTurn = { type: "property", detail: "number", info: "Current combat turn number" };
  completions.combatTime = { type: "property", detail: "number", info: "Combat time (round + turn/100)" };
  completions.isCombatTurn = { type: "property", detail: "boolean", info: "Whether it's the actor's combat turn" };

  // ── Constants — pull rich children from global tree ──
  if (tree.CONFIG) completions.CONFIG = cloneWithExtras(tree.CONFIG);
  if (tree.CONST) completions.CONST = cloneWithExtras(tree.CONST);

  // ── Sandbox helper functions (merged by asyncMySafeEval/mySafeEval) ──
  // Pull function completions from the MidiQOL tree to avoid duplicating detail/info strings.
  // These are the same functions exported on globalThis.MidiQOL and injected into the condition sandbox.
  const midiChildren = tree.MidiQOL?.children ?? {};

  // Roll — pull rich class info (static + instance methods) from global tree
  completions.Roll = cloneWithExtras(tree.Roll,
    { info: "Foundry Roll class for dice expressions" }
  );

  // Functions shared with MidiQOL namespace — reference tree entries directly
  for (const fn of [
    "findNearby", "findNearbyCount", "checkNearby", "hasCondition",
    "checkIncapacitated", "canSee", "canSense", "computeDistance",
    "checkActivityRange", "checkDistance", "contestedRoll", "sizeNumeric",
  ]) {
    if (midiChildren[fn]) completions[fn] = midiChildren[fn];
  }

  // Functions only available in condition sandbox (not in MidiQOL namespace)
  completions.checkDefeated = {
    type: "function",
    detail: "(actorRef) => 0 | 1",
    info: "Check if actor/token is defeated.\nReturns: 1 if defeated, 0 if not"
  };
  completions.fromUuidSync = {
    type: "function",
    detail: "(uuid) => Document | null",
    info: "Synchronously resolve a UUID to a Document"
  };
  completions.confirm = {
    type: "function",
    detail: "(message) => Promise<boolean>",
    info: "Show a confirmation dialog (async only)"
  };
  completions.nonWorkflowTargetedToken = {
    type: "property",
    detail: "string",
    info: "UUID of the first user-targeted token (outside workflow context)"
  };
  // combat — pull rich children from global tree (game.combat runtime data)
  completions.combat = cloneWithExtras(tree.game?.children?.combat ?? tree.combat,
    { detail: "Combat", info: "Active combat encounter (game.combat)" }
  );
  completions.evalRaceOrType = {
    type: "function",
    detail: "(actor) => string",
    info: "Get race (PCs) or creature type (NPCs) of an actor"
  };
  completions.evalTypeOrRace = {
    type: "function",
    detail: "(actor) => string",
    info: "Get creature type (NPCs) or race (PCs) of an actor"
  };
  // getRollData() fields are available at the root level too (abilities, attributes, details, etc.)
  // Merge actor system schema completions so users can type e.g. abilities.str.mod directly
  if (actorSystemChildren) {
    for (const [key, value] of Object.entries(actorSystemChildren as Record<string, any>)) {
      if (!completions[key]) {
        completions[key] = value;
      }
    }
  }

  return completions;
}

/**
 * Build a Blockly-specific category specification for the condition editor.
 * Organized into: Actor Data, Target Data, Workflow, Combat, Functions.
 * Only includes variables explicitly available in the condition sandbox.
 * Each category maps JS code paths to completion entries used by the
 * Blockly editor to register property/function blocks.
 */
function buildBlocklyCategories(api: any): Record<string, Record<string, any>> {
  const midiChildren = api.tree?.MidiQOL?.children ?? {};
  // getRollData() flattens system data, so actor.abilities.str.mod is correct
  // (not actor.system.abilities.str.mod) in the condition sandbox
  const actorSystemChildren = api.tree?.actor?.children?.system?.children ?? {};

  // Item system children for getRollData().item properties — prefer Item5e if available
  const itemSystemChildren = api.tree?.Item5e?.children?.system?.children
    ?? api.tree?.item?.children?.system?.children ?? {};

  // Activity children from the completion tree
  const activityChildren = api.tree?.activity?.children ?? {};

  // Build indexed array children: indices 0-4, each with item system properties
  // Generates code like items[0].name, equippedItems[2].level, etc.
  function buildArrayItemChildren(): Record<string, any> {
    const indexed: Record<string, any> = {};
    for (let i = 0; i <= 4; i++) {
      indexed[String(i)] = {
        type: "property",
        detail: "object",
        info: `Item at index ${i} (item.getRollData() format)`,
        children: itemSystemChildren,
      };
    }
    return indexed;
  }

  // Build actor entries: condition-specific leaf fields + namespace blocks for system subtrees
  const actorEntries: Record<string, any> = {
    "actor.raceOrType": { type: "property", detail: "string", info: "Race (PCs) or creature type (NPCs)" },
    "actor.typeOrRace": { type: "property", detail: "string", info: "Creature type (NPCs) or race (PCs)" },
    "actor.isCombatTurn": { type: "property", detail: "boolean", info: "Whether it's this actor's combat turn" },
    canSee: { type: "property", detail: "boolean", info: "Whether actor can see the target" },
    canSense: { type: "property", detail: "boolean", info: "Whether actor can sense the target" },
    equippedItems: { type: "property", detail: "object[]", info: "Actor's equipped items (item.getRollData() format)", children: buildArrayItemChildren() },
    isAttuned: { type: "property", detail: "boolean", info: "Whether the triggering item is attuned" },
    items: { type: "property", detail: "object[]", info: "Actor's items (item.getRollData() format)", children: buildArrayItemChildren() },
    tokenUuid: { type: "property", detail: "string", info: "Actor's token document UUID" },
  };
  // Add system subtrees as namespace blocks (actor.abilities, actor.attributes, etc.)
  for (const [key, entry] of Object.entries(actorSystemChildren as Record<string, any>)) {
    const children = entry?.children ?? entry?.instanceChildren;
    if (children && Object.keys(children).length > 0) {
      actorEntries[`actor.${key}`] = { ...entry, children };
    }
  }

  // Build target entries: condition-specific leaf fields + namespace blocks for system subtrees
  const targetEntries: Record<string, any> = {
    "target.canSee": { type: "property", detail: "boolean", info: "Whether target can see the attacker" },
    "target.canSense": { type: "property", detail: "boolean", info: "Whether target can sense the attacker" },
    "target.equippedItems": { type: "property", detail: "object[]", info: "Target's equipped items (item.getRollData() format)", children: buildArrayItemChildren() },
    "target.failedSave": { type: "property", detail: "boolean", info: "Whether target failed the save" },
    "target.isCombatTurn": { type: "property", detail: "boolean", info: "Whether it's the target's combat turn" },
    "target.isHit": { type: "property", detail: "boolean", info: "Whether target was hit by the attack" },
    "target.isHitEC": { type: "property", detail: "boolean", info: "Whether target was hit (including EC)" },
    "target.items": { type: "property", detail: "object[]", info: "Target's items (item.getRollData() format)", children: buildArrayItemChildren() },
    "target.raceOrType": { type: "property", detail: "string", info: "Target's race or creature type" },
    "target.saved": { type: "property", detail: "boolean", info: "Whether target passed the save" },
    "target.semiSuperSaver": { type: "property", detail: "boolean", info: "Whether target is a semi-super saver" },
    "target.superSaver": { type: "property", detail: "boolean", info: "Whether target is a super saver" },
    "target.typeOrRace": { type: "property", detail: "string", info: "Target's creature type or race" },
    raceOrType: { type: "property", detail: "string", info: "Target's race or creature type" },
    targetActorUuid: { type: "property", detail: "string", info: "Target actor UUID" },
    targetUuid: { type: "property", detail: "string", info: "Target token document UUID" },
    typeOrRace: { type: "property", detail: "string", info: "Target's creature type or race" },
  };
  // Add system subtrees as namespace blocks (target.abilities, target.attributes, etc.)
  for (const [key, entry] of Object.entries(actorSystemChildren as Record<string, any>)) {
    const children = entry?.children ?? entry?.instanceChildren;
    if (children && Object.keys(children).length > 0) {
      targetEntries[`target.${key}`] = { ...entry, children };
    }
  }

  return {
    "Actor Data": actorEntries,
    "Target Data": targetEntries,
    "Workflow": {
      hasAttack: { type: "property", detail: "boolean", info: "Whether the activity has an attack roll" },
      hasDamage: { type: "property", detail: "boolean", info: "Whether the activity deals damage" },
      hasSave: { type: "property", detail: "boolean", info: "Whether the workflow includes a save" },
      isConcentrationCheck: { type: "property", detail: "boolean", info: "Whether this is a concentration check" },
      isDeathSave: { type: "property", detail: "boolean", info: "Whether this is a death saving throw" },
      item: { type: "property", detail: "object", info: "Triggering item (item.getRollData() format)", children: itemSystemChildren },
      shouldRollDamage: { type: "property", detail: "boolean", info: "Whether damage should be rolled" },
      "workflow.activity": { type: "variable", detail: "Activity", info: "The workflow's triggering activity", children: activityChildren },
    },
    "World": {
      worldTime: { type: "property", detail: "number", info: "Current world time (game.time.worldTime)" },
    },
    "Combat": {
      combatRound: { type: "property", detail: "number", info: "Current combat round number" },
      combatTime: { type: "property", detail: "number", info: "Combat time (round + turn/100)" },
      combatTurn: { type: "property", detail: "number", info: "Current combat turn number" },
      isCombatTurn: { type: "property", detail: "boolean", info: "Whether it's the actor's combat turn" },
    },
    "Functions": {
      ...(midiChildren.findNearby ? { findNearby: midiChildren.findNearby } : {}),
      ...(midiChildren.findNearbyCount ? { findNearbyCount: midiChildren.findNearbyCount } : {}),
      ...(midiChildren.checkNearby ? { checkNearby: midiChildren.checkNearby } : {}),
      ...(midiChildren.hasCondition ? { hasCondition: midiChildren.hasCondition } : {}),
      ...(midiChildren.checkIncapacitated ? { checkIncapacitated: midiChildren.checkIncapacitated } : {}),
      ...(midiChildren.computeDistance ? { computeDistance: midiChildren.computeDistance } : {}),
      ...(midiChildren.sizeNumeric ? { sizeNumeric: midiChildren.sizeNumeric } : {}),
      checkDefeated: { type: "function", detail: "(actorRef) => 0 | 1", info: "Check if actor/token is defeated" },
      fromUuidSync: { type: "function", detail: "(uuid) => Document | null", info: "Synchronously resolve a UUID to a Document" },
      evalRaceOrType: { type: "function", detail: "(actor) => string", info: "Get race (PCs) or creature type (NPCs) of an actor" },
      evalTypeOrRace: { type: "function", detail: "(actor) => string", info: "Get creature type (NPCs) or race (PCs) of an actor" },
    },
  };
}

export class ConditionEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  declare originalValue: string;
  declare flagKey: string;
  declare effect: ActiveEffect | undefined;
  declare label: string | undefined;
  declare parentDoc: Actor | Item | null;
  declare onSubmitCallback: (value: string) => void;
  declare onCancelCallback: () => void;
  declare submitted: boolean;

  constructor(editorOptions: ConditionEditorOptions, appOptions?: Partial<foundry.applications.api.ApplicationV2.Configuration>) {
    super(appOptions);
    this.originalValue = editorOptions.value;
    this.flagKey = editorOptions.key;
    this.effect = editorOptions.effect;
    this.label = editorOptions.label;
    this.parentDoc = editorOptions.parent;
    this.onSubmitCallback = editorOptions.onSubmit;
    this.onCancelCallback = editorOptions.onCancel;
    this.submitted = false;
  }

  static override DEFAULT_OPTIONS = {
    id: "midi-qol-condition-editor",
    window: {
      title: "midi-qol.ConditionEditor.Title",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 650,
      height: 400,
    },
    actions: {
      save: ConditionEditor.#onSave,
      cancel: ConditionEditor.#onCancel,
    }
  };

  static override PARTS = {
    form: {
      template: "modules/midi-qol/templates/apps/ConditionEditor/conditionEditor.hbs"
    }
  };

  get title(): string {
    const name = this.effect?.name ?? this.label ?? "";
    return `${i18n("midi-qol.ConditionEditor.Title")}: ${name}`;
  }

  override async _prepareContext(options: foundry.applications.api.ApplicationV2.RenderOptions) {
    const context: Record<string, any> = await super._prepareContext(options);
    context.value = this.originalValue;
    context.key = this.flagKey;
    return context;
  }

  override async _onRender(context: Record<string, any>, options: foundry.applications.api.ApplicationV2.RenderOptions) {
    await super._onRender(context, options);

    const codeMirrorEl = this.element.querySelector("code-mirror") as HTMLElement | null;
    if (!codeMirrorEl) return;

    // Set value programmatically — avoids HTML attribute escaping issues with quotes/special chars.
    const editorValue = this.originalValue || "true";
    (codeMirrorEl as any).value = editorValue;

    // Inject contextual completions into the code-mirror element via macro-autocomplete API
    const macroAutoComplete = (game as any).modules?.get("macro-autocomplete");
    const api = macroAutoComplete?.api;
    if (!api?.setContextCompletions) return;

    const completions = buildConditionCompletions(api);
    const blocklyCategories = buildBlocklyCategories(api);
    api.setContextCompletions(codeMirrorEl, completions, blocklyCategories);
  }

  /** Read current value from the code-mirror element */
  #getCurrentValue(): string {
    const codeMirrorEl = this.element.querySelector("code-mirror") as HTMLElement | null;
    if (!codeMirrorEl) return this.originalValue;
    // Foundry's <code-mirror> exposes the value as a property
    return (codeMirrorEl as any).value ?? this.originalValue;
  }

  get hasUnsavedChanges(): boolean {
    return this.#getCurrentValue() !== this.originalValue;
  }

  override async close(options?: foundry.applications.api.ApplicationV2.ClosingOptions): Promise<this> {
    if (!this.submitted && this.hasUnsavedChanges) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: i18n("midi-qol.OverTimeEditor.UnsavedTitle") },
        content: `<p>${i18n("midi-qol.OverTimeEditor.UnsavedContent")}</p>`,
        yes: { label: i18n("midi-qol.OverTimeEditor.CloseWithoutSaving") },
        no: { label: i18n("midi-qol.OverTimeEditor.Cancel") }
      });
      if (!confirmed) return this;
    }
    // Clean up contextual completions
    const api = (game as any).modules?.get("macro-autocomplete")?.api;
    const codeMirrorEl = this.element?.querySelector("code-mirror");
    if (api?.clearContextCompletions && codeMirrorEl) {
      api.clearContextCompletions(codeMirrorEl);
    }
    return super.close(options);
  }

  static #onSave(this: ConditionEditor): void {
    const value = this.#getCurrentValue();
    this.submitted = true;
    this.onSubmitCallback(value);
    this.close();
  }

  static #onCancel(this: ConditionEditor): void {
    this.submitted = true;
    this.onCancelCallback();
    this.close();
  }

  override async _preClose(options): Promise<void> {
    await super._preClose(options);
    if (!this.submitted) {
      this.onCancelCallback();
    }
  }
}
