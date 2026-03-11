/**
 * Midi-qol specific completions injected into macro-autocomplete via hook.
 *
 * Registers a "macro-autocomplete.ready" hook handler that injects:
 * - MidiQOL namespace (all API functions)
 * - workflow top-level variable (tracker, targets, hitTargets, etc.)
 * - scope midi-specific fields (workflow, macroPass, hitTargets, etc.)
 * - args[0] midi-specific info
 */

interface CompletionEntry {
  type?: string;
  detail?: string;
  info?: string;
  children?: CompletionNode;
  staticChildren?: CompletionNode;
  instanceChildren?: CompletionNode;
  constructorDetail?: string;
}

interface CompletionNode {
  [key: string]: CompletionEntry;
}

const MIDI_COMPLETIONS: CompletionNode = {
  MidiQOL: {
    children: {
      // Workflow classes
      Workflow: {
        type: "class", detail: "class", info: "Main workflow class",
        children: {
          getWorkflow: { type: "function", detail: "(uuid) => Workflow", info: "Get a workflow by its message UUID" },
        }
      },
      DamageOnlyWorkflow: { type: "class", detail: "class", info: "Workflow for damage-only rolls" },
      TrapWorkflow: { type: "class", detail: "class", info: "Workflow for trap effects" },
      RollModifierTracker: { type: "class", detail: "class", info: "Tracks roll modifiers (advantage, critical, etc.)" },

      // Item/activity use
      completeItemUse: { type: "function", detail: "(item, config?, dialog?, message?) => Promise<Workflow>", info: "Complete an item use workflow.\n- item: Item or UUID string\n- config.chooseActivity: show dialog to pick activity\n- config.midiOptions: {advantage, disadvantage, critical, fastForward, targetUuids, ...}\nReturns: Workflow or undefined" },
      completeActivityUse: { type: "function", detail: "(activity, usage?, dialog?, message?) => Promise<Workflow>", info: "Complete an activity use workflow.\n- activity: Activity or UUID string\n- usage.midiOptions: {advantage, disadvantage, critical, fastForward, fastForwardAttack, fastForwardDamage, targetUuids, targetsToUse, rollAs, ignoreUserTargets, ...}\nReturns: Workflow or undefined" },

      // Distance and targeting
      computeDistance: { type: "function", detail: "(token1, token2, options?) => number", info: "Compute distance between two tokens in grid units.\n- options.wallsBlock: block if no LOS (default false)\n- options.includeCover: include cover calc (default true)\n- options.includeElevation: include height difference\nReturns: distance or -1 if fully blocked" },
      checkDistance: { type: "function", detail: "(t1, t2, distance, options?) => boolean", info: "Check if two tokens are within a given distance.\n- distance: max distance in grid units\n- options.wallsBlock: block if no LOS (default false)\n- options.includeCover: include cover calc (default true)\nReturns: true if distance <= threshold" },
      findNearby: { type: "function", detail: "(disposition, token, distance, options?) => Token[]", info: "Find all tokens within distance matching disposition.\n- disposition: -1=hostile, 0=neutral, 1=friendly, null/\"all\"=any, or array\n- options: {includeIncapacitated, canSee, isSeen, includeToken, maxSize, relative}\n- relative (default true): disposition relative to token\nReturns: Token[]" },
      findNearbyCount: { type: "function", detail: "(disposition, token, distance, options?) => number", info: "Count tokens within distance matching disposition.\n- disposition: -1=hostile, 0=neutral, 1=friendly, null/\"all\"=any, or array\n- options: {includeIncapacitated, canSee, isSeen, includeToken, maxSize, relative}\nReturns: number of matching tokens" },
      checkNearby: { type: "function", detail: "(disposition, token, distance, options?) => boolean", info: "Check if any token is within distance matching disposition.\n- disposition: -1=hostile, 0=neutral, 1=friendly, null/\"all\"=any\n- options: {includeIncapacitated, canSee, isSeen, includeToken, maxSize, relative}\nReturns: true if at least one match found" },
      computeCoverBonus: { type: "function", detail: "(attacker, target, activity?) => number", info: "Compute cover AC bonus for target against attacker.\n- attacker/target: Token or TokenDocument\n- activity: optional, used for ignore-cover checks\nReturns: 0=none, 2=half, 5=three-quarters, 999=full" },
      checkActivityRange: { type: "function", detail: "(activity, token, targets?, showWarning?) => object", info: "Check if targets are within activity's range.\n- showWarning: display UI warning if out of range (default true)\nReturns: {result, attackingToken, range, longRange}\n- result: \"normal\", \"longRange\", or \"outOfRange\"" },
      selectTargetsFromTemplates: { type: "function", detail: "(templates, selfTokenRef?, ignoreSelf?, AoETargetType?, autoTarget?) => Token[]", info: "Target tokens in template area and update game.user.targets.\n- AoETargetType: \"any\", \"enemy\", \"ally\", \"self\", \"neutral\"\n- autoTarget: \"none\", \"wallsBlock\", \"wallsBlockIgnoreDefeated\", \"wallsBlockIgnoreIncapacitated\", \"walledtemplates\"\nReturns: Token[]" },
      computeTargetsFromTemplates: { type: "function", detail: "(templates, selfTokenRef?, ignoreSelf?, AoETargetType?, autoTarget?) => Token[]", info: "Compute tokens in template area WITHOUT modifying game.user.targets.\n- AoETargetType: \"any\", \"enemy\", \"ally\", \"self\", \"neutral\"\n- autoTarget: \"none\", \"wallsBlock\", \"wallsBlockIgnoreDefeated\", \"wallsBlockIgnoreIncapacitated\"\nReturns: Token[]" },

      // Conditions and effects
      hasCondition: { type: "function", detail: "(actorRef, condition) => 0 | 1", info: "Check if actor/token has a condition.\n- actorRef: Actor, Token, TokenDocument, or UUID string\n- condition: status id (e.g. \"prone\", \"blinded\", \"concentrating\", \"stunned\")\nReturns: 1 if condition exists, 0 if not or immune" },
      checkIncapacitated: { type: "function", detail: "(actorRef?, log?, warn?) => string | false", info: "Check if actor is incapacitated.\n- actorRef: Actor, Token, or UUID string\n- log: log result to console (default true)\n- warn: show UI warning (default false)\nReturns: condition name (e.g. \"dead\", \"unconscious\") or false" },
      createConditionData: { type: "function", detail: "({actor, condition, ...}) => object", info: "Create condition/rollData for evalCondition.\n- Fields: {workflow, target, actor, item, activity, token, extraData, options}\nReturns: object with rollData, damage info, combat state for condition evaluation" },
      getConcentrationEffect: { type: "function", detail: "(actor?, item?) => ActiveEffect | undefined", info: "Get the concentration effect for an actor" },
      addConcentrationDependent: { type: "function", detail: "(actorRef, dependent, item?) => Promise", info: "Add a concentration dependent" },
      createEffects: { type: "function", detail: "({actorUuid, effects, options}) => Promise<boolean>", info: "Create active effects on an actor (runs as GM).\n- actorUuid: actor UUID string\n- effects: array of ActiveEffect.CreateData objects\n- options: {keepId: boolean}\nReturns: true on success, false on failure" },
      removeEffects: { type: "function", detail: "({actorUuid, effects}) => Promise<boolean>", info: "Remove active effects from an actor (runs as GM).\n- actorUuid: actor UUID string\n- effects: array of effect ID strings\nReturns: true on success, false on failure" },
      updateEffects: { type: "function", detail: "({actorUuid, updates}) => Promise", info: "Update effects on an actor by UUID" },
      chooseEffect: { type: "function", detail: "({actor, token?, item?, ...}) => Promise<ActiveEffect | false>", info: "Show dialog to choose which effect to apply from an item.\n- Fields: {actor, token, item, workflow, options}\n- options.chooseAll: auto-apply all without dialog\n- options.timeout: dialog timeout in ms\nReturns: selected ActiveEffect or false" },

      // Damage
      applyTokenDamage: { type: "function", detail: "(damageDetail, totalDamage, targets, item, saves, options?) => Promise<string[]>", info: "Apply damage to a set of tokens, creating damage cards.\n- damageDetail: [{value, type, properties}] array\n- targets/saves: Set<Token>\n- options: {workflow, superSavers, semiSuperSavers, forceApply, noConcentrationCheck}\nReturns: array of damage card UUIDs" },
      applyTokenDamageMany: { type: "function", detail: "(targetDamages, item, options?) => Promise<string[]>", info: "Apply different damage/healing amounts to multiple targets, producing a single damage card.\n- targetDamages: [{token, damageDetail, totalDamage}] — each entry has its own damage detail and total\n- item: Item responsible for the damage (used for card display)\n- options: {workflow, forceApply, updateOptions}\nReturns: array of damage card UUIDs" },
      createDamageDetail: { type: "function", detail: "({roll, activity, defaultType?}) => DamageDescription[]", info: "Create damage detail from roll results.\n- roll: Roll or Roll[]\n- activity: Activity (for damage type info)\n- defaultType: fallback damage type\nReturns: [{value, type, formula, properties}]" },
      getTraitMult: { type: "function", detail: "(actor, damageType, item, props?) => number", info: "Get damage trait multiplier for an actor.\n- damageType: e.g. \"fire\", \"slashing\", \"healing\"\n- props: string[] of damage properties (e.g. \"mgc\")\nReturns: -1=healing, 0=immune, 0.5=resistant, 1=normal, 2=vulnerable" },
      modifyDamageBy: { type: "function", detail: "({damageItem, value, multiplier?, type?, reason?}) => object", info: "Modify damage during isDamaged macro pass only.\n- damageItem: DamageListEntry from workflow\n- value: amount to add/subtract\n- multiplier: optional damage multiplier\n- type/reason: for logging\nReturns: damage modification object" },

      // Rolls
      addRollTo: { type: "function", detail: "(roll, bonusRoll) => Roll", info: "Add a bonus roll to another roll" },
      doConcentrationCheck: { type: "function", detail: "(actor, saveDC) => Promise<Roll>", info: "Perform a concentration check" },
      contestedRoll: { type: "function", detail: "(data) => Promise<{result, rolls}>", info: "Perform a contested roll between two actors.\n- data.source/target: {rollType, ability, token, rollOptions}\n- rollType: \"test\" (ability check), \"save\", \"skill\"\n- data.success/failure/drawn: callback functions\nReturns: {result: number (+source wins, -target wins, 0=draw), rolls}" },
      displayDSNForRoll: { type: "function", detail: "(rolls?, rollType?, rollMode?) => Promise", info: "Display Dice So Nice 3D dice animation" },
      sumRolls: { type: "function", detail: "(rolls?, countHealing?) => number", info: "Sum roll results" },
      computeAbilityAdvantage: { type: "function", detail: "(actor, ability) => string | null", info: "Compute advantage/disadvantage for ability roll" },
      computeSkillAdvantage: { type: "function", detail: "(actor, skill) => string | null", info: "Compute advantage/disadvantage for skill roll" },
      computeToolAdvantage: { type: "function", detail: "(actor, tool) => string | null", info: "Compute advantage/disadvantage for tool check" },

      // Token/actor helpers
      tokenForActor: { type: "function", detail: "(actor) => Token | undefined", info: "Get the first token for an actor" },
      actorFromUuid: { type: "function", detail: "(uuid?) => Actor | null", info: "Get actor from UUID string" },
      playerFor: { type: "function", detail: "(target?) => User | null", info: "Get the player controlling a token" },
      playerForActor: { type: "function", detail: "(actor?) => User | undefined", info: "Get the player controlling an actor" },
      getTokenPlayerName: { type: "function", detail: "(token, checkGM?) => string", info: "Get the player name controlling a token" },
      raceOrType: { type: "function", detail: "(entity) => string", info: "Get race (PCs) or creature type (NPCs)" },
      sizeNumeric: { type: "function", detail: "(size: string) => number | undefined", info: "Get numerical size index (0=tiny, 1=sm, 2=med, 3=lg, 4=huge, 5=grg). Accepts short keys (\"sm\", \"lg\") or long names (\"Small\", \"Large\"), case insensitive." },
      typeOrRace: { type: "function", detail: "(entity) => string", info: "Get creature type (NPCs) or race (PCs)" },
      canSee: { type: "function", detail: "(token, target) => boolean", info: "Check if token can see target (sight-based detection only).\n- token/target: Token, TokenDocument, or UUID string\nReturns: true if token has line of sight to target" },
      canSense: { type: "function", detail: "(token, target, validModes?) => boolean", info: "Check if token can detect target via detection modes.\n- validModes: [\"all\"] (default), or specific modes:\n  \"basicSight\", \"lightPerception\", \"blindsight\", \"darkvision\", \"tremorsense\", \"truesight\"\nReturns: true if any valid mode detects target" },
      canSenseModes: { type: "function", detail: "(token, target, validModes?) => string[]", info: "Get detection modes token can use to sense target" },
      getOrCreateTokenForActor: { type: "function", detail: "(actor?) => Token | undefined", info: "Get or create a token for an actor" },
      moveToken: { type: "function", detail: "(tokenRef, newCenter, animate?) => Promise", info: "Move a token to a new position (runs as GM).\n- tokenRef: Token, TokenDocument, or UUID string\n- newCenter: {x, y} canvas coordinates\n- animate: animate movement (default true)" },
      moveTokenAwayFromPoint: { type: "function", detail: "(targetRef, distance, point, animate?, checkCollision?) => Promise", info: "Push a token away from a point (runs as GM).\n- targetRef: Token, TokenDocument, or UUID string\n- distance: distance to push in grid units\n- point: {x, y} origin point to push away from\n- checkCollision: stop at walls (default false)" },

      // Action economy
      hasUsedReaction: { type: "function", detail: "(actor) => boolean", info: "Check if reaction has been used this turn" },
      hasUsedBonusAction: { type: "function", detail: "(actor) => boolean", info: "Check if bonus action has been used this turn" },
      setReactionUsed: { type: "function", detail: "(actor, active?) => Promise", info: "Mark reaction as used (or remove if false)" },
      setBonusActionUsed: { type: "function", detail: "(actor) => Promise", info: "Mark bonus action as used" },
      removeReactionUsed: { type: "function", detail: "(actor, force?) => Promise", info: "Remove reaction used flag" },
      removeBonusActionUsed: { type: "function", detail: "(actor, force?) => Promise", info: "Remove bonus action used flag" },
      removeActionUsed: { type: "function", detail: "(actor) => Promise", info: "Remove action used flag" },

      // Over-time effects
      doOverTimeEffect: { type: "function", detail: "(actor, effect, startTurn?, options?) => Promise", info: "Execute an over-time effect" },

      // Conditions helpers
      removeHiddenCondition: { type: "function", detail: "(tokenRef?) => Promise", info: "Remove hidden condition from token" },
      removeInvisibleCondition: { type: "function", detail: "(tokenRef?) => Promise", info: "Remove invisible condition from token" },

      // Undo
      undoMostRecentWorkflow: { type: "function", detail: "() => Promise", info: "Undo the most recent workflow" },
      showUndoQueue: { type: "function", detail: "()", info: "Display the undo queue" },
      getUndoQueue: { type: "function", detail: "() => ChatMessage[]", info: "Get the undo queue" },

      // Macro resolution
      resolveItemMacro: { type: "function", detail: "(item, macroName, macroText, rollData) => Promise", info: "Resolve and execute an item macro" },
      resolveActivityMacro: { type: "function", detail: "(activity, macroName, macroText, rollData) => Promise", info: "Resolve and execute an activity macro" },

      // Condition evaluation
      evalCondition: { type: "function", detail: "(condition, conditionData, options?) => any", info: "Evaluate a condition expression using roll data.\n- condition: formula string with @references, number, or boolean\n- conditionData: rollData object (from createConditionData)\n- options: {errorReturn (default false), async (default false)}\nReturns: evaluated result (boolean/number), or Promise if async" },
      evalAllConditions: { type: "function", detail: "(actorRef, flag, conditionData) => Promise<boolean>", info: "Evaluate all conditions for a flag" },

      // Settings and config
      configSettings: { type: "function", detail: "() => object", info: "Get current midi-qol configuration settings" },
      checkRule: { type: "function", detail: "(rule) => any", info: "Get the value of a configured rule" },
      safeGetGameSetting: { type: "function", detail: "(scope, key) => any", info: "Safely get a game setting" },
      enableWorkflow: { type: "function", detail: "(workflowType) => boolean", info: "Check if a workflow type is enabled" },

      // Vitality system
      hasVitalitySystem: { type: "function", detail: "(actor?) => boolean", info: "Check if actor uses vitality system" },
      getVitalityItem: { type: "function", detail: "(actor?) => Item | undefined", info: "Get the vitality item for an actor" },
      getVitalityValue: { type: "function", detail: "(actor?) => number | undefined", info: "Get current vitality value" },
      getVitalityMax: { type: "function", detail: "(actor?) => number | undefined", info: "Get max vitality value" },

      // Origin / item resolution
      getItemFromEffectOrigin: { type: "function", detail: "(origin: string) => Item | undefined", info: "Resolve an effect's origin to the source Item, traversing concentration and other ActiveEffect chains. Handles recursive origins with cycle detection." },

      // Misc
      showItemInfo: { type: "function", detail: "(item) => Promise<ChatMessage>", info: "Show item information in chat" },
      getChanges: { type: "function", detail: "(actorOrItem, key) => ActiveEffect[]", info: "Get effects that modify a specific key" },
      addDependent: { type: "function", detail: "(document, dependent) => void", info: "Add a dependent to a document" },

      // Localization
      i18n: { type: "function", detail: "(key) => string", info: "Localize a string key" },
      i18nFormat: { type: "function", detail: "(key, data?) => string", info: "Localize and format a string key" },

      // Logging
      debug: { type: "function", detail: "(...args) => void", info: "Log debug message (only when debug enabled)" },
      log: { type: "function", detail: "(...args) => void", info: "Log normal message" },
      warn: { type: "function", detail: "(...args) => void", info: "Log warning message" },
      error: { type: "function", detail: "(...args) => void", info: "Log error message" },
    }
  },

  workflow: {
    type: "variable", detail: "Workflow", info: "The midi-qol workflow instance",
    children: {
      tracker: {
        type: "property", detail: "RollModifierTracker", info: "The attack roll modifier tracker",
        children: {
          advantage: {
            type: "property", detail: "AdvantageDisadvantageTracker", info: "Advantage sub-tracker",
            children: {
              add: { type: "method", detail: "(source?, displayName?)", info: "Add a source of advantage" },
              clear: { type: "method", detail: "()", info: "Clear active state" },
              suppress: { type: "method", detail: "(source?, displayName?)", info: "Suppress advantage" },
              setOverride: { type: "method", detail: "(source?, displayName?)", info: "Force advantage, bypassing suppression" },
              clearOverride: { type: "method", detail: "()", info: "Clear override state" },
              reset: { type: "method", detail: "()", info: "Reset all state" },
              isActive: { type: "property", detail: "true | undefined", info: "Computed final state" },
              isAdded: { type: "property", detail: "boolean", info: "Whether at least one source was added" },
              isSuppressed: { type: "property", detail: "boolean", info: "Whether suppressed" },
              hasOverride: { type: "property", detail: "boolean", info: "Whether override is set" },
              get: { type: "property", detail: "{ active, suppressed, override }", info: "Full state snapshot" },
            }
          },
          disadvantage: {
            type: "property", detail: "AdvantageDisadvantageTracker", info: "Disadvantage sub-tracker",
            children: {
              add: { type: "method", detail: "(source?, displayName?)", info: "Add a source of disadvantage" },
              clear: { type: "method", detail: "()", info: "Clear active state" },
              suppress: { type: "method", detail: "(source?, displayName?)", info: "Suppress disadvantage" },
              setOverride: { type: "method", detail: "(source?, displayName?)", info: "Force disadvantage, bypassing suppression" },
              clearOverride: { type: "method", detail: "()", info: "Clear override state" },
              reset: { type: "method", detail: "()", info: "Reset all state" },
              isActive: { type: "property", detail: "true | undefined", info: "Computed final state" },
              isAdded: { type: "property", detail: "boolean", info: "Whether at least one source was added" },
              isSuppressed: { type: "property", detail: "boolean", info: "Whether suppressed" },
              hasOverride: { type: "property", detail: "boolean", info: "Whether override is set" },
              get: { type: "property", detail: "{ active, suppressed, override }", info: "Full state snapshot" },
            }
          },
          critical: {
            type: "property", detail: "CriticalFumbleTracker", info: "Critical hit sub-tracker",
            children: {
              setNatural: { type: "method", detail: "(source, displayName?)", info: "Set from dice roll" },
              force: { type: "method", detail: "(source, displayName?)", info: "Force critical hit" },
              suppress: { type: "method", detail: "(source, displayName?)", info: "Prevent critical hit" },
              setOverride: { type: "method", detail: "(value, source, displayName?)", info: "Absolute control (true=force, false=prevent)" },
              clearOverride: { type: "method", detail: "()", info: "Clear override" },
              reset: { type: "method", detail: "()", info: "Reset all state" },
              isActive: { type: "property", detail: "boolean", info: "Computed final critical state" },
              isNatural: { type: "property", detail: "boolean", info: "From dice roll" },
              isForced: { type: "property", detail: "boolean", info: "Forced by flag" },
              isSuppressed: { type: "property", detail: "boolean", info: "Prevented by flag" },
              hasOverride: { type: "property", detail: "boolean", info: "Override is set" },
            }
          },
          fumble: {
            type: "property", detail: "CriticalFumbleTracker", info: "Fumble sub-tracker",
            children: {
              setNatural: { type: "method", detail: "(source, displayName?)", info: "Set from dice roll" },
              force: { type: "method", detail: "(source, displayName?)", info: "Force fumble" },
              suppress: { type: "method", detail: "(source, displayName?)", info: "Prevent fumble" },
              setOverride: { type: "method", detail: "(value, source, displayName?)", info: "Absolute control" },
              clearOverride: { type: "method", detail: "()", info: "Clear override" },
              reset: { type: "method", detail: "()", info: "Reset all state" },
              isActive: { type: "property", detail: "boolean", info: "Computed final fumble state" },
              isNatural: { type: "property", detail: "boolean", info: "From dice roll" },
              isForced: { type: "property", detail: "boolean", info: "Forced by flag" },
              isSuppressed: { type: "property", detail: "boolean", info: "Prevented by flag" },
              hasOverride: { type: "property", detail: "boolean", info: "Override is set" },
            }
          },
          modifiers: {
            type: "property", detail: "RollValueTracker", info: "Roll value modifier sub-tracker",
            children: {
              fail: { type: "method", detail: "(source, displayName?)", info: "Set auto-fail" },
              succeed: { type: "method", detail: "(source, displayName?)", info: "Set auto-success" },
              min: { type: "method", detail: "(value, source, displayName?)", info: "Set minimum roll value" },
              max: { type: "method", detail: "(value, source, displayName?)", info: "Set maximum roll value" },
              forceMin: { type: "method", detail: "(value, source, displayName?)", info: "Force minimum roll value" },
              forceMax: { type: "method", detail: "(value, source, displayName?)", info: "Force maximum roll value" },
              reset: { type: "method", detail: "()", info: "Reset all state" },
              willFail: { type: "property", detail: "boolean", info: "Auto-fail is set" },
              willSucceed: { type: "property", detail: "boolean", info: "Auto-success is set" },
              minValue: { type: "property", detail: "number", info: "Minimum roll value" },
              maxValue: { type: "property", detail: "number", info: "Maximum roll value" },
            }
          },
          hasAdvantage: { type: "property", detail: "true | undefined", info: "Effective advantage state" },
          hasDisadvantage: { type: "property", detail: "true | undefined", info: "Effective disadvantage state" },
          isCritical: { type: "property", detail: "boolean", info: "Computed final critical state" },
          isFumble: { type: "property", detail: "boolean", info: "Computed final fumble state" },
          advantageMode: { type: "property", detail: "number", info: "ADV_MODE.ADVANTAGE, NORMAL, or DISADVANTAGE" },
          attribution: { type: "property", detail: "object", info: "Attribution map { ADV: {...}, DIS: {...} }" },
          reset: { type: "method", detail: "(options?)", info: "Reset all sub-trackers and attribution" },
        }
      },
      targets: {
        type: "property", detail: "Set<Token5e>", info: "The targeted tokens",
        children: {
          size: { type: "property", detail: "number", info: "Number of elements in the set" },
          has: { type: "method", detail: "(value) => boolean", info: "Check if a value is in the set" },
          add: { type: "method", detail: "(value) => Set", info: "Add a value to the set" },
          delete: { type: "method", detail: "(value) => boolean", info: "Remove a value from the set" },
          clear: { type: "method", detail: "() => void", info: "Remove all elements" },
          forEach: { type: "method", detail: "(callback) => void", info: "Execute a function for each element" },
          values: { type: "method", detail: "() => Iterator", info: "Returns an iterator of values" },
          first: { type: "method", detail: "() => Token5e | undefined", info: "Get the first element (Foundry Set)" },
        }
      },
      hitTargets: {
        type: "property", detail: "Set<Token5e>", info: "Tokens that were hit",
        children: {
          size: { type: "property", detail: "number", info: "Number of elements in the set" },
          has: { type: "method", detail: "(value) => boolean", info: "Check if a value is in the set" },
          add: { type: "method", detail: "(value) => Set", info: "Add a value to the set" },
          delete: { type: "method", detail: "(value) => boolean", info: "Remove a value from the set" },
          clear: { type: "method", detail: "() => void", info: "Remove all elements" },
          forEach: { type: "method", detail: "(callback) => void", info: "Execute a function for each element" },
          values: { type: "method", detail: "() => Iterator", info: "Returns an iterator of values" },
          first: { type: "method", detail: "() => Token5e | undefined", info: "Get the first element (Foundry Set)" },
        }
      },
      failedSaves: {
        type: "property", detail: "Set<Token5e>", info: "Tokens that failed saves",
        children: {
          size: { type: "property", detail: "number", info: "Number of elements in the set" },
          has: { type: "method", detail: "(value) => boolean", info: "Check if a value is in the set" },
          add: { type: "method", detail: "(value) => Set", info: "Add a value to the set" },
          delete: { type: "method", detail: "(value) => boolean", info: "Remove a value from the set" },
          forEach: { type: "method", detail: "(callback) => void", info: "Execute a function for each element" },
          values: { type: "method", detail: "() => Iterator", info: "Returns an iterator of values" },
          first: { type: "method", detail: "() => Token5e | undefined", info: "Get the first element (Foundry Set)" },
        }
      },
      savedTargets: {
        type: "property", detail: "Set<Token5e>", info: "Tokens that succeeded saves",
        children: {
          size: { type: "property", detail: "number", info: "Number of elements in the set" },
          has: { type: "method", detail: "(value) => boolean", info: "Check if a value is in the set" },
          add: { type: "method", detail: "(value) => Set", info: "Add a value to the set" },
          delete: { type: "method", detail: "(value) => boolean", info: "Remove a value from the set" },
          forEach: { type: "method", detail: "(callback) => void", info: "Execute a function for each element" },
          values: { type: "method", detail: "() => Iterator", info: "Returns an iterator of values" },
          first: { type: "method", detail: "() => Token5e | undefined", info: "Get the first element (Foundry Set)" },
        }
      },
      actor: {
        type: "property", detail: "Actor5e", info: "The D&D 5e actor performing the action",
        children: {
          system: {
            type: "property", detail: "object", info: "Actor system data",
            children: {
              abilities: { type: "property", detail: "object", info: "Ability scores { str, dex, con, int, wis, cha }" },
              attributes: { type: "property", detail: "object", info: "Actor attributes (hp, ac, movement, etc.)" },
              skills: { type: "property", detail: "object", info: "Skill data" },
              traits: { type: "property", detail: "object", info: "Damage/condition traits (di, dr, dv, ci)" },
              details: { type: "property", detail: "object", info: "Character details (level, cr, race)" },
              spells: { type: "property", detail: "object", info: "Spell slots" },
            }
          },
          items: { type: "property", detail: "Collection<Item5e>", info: "Actor's item collection" },
          effects: { type: "property", detail: "Collection<ActiveEffect5e>", info: "Actor's active effects" },
          classes: { type: "property", detail: "object", info: "Character's class items" },
          rollAbilityTest: { type: "method", detail: "(abilityId, options?) => Promise<D20Roll>", info: "Roll an ability check" },
          rollAbilitySave: { type: "method", detail: "(abilityId, options?) => Promise<D20Roll>", info: "Roll a saving throw" },
          rollSkill: { type: "method", detail: "(skillId, options?) => Promise<D20Roll>", info: "Roll a skill check" },
          applyDamage: { type: "method", detail: "(amount, options?) => Promise<Actor5e>", info: "Apply damage/healing" },
          getRollData: { type: "method", detail: "() => object", info: "Get data for roll formulas" },
          getFlag: { type: "method", detail: "(scope, key) => any", info: "Get a flag value" },
          setFlag: { type: "method", detail: "(scope, key, value) => Promise", info: "Set a flag value" },
        }
      },
      item: {
        type: "property", detail: "Item5e", info: "The D&D 5e item being used",
        children: {
          system: {
            type: "property", detail: "object", info: "Item system data",
            children: {
              description: { type: "property", detail: "object", info: "Item description" },
              damage: { type: "property", detail: "object", info: "Damage configuration" },
              save: { type: "property", detail: "object", info: "Save configuration" },
              range: { type: "property", detail: "object", info: "Range configuration" },
              target: { type: "property", detail: "object", info: "Target configuration" },
              duration: { type: "property", detail: "object", info: "Duration configuration" },
              uses: { type: "property", detail: "object", info: "Limited uses" },
              level: { type: "property", detail: "number", info: "Spell level" },
              properties: { type: "property", detail: "Set<string>", info: "Item properties" },
            }
          },
          activities: { type: "property", detail: "Collection<Activity>", info: "Item's activities" },
          effects: { type: "property", detail: "Collection<ActiveEffect>", info: "Item's effects" },
          actor: { type: "property", detail: "Actor5e | null", info: "Owning actor" },
          use: { type: "method", detail: "(config?, dialog?, message?) => Promise<ChatMessage[]>", info: "Use the item" },
          getRollData: { type: "method", detail: "() => object", info: "Get data for roll formulas" },
          getFlag: { type: "method", detail: "(scope, key) => any", info: "Get a flag value" },
          setFlag: { type: "method", detail: "(scope, key, value) => Promise", info: "Set a flag value" },
        }
      },
      activity: {
        type: "property", detail: "Activity", info: "The D&D 5e activity being used",
      },
      token: {
        type: "property", detail: "Token5e", info: "The D&D 5e token performing the action",
        children: {
          actor: { type: "property", detail: "Actor5e | null", info: "The actor this token represents" },
          document: { type: "property", detail: "TokenDocument5e", info: "The token document" },
          name: { type: "property", detail: "string", info: "Token display name" },
          center: { type: "property", detail: "{ x, y }", info: "Token center point" },
          visible: { type: "property", detail: "boolean", info: "Whether token is visible" },
          inCombat: { type: "property", detail: "boolean", info: "Whether token is in combat" },
        }
      },
      isCritical: { type: "property", detail: "boolean", info: "Whether the attack is a critical hit" },
      isFumble: { type: "property", detail: "boolean", info: "Whether the attack is a fumble" },
      attackRoll: {
        type: "property", detail: "D20Roll", info: "The attack roll",
        children: {
          total: { type: "property", detail: "number", info: "The total result of the roll" },
          formula: { type: "property", detail: "string", info: "The roll formula" },
          result: { type: "property", detail: "string", info: "The roll result string" },
          terms: { type: "property", detail: "RollTerm[]", info: "The parsed roll terms" },
          dice: { type: "property", detail: "DiceTerm[]", info: "The dice terms in the roll" },
          isCritical: { type: "property", detail: "boolean", info: "Whether the roll is a natural 20" },
          isFumble: { type: "property", detail: "boolean", info: "Whether the roll is a natural 1" },
          hasAdvantage: { type: "property", detail: "boolean", info: "Whether rolled with advantage" },
          hasDisadvantage: { type: "property", detail: "boolean", info: "Whether rolled with disadvantage" },
          toMessage: { type: "method", detail: "(messageData?, options?) => Promise<ChatMessage>", info: "Send the roll to chat" },
        }
      },
      attackTotal: { type: "property", detail: "number", info: "Attack roll total" },
      damageRolls: {
        type: "property", detail: "DamageRoll[]", info: "Damage rolls",
        children: {
          length: { type: "property", detail: "number", info: "Number of damage rolls" },
          forEach: { type: "method", detail: "(callback) => void", info: "Execute a function for each roll" },
          map: { type: "method", detail: "(callback) => Array", info: "Map each roll to a new value" },
          filter: { type: "method", detail: "(callback) => DamageRoll[]", info: "Filter damage rolls" },
          reduce: { type: "method", detail: "(callback, initial?) => any", info: "Reduce damage rolls to a value" },
          find: { type: "method", detail: "(callback) => DamageRoll | undefined", info: "Find a damage roll matching a condition" },
        }
      },
      damageTotal: { type: "property", detail: "number", info: "Total damage" },
      damageDetail: {
        type: "property", detail: "object[]", info: "Damage breakdown by type",
        children: {
          length: { type: "property", detail: "number", info: "Number of damage entries" },
          forEach: { type: "method", detail: "(callback) => void", info: "Execute a function for each entry" },
          map: { type: "method", detail: "(callback) => Array", info: "Map each entry to a new value" },
          filter: { type: "method", detail: "(callback) => object[]", info: "Filter damage entries" },
          find: { type: "method", detail: "(callback) => object | undefined", info: "Find a damage entry matching a condition" },
        }
      },
      saveResults: {
        type: "property", detail: "Map<string, object>", info: "Save results by token UUID",
        children: {
          size: { type: "property", detail: "number", info: "Number of entries in the map" },
          get: { type: "method", detail: "(key) => object | undefined", info: "Get a save result by token UUID" },
          has: { type: "method", detail: "(key) => boolean", info: "Check if a token UUID has a result" },
          set: { type: "method", detail: "(key, value) => Map", info: "Set a save result for a token UUID" },
          delete: { type: "method", detail: "(key) => boolean", info: "Remove a save result" },
          forEach: { type: "method", detail: "(callback) => void", info: "Execute a function for each entry" },
          keys: { type: "method", detail: "() => Iterator", info: "Returns an iterator of keys" },
          values: { type: "method", detail: "() => Iterator", info: "Returns an iterator of values" },
          entries: { type: "method", detail: "() => Iterator", info: "Returns an iterator of [key, value] pairs" },
        }
      },
      templateId: { type: "property", detail: "string", info: "Placed template ID" },
      uuid: { type: "property", detail: "string", info: "Workflow UUID" },
      id: { type: "property", detail: "string", info: "Workflow ID" },
    }
  },
};

/**
 * Scope entries from executeMacroWithScope() in Workflow.ts.
 * Foundry's Macro#executeScript destructures {speaker, actor, token} from scope
 * and spreads remaining keys as top-level variables in the macro.
 *
 * Each entry with a `ref` shares children/instanceChildren with that tree entry.
 * Entries already in the tree (workflow, item, args) are not overwritten.
 */
const MIDI_SCOPE_MAP: Array<{ key: string; detail: string; info: string; ref?: string }> = [
  { key: "workflow", detail: "Workflow", info: "The midi-qol workflow instance" },
  { key: "rolledActivity", detail: "Activity", info: "The activity that was rolled/used", ref: "activity" },
  { key: "macroActivity", detail: "Activity", info: "The activity the macro is attached to (may differ from rolledActivity)", ref: "activity" },
  { key: "item", detail: "Item", info: "Item being used" },
  { key: "rolledItem", detail: "Item", info: "The item that was rolled/used (same as item in most cases)", ref: "item" },
  { key: "macroItem", detail: "Item", info: "The item the macro is attached to (may differ from rolledItem for transferred macros)", ref: "item" },
  { key: "args", detail: "any[]", info: "Macro arguments array, args[0] is MidiMacroData" },
  { key: "options", detail: "object", info: "Options passed to callMacro" },
  { key: "midiData", detail: "MidiMacroData", info: "Full midi macro data object (same as args[0] and scope.midiData)" },
];

/**
 * args[0] / midiData: the full MidiMacroData from getMacroData().
 * All fields from Workflow.getMacroData() plus tag/macroPass/speaker added by callMacros/callMacro.
 */
const MIDI_ARGS0: CompletionEntry = {
  type: "property", detail: "MidiMacroData", info: "Midi-qol macro data (from workflow.getMacroData())",
  children: {
    // Actor info
    actor: { type: "property", detail: "Actor5e", info: "The actor performing the action" },
    actorData: { type: "property", detail: "object", info: "Actor source data (actor.toObject(false))" },
    actorUuid: { type: "property", detail: "string", info: "Actor UUID" },

    // Attack info
    advantage: { type: "property", detail: "boolean", info: "Whether the roll had advantage" },
    disadvantage: { type: "property", detail: "boolean", info: "Whether the roll had disadvantage" },
    attackD20: { type: "property", detail: "number", info: "The natural d20 roll result" },
    attackRoll: { type: "property", detail: "Roll", info: "The attack roll" },
    attackTotal: { type: "property", detail: "number", info: "The attack roll total" },
    diceRoll: { type: "property", detail: "number", info: "The natural d20 roll result (same as attackD20)" },
    isCritical: { type: "property", detail: "boolean", info: "Whether the attack was a critical hit" },
    isFumble: { type: "property", detail: "boolean", info: "Whether the attack was a fumble" },

    // Damage info
    damageDetail: { type: "property", detail: "DamageDescription[]", info: "Damage breakdown by type" },
    damageList: { type: "property", detail: "DamageListEntry[]", info: "Detailed damage list entries" },
    damageRoll: { type: "property", detail: "Roll", info: "The combined damage roll" },
    damageRolls: { type: "property", detail: "Roll[]", info: "Individual damage rolls" },
    damageTotal: { type: "property", detail: "number", info: "Total damage dealt" },

    // Bonus damage
    bonusDamageDetail: { type: "property", detail: "DamageDescription[]", info: "Bonus damage breakdown by type" },
    bonusDamageHTML: { type: "property", detail: "string", info: "Bonus damage HTML display" },
    bonusDamageRoll: { type: "property", detail: "Roll", info: "The combined bonus damage roll" },
    bonusDamageRolls: { type: "property", detail: "Roll[]", info: "Individual bonus damage rolls" },
    bonusDamageTotal: { type: "property", detail: "number", info: "Total bonus damage" },

    // Other damage
    otherDamageDetail: { type: "property", detail: "DamageDescription[]", info: "Other damage breakdown by type" },
    otherDamageList: { type: "property", detail: "DamageListEntry[]", info: "Other damage list entries" },
    otherDamageTotal: { type: "property", detail: "number", info: "Other damage total" },

    // Targets
    targets: { type: "property", detail: "TokenDocument[]", info: "All targeted token documents" },
    targetUuids: { type: "property", detail: "string[]", info: "UUIDs of all targeted tokens" },
    hitTargets: { type: "property", detail: "TokenDocument[]", info: "Token documents that were hit" },
    hitTargetUuids: { type: "property", detail: "string[]", info: "UUIDs of hit targets" },
    hitTargetsEC: { type: "property", detail: "TokenDocument[]", info: "Token documents hit with EC (extra critical)" },
    hitTargetUuidsEC: { type: "property", detail: "string[]", info: "UUIDs of EC hit targets" },

    // Saves
    saves: { type: "property", detail: "TokenDocument[]", info: "Token documents that saved" },
    saveUuids: { type: "property", detail: "string[]", info: "UUIDs of tokens that saved" },
    failedSaves: { type: "property", detail: "TokenDocument[]", info: "Token documents that failed saves" },
    failedSaveUuids: { type: "property", detail: "string[]", info: "UUIDs of tokens that failed saves" },
    superSavers: { type: "property", detail: "TokenDocument[]", info: "Token documents that super-saved (e.g. evasion)" },
    superSaverUuids: { type: "property", detail: "string[]", info: "UUIDs of super savers" },
    semiSuperSavers: { type: "property", detail: "TokenDocument[]", info: "Token documents that semi-super-saved" },
    semiSuperSaverUuids: { type: "property", detail: "string[]", info: "UUIDs of semi-super savers" },
    criticalSaves: { type: "property", detail: "TokenDocument[]", info: "Token documents that critically saved" },
    criticalSaveUuids: { type: "property", detail: "string[]", info: "UUIDs of critical savers" },
    fumbleSaves: { type: "property", detail: "TokenDocument[]", info: "Token documents that fumbled their save" },
    fumbleSaveUuids: { type: "property", detail: "string[]", info: "UUIDs of fumble savers" },

    // Item info
    item: { type: "property", detail: "object", info: "Item source data (item.toObject(false)) with uuid" },
    itemData: { type: "property", detail: "object", info: "Item source data (same as item)" },
    itemUuid: { type: "property", detail: "string", info: "Item UUID" },
    itemCardUuid: { type: "property", detail: "string", info: "Chat card UUID for the item use" },

    // Spell/cast info
    castLevel: { type: "property", detail: "number", info: "The level the spell was cast at" },
    spellLevel: { type: "property", detail: "number", info: "The level the spell was cast at (same as castLevel)" },
    castData: { type: "property", detail: "object", info: "Casting data" },

    // Roll info
    rollData: { type: "property", detail: "object", info: "Roll data for formula evaluation" },
    rollOptions: { type: "property", detail: "object", info: "Workflow roll options" },
    event: { type: "property", detail: "Event", info: "The triggering event (if any)" },

    // Workflow info
    workflow: { type: "property", detail: "Workflow", info: "The midi-qol workflow instance" },
    workflowId: { type: "property", detail: "string", info: "Workflow ID" },
    workflowOptions: { type: "property", detail: "object", info: "Workflow options" },
    id: { type: "property", detail: "string", info: "Workflow ID" },

    // Macro context (added by callMacros/callMacro)
    tag: { type: "property", detail: "string", info: "Macro tag (OnUse, DamageBonus, etc.)" },
    macroPass: { type: "property", detail: "string", info: "Current macro pass (preItemRoll, postActiveEffects, preSave, etc.)" },
    speaker: { type: "property", detail: "object", info: "Chat speaker data" },
    sourceItemUuid: { type: "property", detail: "string", info: "UUID of the source item the macro was found on" },
    options: { type: "property", detail: "object", info: "Options passed to callMacro" },

    // Template/token
    templateId: { type: "property", detail: "string", info: "Placed template ID (deprecated)" },
    templateUuid: { type: "property", detail: "string", info: "Placed template UUID" },
    tokenUuid: { type: "property", detail: "string", info: "Token UUID of the acting token" },
    uuid: { type: "property", detail: "string", info: "Item UUID (deprecated, use itemUuid)" },
  }
};

/**
 * Inject midi-qol completions into macro-autocomplete.
 * Called at module load time. Registers a handler for
 * "macro-autocomplete.ready" which fires when macro-autocomplete initializes.
 *
 * Foundry's Macro#executeScript destructures {speaker, actor, token} from scope
 * and spreads remaining scope keys as additional top-level variables.
 * So actor/token/speaker are already provided by core - midi doesn't re-add them.
 * But item, activity, workflow, etc. are spread from scope and available as top-level vars.
 */
export function injectMidiCompletions(): void {
  // Register hook - macro-autocomplete fires this after it initializes
  (Hooks as any).on("macro-autocomplete.ready", ({ tree, rebuildSignatureMap, schemaToCompletions, mergeCompletions, classToCompletions,
    registerCategoryConfigs, registerBlockColours, registerScopeMergeKeys }: {
    tree: CompletionNode;
    rebuildSignatureMap: () => void;
    schemaToCompletions?: (schema: any) => CompletionNode;
    mergeCompletions?: (target: { children?: CompletionNode }, additions: CompletionNode) => void;
    classToCompletions?: (cls: any) => { staticChildren: CompletionNode; instanceChildren: CompletionNode; constructorDetail?: string };
    registerCategoryConfigs?: (configs: Record<string, { display: string; colour: string; order: number; namespaceOnly?: boolean }>) => void;
    registerBlockColours?: (colours: Record<string, number>) => void;
    registerScopeMergeKeys?: (keys: string[]) => void;
  }) => {
    console.log("midi-qol | Injecting midi-qol completions into macro-autocomplete");

    // Register visual editor (Blockly) configuration
    registerCategoryConfigs?.({
      activity: { display: "Activity", colour: "#e76f51", order: 10 },
      workflow: { display: "Workflow", colour: "#e63946", order: 13 },
      rolledItem: { display: "Rolled Item", colour: "#6a994e", order: 17 },
      macroItem: { display: "Macro Item", colour: "#6a994e", order: 18 },
      rolledActivity: { display: "Rolled Activity", colour: "#e76f51", order: 19 },
      macroActivity: { display: "Macro Activity", colour: "#e76f51", order: 20 },
      options: { display: "Options", colour: "#a5805b", order: 23 },
      midiData: { display: "Midi Data", colour: "#e63946", order: 24 },
      MidiQOL: { display: "MidiQOL", colour: "#e63946", order: 30 },
      chrisPremades: { display: "Chris Premades", colour: "#e76f51", order: 31, namespaceOnly: true },
      // Condition editor categories
      "Actor Data": { display: "Actor Data", colour: "#457b9d", order: 70 },
      "Target Data": { display: "Target Data", colour: "#2a9d8f", order: 71 },
      "Workflow": { display: "Workflow", colour: "#e63946", order: 72 },
      "World": { display: "World", colour: "#e9c46a", order: 73 },
      "Combat": { display: "Combat", colour: "#5ba580", order: 74 },
      "Functions": { display: "Functions", colour: "#9b59b6", order: 75 },
    });
    registerBlockColours?.({
      MidiQOL: 0,
      workflow: 350,
    });
    registerScopeMergeKeys?.(["macroItem", "rolledItem", "macroActivity", "rolledActivity"]);

    const cfg = (globalThis as any).CONFIG;

    // Inject MidiQOL namespace
    tree.MidiQOL = MIDI_COMPLETIONS.MidiQOL;

    // Inject workflow top-level variable (spread from scope by Foundry)
    tree.workflow = MIDI_COMPLETIONS.workflow;

    // Enrich item entry with midi-specific info (merge, don't replace — macro-autocomplete
    // already enriched tree.item with document schema, runtime data, and prototype methods)
    if (!tree.item) {
      tree.item = { type: "variable", detail: "Item", info: "Item being used (available in midi-qol macros, spread from scope)", children: {} };
    }
    tree.item.type = "variable";
    tree.item.detail = "Item";
    tree.item.info = "Item being used (available in midi-qol macros, spread from scope)";
    if (mergeCompletions) {
      mergeCompletions(tree.item, {
        name: { type: "property", detail: "string", info: "Item name" },
        type: { type: "property", detail: "string", info: "Item type (weapon, spell, feat, equipment, consumable, ...)" },
        img: { type: "property", detail: "string", info: "Item image path" },
        uuid: { type: "property", detail: "string", info: "Item UUID" },
        id: { type: "property", detail: "string", info: "Item ID" },
        isOwner: { type: "property", detail: "boolean", info: "Current user is owner" },
        items: { type: "property", detail: "Collection<Item>", info: "Actor's item collection" },
        effects: { type: "property", detail: "Collection<ActiveEffect>", info: "Item's effects" },
        actor: { type: "property", detail: "Actor | null", info: "Owning actor" },
      });
    }

    // Inject activity as top-level variable (spread from scope by Foundry)
    // Properties from dnd5e Activity + midi-qol MidiActivityMixin
    const ACTIVITY_CHILDREN: CompletionNode = {
      // Core identification
      name: { type: "property", detail: "string", info: "Activity name" },
      type: { type: "property", detail: "string", info: "Activity type (e.g. 'attack', 'save', 'damage', 'heal', 'utility')" },
      identifier: { type: "property", detail: "string", info: "Unique identifier (custom or name slugified)" },
      img: { type: "property", detail: "string", info: "Activity image path" },
      uuid: { type: "property", detail: "string", info: "Activity UUID" },
      sort: { type: "property", detail: "number", info: "Sort order" },

      // Relationships
      item: {
        type: "property", detail: "Item5e", info: "Parent item",
        children: {
          system: {
            type: "property", detail: "object", info: "Item system data",
            children: {
              description: { type: "property", detail: "object", info: "Item description" },
              damage: { type: "property", detail: "object", info: "Damage configuration" },
              save: { type: "property", detail: "object", info: "Save configuration" },
              range: { type: "property", detail: "object", info: "Range configuration" },
              target: { type: "property", detail: "object", info: "Target configuration" },
              duration: { type: "property", detail: "object", info: "Duration configuration" },
              uses: { type: "property", detail: "object", info: "Limited uses" },
              level: { type: "property", detail: "number", info: "Spell level" },
              properties: { type: "property", detail: "Set<string>", info: "Item properties" },
            }
          },
          activities: { type: "property", detail: "Collection<Activity>", info: "Item's activities" },
          effects: { type: "property", detail: "Collection<ActiveEffect>", info: "Item's effects" },
          actor: { type: "property", detail: "Actor5e | null", info: "Owning actor" },
          name: { type: "property", detail: "string", info: "Item name" },
          type: { type: "property", detail: "string", info: "Item type" },
          img: { type: "property", detail: "string", info: "Item image path" },
          uuid: { type: "property", detail: "string", info: "Item UUID" },
        }
      },
      actor: {
        type: "property", detail: "Actor5e", info: "Owning actor (via item.actor)",
        children: {
          system: {
            type: "property", detail: "object", info: "Actor system data",
            children: {
              abilities: { type: "property", detail: "object", info: "Ability scores { str, dex, con, int, wis, cha }" },
              attributes: { type: "property", detail: "object", info: "Actor attributes (hp, ac, movement, etc.)" },
              skills: { type: "property", detail: "object", info: "Skill data" },
              traits: { type: "property", detail: "object", info: "Damage/condition traits (di, dr, dv, ci)" },
              details: { type: "property", detail: "object", info: "Character details (level, cr, race)" },
              spells: { type: "property", detail: "object", info: "Spell slots" },
            }
          },
          items: { type: "property", detail: "Collection<Item5e>", info: "Actor's item collection" },
          effects: { type: "property", detail: "Collection<ActiveEffect5e>", info: "Actor's active effects" },
          name: { type: "property", detail: "string", info: "Actor name" },
          uuid: { type: "property", detail: "string", info: "Actor UUID" },
          getRollData: { type: "method", detail: "() => object", info: "Get data for roll formulas" },
          getFlag: { type: "method", detail: "(scope, key) => any", info: "Get a flag value" },
          setFlag: { type: "method", detail: "(scope, key, value) => Promise", info: "Set a flag value" },
        }
      },

      // Type checks
      actionType: { type: "property", detail: "string", info: "Action type (e.g. 'mwak', 'rwak', 'msak', 'rsak', 'save', 'heal', 'utility')" },
      hasDamage: { type: "property", detail: "boolean", info: "Whether activity has a damage roll" },
      hasHealing: { type: "property", detail: "boolean", info: "Whether activity has healing" },
      hasAttack: { type: "property", detail: "boolean", info: "Whether activity has an attack roll" },
      hasSave: { type: "property", detail: "boolean", info: "Whether activity has a saving throw" },

      // Data sections
      activation: {
        type: "property", detail: "object", info: "Activation configuration",
        children: {
          type: { type: "property", detail: "string", info: "Activation type (action, bonus, reaction, etc.)" },
          value: { type: "property", detail: "number", info: "Activation value" },
          condition: { type: "property", detail: "string", info: "Activation condition text" },
        }
      },
      consumption: {
        type: "property", detail: "object", info: "Consumption configuration",
        children: {
          targets: { type: "property", detail: "object[]", info: "Consumption targets" },
          scaling: { type: "property", detail: "object", info: "Consumption scaling" },
        }
      },
      description: {
        type: "property", detail: "object", info: "Description data",
        children: {
          chatFlavor: { type: "property", detail: "string", info: "Chat flavor text" },
        }
      },
      duration: {
        type: "property", detail: "object", info: "Duration configuration",
        children: {
          value: { type: "property", detail: "number", info: "Duration value" },
          units: { type: "property", detail: "string", info: "Duration units (turn, round, minute, hour, day, etc.)" },
          special: { type: "property", detail: "string", info: "Special duration text" },
          concentration: { type: "property", detail: "boolean", info: "Requires concentration" },
        }
      },
      range: {
        type: "property", detail: "object", info: "Range configuration",
        children: {
          value: { type: "property", detail: "number", info: "Range value" },
          units: { type: "property", detail: "string", info: "Range units" },
          special: { type: "property", detail: "string", info: "Special range text" },
          override: { type: "property", detail: "boolean", info: "Override item range" },
        }
      },
      target: {
        type: "property", detail: "object", info: "Target configuration",
        children: {
          template: {
            type: "property", detail: "object", info: "Area template configuration",
            children: {
              type: { type: "property", detail: "string", info: "Template shape (cone, cube, cylinder, line, radius, sphere, square, wall)" },
              size: { type: "property", detail: "number", info: "Template size" },
              units: { type: "property", detail: "string", info: "Template units" },
              contiguous: { type: "property", detail: "boolean", info: "Must be contiguous" },
            }
          },
          affects: {
            type: "property", detail: "object", info: "Affected targets",
            children: {
              type: { type: "property", detail: "string", info: "Target type (creature, ally, enemy, self, willing, etc.)" },
              count: { type: "property", detail: "string", info: "Number of targets" },
              special: { type: "property", detail: "string", info: "Special targeting text" },
            }
          },
          prompt: { type: "property", detail: "boolean", info: "Prompt for targets" },
        }
      },
      uses: {
        type: "property", detail: "object", info: "Limited uses",
        children: {
          spent: { type: "property", detail: "number", info: "Uses spent" },
          max: { type: "property", detail: "string", info: "Maximum uses (formula)" },
          per: { type: "property", detail: "string", info: "Recovery period" },
          recovery: { type: "property", detail: "object[]", info: "Recovery profiles" },
        }
      },
      damage: {
        type: "property", detail: "object", info: "Damage configuration",
        children: {
          parts: { type: "property", detail: "object[]", info: "Damage parts (formula, type, scaling)" },
        }
      },
      healing: {
        type: "property", detail: "object", info: "Healing configuration",
        children: {
          types: { type: "property", detail: "Set<string>", info: "Healing types" },
        }
      },
      save: {
        type: "property", detail: "object", info: "Save configuration",
        children: {
          ability: { type: "property", detail: "Set<string>", info: "Save ability/abilities" },
          dc: {
            type: "property", detail: "object", info: "Save DC",
            children: {
              calculation: { type: "property", detail: "string", info: "DC calculation method" },
              formula: { type: "property", detail: "string", info: "DC formula" },
            }
          },
        }
      },
      check: {
        type: "property", detail: "object", info: "Check configuration",
        children: {
          ability: { type: "property", detail: "string", info: "Check ability" },
          associated: { type: "property", detail: "Set<string>", info: "Associated skills" },
          dc: {
            type: "property", detail: "object", info: "Check DC",
            children: {
              calculation: { type: "property", detail: "string", info: "DC calculation method" },
              formula: { type: "property", detail: "string", info: "DC formula" },
            }
          },
        }
      },
      attack: {
        type: "property", detail: "object", info: "Attack configuration",
        children: {
          ability: { type: "property", detail: "string", info: "Attack ability" },
          bonus: { type: "property", detail: "string", info: "Attack bonus formula" },
          type: {
            type: "property", detail: "object", info: "Attack type",
            children: {
              value: { type: "property", detail: "string", info: "Attack type (melee or ranged)" },
              classification: { type: "property", detail: "string", info: "Classification (weapon or spell)" },
            }
          },
          flat: { type: "property", detail: "boolean", info: "Flat attack bonus (no proficiency/ability)" },
        }
      },

      // Effects
      effects: { type: "property", detail: "ActivityEffectData[]", info: "Activity effect data entries" },
      applicableEffects: { type: "property", detail: "ActiveEffect[]", info: "Active effects applicable from this activity" },

      // Conditions (midi-qol MidiActivityMixin getters)
      useCondition: { type: "property", detail: "string", info: "Use activation condition text" },
      effectCondition: { type: "property", detail: "string", info: "Effect activation condition text" },
      otherActivity: { type: "property", detail: "Activity | null", info: "Associated 'other activity' (ammunition, triggered, etc.)" },

      // Midi-specific
      macro: { type: "property", detail: "Macro", info: "Activity on-use macro" },
      midiProperties: {
        type: "property", detail: "object", info: "Midi-qol activity properties",
        children: {
          ignoreTraits: { type: "property", detail: "Set<string>", info: "Ignored damage traits (idi, idr, idv, ida)" },
          triggeredActivityId: { type: "property", detail: "string", info: "Triggered activity ID" },
          triggeredActivityConditionText: { type: "property", detail: "string", info: "Triggered activity condition" },
          triggeredActivityTargets: { type: "property", detail: "string", info: "Triggered activity target mode" },
          triggeredActivityRollAs: { type: "property", detail: "string", info: "Triggered activity roll-as mode" },
          autoConsume: { type: "property", detail: "boolean", info: "Auto-consume resources" },
          confirmTargets: { type: "property", detail: "string", info: "Target confirmation mode" },
          autoTargetType: { type: "property", detail: "string", info: "Auto-targeting type" },
          automationOnly: { type: "property", detail: "boolean", info: "Hidden from manual use (automation only)" },
          otherActivityCompatible: { type: "property", detail: "boolean", info: "Can be used as 'other activity'" },
          identifier: { type: "property", detail: "string", info: "Custom identifier" },
          displayActivityName: { type: "property", detail: "boolean", info: "Show activity name on chat card" },
          rollMode: { type: "property", detail: "string", info: "Roll mode override" },
          chooseEffects: { type: "property", detail: "boolean", info: "Prompt to choose which effects to apply" },
          toggleEffect: { type: "property", detail: "boolean", info: "Toggle effect on/off" },
          magicEffect: { type: "property", detail: "boolean", info: "Effects are magical" },
          magicDamage: { type: "property", detail: "boolean", info: "Damage is magical" },
          noConcentrationCheck: { type: "property", detail: "boolean", info: "Skip concentration check" },
        }
      },
    };

    tree.activity = {
      type: "variable", detail: "Activity", info: "Activity being used (available in midi-qol macros, spread from scope)",
      children: ACTIVITY_CHILDREN,
    };

    // Register Activity as a PascalCase class entry so type resolution works
    // (e.g., "Collection<Activity>" in for-of loops resolves to Activity's instance members)
    tree.Activity = {
      type: "class", detail: "Activity", info: "dnd5e Activity base class",
      instanceChildren: ACTIVITY_CHILDREN,
    };

    // Point workflow.activity to the full ACTIVITY_CHILDREN so the namespace
    // block and sidebar show all activity properties (not just the abbreviated set)
    if (tree.workflow?.children?.activity) {
      tree.workflow.children.activity.children = ACTIVITY_CHILDREN;
    }

    // Register Workflow as a top-level class entry so typed_var blocks and type
    // resolution (e.g., for-of loops yielding Workflow) can access workflow properties
    tree.Workflow = {
      type: "class", detail: "Workflow", info: "midi-qol Workflow class",
      instanceChildren: tree.workflow?.children ?? {},
    };

    // Dynamically inject instance methods from runtime class prototypes
    if (classToCompletions && mergeCompletions) {
      // Item instance methods
      const itemCls = cfg?.Item?.documentClass;
      if (itemCls) {
        const walked = classToCompletions(itemCls);
        if (!tree.item.instanceChildren) tree.item.instanceChildren = {};
        mergeCompletions({ children: tree.item.instanceChildren }, walked.instanceChildren);
      }

      // Activity instance methods — walk from CONFIG.DND5E.activityTypes to get
      // MidiActivityMixin methods (use, rollDamage, setupTargets, etc.)
      const activityTypes = cfg?.DND5E?.activityTypes;
      if (activityTypes && typeof activityTypes === "object") {
        for (const entry of Object.values(activityTypes) as any[]) {
          const ActCls = entry?.documentClass;
          if (ActCls?.prototype) {
            const walked = classToCompletions(ActCls);
            if (!tree.activity.instanceChildren) tree.activity.instanceChildren = {};
            mergeCompletions({ children: tree.activity.instanceChildren }, walked.instanceChildren);
            // Also merge into the PascalCase Activity class entry for type resolution
            if (!tree.Activity.instanceChildren) tree.Activity.instanceChildren = {};
            mergeCompletions({ children: tree.Activity.instanceChildren }, walked.instanceChildren);
          }
        }
      }
    }

    // Inject item system schema completions if available
    if (schemaToCompletions && mergeCompletions) {
      const itemDataModels = cfg?.Item?.dataModels;
      if (itemDataModels && typeof itemDataModels === "object" && tree.item?.children?.system) {
        for (const [, DataModel] of Object.entries(itemDataModels) as [string, any][]) {
          if (DataModel?.schema) {
            const sc = schemaToCompletions(DataModel.schema);
            mergeCompletions(tree.item.children.system, sc);
          }
        }
      }
    }

    // Augment args[0] with full MidiMacroData structure
    if (tree.args?.children) {
      tree.args.children["0"] = MIDI_ARGS0;
    }

    // Set midiData tree entry before scope loop (so loop's !tree[key] check skips it)
    tree.midiData = {
      type: "variable", detail: "MidiMacroData", info: "Full midi macro data object (same as args[0] and scope.midiData)",
      children: MIDI_ARGS0.children,
    };

    // Inject all scope entries as top-level variables and into scope.children.
    // This mirrors executeMacroWithScope() in Workflow.ts — Foundry's Macro#executeScript
    // destructures {speaker, actor, token} and spreads the rest as top-level vars.
    for (const { key, detail, info, ref } of MIDI_SCOPE_MAP) {
      const source = ref ? tree[ref] : undefined;
      // Add to scope.children for `scope.xxx` completion
      if (tree.scope?.children) {
        tree.scope.children[key] = {
          type: "property", detail, info,
          ...(source?.children && { children: source.children }),
          ...(source?.instanceChildren && { instanceChildren: source.instanceChildren }),
        };
      }
      // Create top-level variable entry if it doesn't already exist.
      // Entries with a `ref` share children/instanceChildren with the referenced entry.
      if (!tree[key]) {
        tree[key] = {
          type: "variable", detail, info,
          ...(source?.children && { children: source.children }),
          ...(source?.instanceChildren && { instanceChildren: source.instanceChildren }),
        };
      }
    }

    // Inject rich chrisPremades (CPR) completions — replaces the shallow
    // objectToCompletions walk with properly typed function signatures
    // extracted from the CPR source map.
    if (mergeCompletions && (globalThis as any).chrisPremades) {
      const fn = (detail: string, info: string): CompletionEntry => ({ type: "function", detail, info });
      const prop = (detail: string, info: string): CompletionEntry => ({ type: "property", detail, info });
      const method = (detail: string, info: string): CompletionEntry => ({ type: "method", detail, info });

      const CPR_UTILS: CompletionNode = {
        actorUtils: {
          type: "object", detail: "object", info: "Actor utility functions",
          children: {
            getEffects: fn("(actor, options?) => ActiveEffect[]", "Get effects on an actor"),
            addFavorites: fn("async (actor, entities, type?) => Promise", "Add items to favorites"),
            removeFavorites: fn("async (actor, entities, type?) => Promise", "Remove items from favorites"),
            getFirstToken: fn("(actor) => Token5e", "Get first token for an actor"),
            getLevelOrCR: fn("(actor) => number", "Get character level or CR"),
            checkTrait: fn("(actor, type, trait) => boolean", "Check if actor has a damage/condition trait"),
            typeOrRace: fn("(actor) => string", "Get creature type or race"),
            raceOrType: fn("(actor) => string", "Get creature race or type"),
            getSize: fn("(actor, returnString?) => number|string", "Get creature size"),
            hasUsedReaction: fn("(actor) => boolean", "Check if actor has used reaction"),
            setReactionUsed: fn("async (actor) => Promise", "Mark reaction as used"),
            removeReactionUsed: fn("async (actor, force?) => Promise", "Clear reaction used"),
            hasUsedBonusAction: fn("(actor) => boolean", "Check if bonus action used"),
            setBonusActionUsed: fn("async (actor) => Promise", "Mark bonus action used"),
            removeBonusActionUsed: fn("async (actor, force?) => Promise", "Clear bonus action used"),
            hasSpellSlots: fn("(actor, atLeast?) => boolean", "Check for available spell slots"),
            getCastableSpells: fn("(actor) => Item[]", "Get spells the actor can cast"),
            isShapeChanger: fn("(actor) => boolean", "Check if actor is a shape changer"),
            doConcentrationCheck: fn("async (actor, saveDC) => Promise", "Force a concentration check"),
            polymorph: fn("async (origActor, newActor, options, renderSheet?) => Promise", "Polymorph an actor"),
            getEquippedArmor: fn("(actor, types?) => Item|undefined", "Get equipped armor"),
            getEquippedShield: fn("(actor) => Item|undefined", "Get equipped shield"),
            compareSize: fn("(source, target, goal) => boolean", "Compare creature sizes"),
            getBestAbility: fn("(actor, abilities) => string", "Get highest ability from list"),
            getTokens: fn("(actor) => Token5e[]", "Get all tokens for an actor"),
            giveHeroicInspiration: fn("async (actor) => Promise", "Give heroic inspiration"),
          }
        },
        effectUtils: {
          type: "object", detail: "object", info: "Effect utility functions",
          children: {
            createEffect: fn("async (entity, effectData, ...) => Promise<ActiveEffect>", "Create an active effect"),
            createEffects: fn("async (entity, effectDataArray, optionsArray) => Promise", "Create multiple effects"),
            getConcentrationEffect: fn("(actor, item) => ActiveEffect|undefined", "Get concentration effect for item"),
            getEffectByIdentifier: fn("(actor, identifier) => ActiveEffect|undefined", "Get effect by CPR identifier"),
            getAllEffectsByIdentifier: fn("(actor, identifier) => ActiveEffect[]", "Get all effects by identifier"),
            getEffectByStatusID: fn("(actor, statusID) => ActiveEffect|undefined", "Get effect by status ID"),
            applyConditions: fn("async (actor, conditions, ...) => Promise", "Apply conditions to actor"),
            addDependent: fn("async (entity, dependents, forceGM?) => Promise", "Add dependent entities"),
            addMacro: fn("(effectData, type, macroList) => void", "Add embedded macro to effect data"),
            getCastData: fn("(effect) => object", "Get cast data stored on effect"),
            getCastLevel: fn("(effect) => number", "Get cast level from effect"),
            getBaseLevel: fn("(effect) => number", "Get base spell level from effect"),
            setCastData: fn("async (effect, data) => Promise", "Set cast data on effect"),
            setCastLevel: fn("async (effect, level) => Promise", "Set cast level on effect"),
            getSaveDC: fn("(effect) => number", "Get save DC stored on effect"),
            setSaveDC: fn("async (effect, dc) => Promise", "Set save DC on effect"),
            syntheticActiveEffect: fn("async (effectData, entity) => Promise<ActiveEffect>", "Create synthetic effect"),
            getOriginItem: fn("async (effect) => Promise<Item>", "Get origin item of effect"),
            getOriginItemSync: fn("(effect) => Item|undefined", "Get origin item synchronously"),
            getConditions: fn("(effect) => string[]", "Get conditions from effect"),
          }
        },
        itemUtils: {
          type: "object", detail: "object", info: "Item utility functions",
          children: {
            createItems: fn("async (actor, updates, ...) => Promise<Item[]>", "Create items on actor"),
            getItemByIdentifier: fn("(actor, identifier) => Item|undefined", "Get item by CPR identifier"),
            getAllItemsByIdentifier: fn("(actor, identifier) => Item[]", "Get all items by identifier"),
            syntheticItem: fn("async (itemData, actor) => Promise<Item>", "Create a synthetic (temporary) item"),
            enchantItem: fn("async (item, effectData, ...) => Promise", "Apply enchantment to item"),
            cloneItem: fn("(item, updates?) => Item", "Clone an item with optional updates"),
            getConfig: fn("(item, key) => any", "Get CPR config value from item"),
            setConfig: fn("async (item, key, value) => Promise", "Set CPR config value on item"),
            getSaveDC: fn("(item) => number", "Get save DC for item"),
            getVersion: fn("(item) => string", "Get CPR automation version"),
            getSource: fn("(item) => string", "Get CPR automation source"),
            isUpToDate: fn("async (item) => Promise<boolean>", "Check if automation is up to date"),
            isSpellFeature: fn("(item) => boolean", "Check if item is a spell feature"),
            convertDuration: fn("(entity) => object", "Convert duration to seconds"),
            getEquipmentState: fn("(item) => string", "Get equipment state"),
            getActivity: fn("(item, type) => Activity|undefined", "Get activity by type"),
            getEffectByIdentifier: fn("(item, identifier) => ActiveEffect|undefined", "Get effect on item by identifier"),
            getSpellActivities: fn("(item) => Activity[]", "Get spell-related activities"),
            canUse: fn("(item) => boolean", "Check if item can be used"),
          }
        },
        tokenUtils: {
          type: "object", detail: "object", info: "Token utility functions",
          children: {
            getDistance: fn("(sourceToken, targetToken, ...) => number", "Get distance between tokens"),
            findNearby: fn("(token, range, disposition, ...) => Token5e[]", "Find nearby tokens"),
            pushToken: fn("async (sourceToken, targetToken, distance) => Promise", "Push token away"),
            canSee: fn("(sourceToken, targetToken) => boolean", "Check line of sight"),
            canSense: fn("(sourceToken, targetToken, senseModes?) => boolean", "Check if token can sense another"),
            checkIncapacitated: fn("(token, logResult?) => boolean", "Check if token is incapacitated"),
            checkForRoom: fn("(token, gridSquares) => boolean", "Check if room exists for token"),
            attachToToken: fn("async (token, uuidsToAttach) => Promise", "Attach entities to token"),
            detachFromToken: fn("async (token, uuidsToDetach) => Promise", "Detach entities from token"),
            getLightLevel: fn("(token) => string", "Get light level at token position"),
            grappleHelper: fn("async (sourceToken, targetToken, item, ...) => Promise", "Handle grapple mechanics"),
            moveTokenAlongRay: fn("async (targetToken, ray, distance) => Promise", "Move token along ray"),
            getMovementHitTokens: fn("(startPoint, endPoint, radius, ...) => Token5e[]", "Get tokens hit during movement"),
            getLinearDistanceMoved: fn("(token) => number", "Get linear distance moved this turn"),
            isGrappledBy: fn("(target, source) => boolean", "Check if target is grappled by source"),
            mountToken: fn("async (rider, target, ...) => Promise", "Mount a token on another"),
            checkCover: fn("(sourceToken, targetToken, ...) => number", "Check cover between tokens"),
            getBaseActor: fn("(token) => Actor5e", "Get base actor (unlinked original)"),
          }
        },
        workflowUtils: {
          type: "object", detail: "object", info: "Workflow utility functions",
          children: {
            bonusDamage: fn("async (workflow, formula, ...) => Promise", "Add bonus damage to workflow"),
            bonusAttack: fn("async (workflow, formula) => Promise", "Add bonus to attack roll"),
            replaceDamage: fn("async (workflow, formula, ...) => Promise", "Replace workflow damage"),
            applyDamage: fn("async (tokens, value, damageType) => Promise", "Apply damage to tokens"),
            completeActivityUse: fn("async (activity, config?) => Promise", "Complete an activity use programmatically"),
            completeItemUse: fn("async (item, config?) => Promise", "Complete an item use programmatically"),
            syntheticActivityRoll: fn("async (activity, targets?, ...) => Promise", "Roll synthetic activity"),
            syntheticItemRoll: fn("async (item, targets, ...) => Promise", "Roll synthetic item"),
            syntheticItemDataRoll: fn("async (itemData, actor, targets, ...) => Promise", "Roll from item data"),
            syntheticActivityDataRoll: fn("async (activityData, item, actor, targets, ...) => Promise", "Roll from activity data"),
            negateDamageItemDamage: fn("(ditem) => void", "Negate all damage on a damage item"),
            setDamageItemDamage: fn("(ditem, amount, adjustRaw?) => void", "Set damage item damage amount"),
            getDamageTypes: fn("(damageRolls) => string[]", "Get damage types from rolls"),
            getTotalDamageOfType: fn("(damageDetail, actor, type) => number", "Get total damage of a type"),
            getCastData: fn("(workflow) => object", "Get cast data from workflow"),
            getCastLevel: fn("(workflow) => number", "Get cast level from workflow"),
            modifyDamageAppliedFlat: fn("(ditem, amount) => void", "Modify damage applied by flat amount"),
            handleInstantTemplate: fn("async (workflow) => Promise", "Handle instant template placement"),
            isAttackType: fn("(workflow, type?) => boolean", "Check workflow attack type"),
            getActionType: fn("(workflow) => string", "Get workflow action type"),
            swapAttackAbility: fn("async (workflow, ability?, ...) => Promise", "Swap attack ability modifier"),
            addEntityRemoval: fn("(workflow, entities) => void", "Mark entities for removal after workflow"),
            preventDeath: fn("(ditem) => void", "Prevent target death from this damage"),
            specialItemUse: fn("async (item, targets, sourceFeature, ...) => Promise", "Special item use flow"),
            updateTargets: fn("async (workflow, targets, ...) => Promise", "Update workflow targets"),
            removeTargets: fn("async (workflow, tokens, ...) => Promise", "Remove tokens from targets"),
          }
        },
        rollUtils: {
          type: "object", detail: "object", info: "Roll utility functions",
          children: {
            contestedRoll: fn("async (...) => Promise", "Perform a contested roll"),
            rollDice: fn("async (formula, ...) => Promise<Roll>", "Roll a dice formula"),
            damageRoll: fn("async (formula, entity, options?) => Promise<DamageRoll>", "Roll damage"),
            getCriticalFormula: fn("async (formula, rollData) => Promise<string>", "Get critical hit formula"),
            getChangedDamageRoll: fn("async (origRoll, newType) => Promise<DamageRoll>", "Change damage roll type"),
            addToRoll: fn("async (roll, formula, ...) => Promise<Roll>", "Add formula to existing roll"),
            requestRoll: fn("async (token, request, ability, options?) => Promise", "Request a roll from player"),
            makeCritical: fn("(roll) => Roll", "Convert a roll to critical"),
            rollDiceSync: fn("(formula, ...) => Roll", "Roll dice synchronously"),
            replaceD20: fn("async (roll, number) => Promise<Roll>", "Replace d20 result"),
          }
        },
        dialogUtils: {
          type: "object", detail: "object", info: "Dialog utility functions",
          children: {
            buttonDialog: fn("async (title, content, buttons, ...) => Promise<string>", "Show button dialog"),
            numberDialog: fn("async (title, content, input?) => Promise<number>", "Show number input dialog"),
            selectDialog: fn("async (title, content, input?) => Promise<string>", "Show select dialog"),
            selectTargetDialog: fn("async (title, content, targets, ...) => Promise", "Show target selection dialog"),
            selectDocumentDialog: fn("async (title, content, documents, ...) => Promise", "Show document selection dialog"),
            selectDocumentsDialog: fn("async (title, content, documents, ...) => Promise", "Show multi-document selection"),
            confirm: fn("async (title, content, ...) => Promise<boolean>", "Show confirmation dialog"),
            selectHitDie: fn("async (actor, title, content, ...) => Promise", "Show hit die selection"),
            selectSpellSlot: fn("async (actor, title, content, ...) => Promise<number>", "Show spell slot selection"),
            selectDamageType: fn("async (damageTypes, title, ...) => Promise<string>", "Show damage type selection"),
            confirmUseItem: fn("async (item, ...) => Promise<boolean>", "Confirm item use"),
          }
        },
        combatUtils: {
          type: "object", detail: "object", info: "Combat utility functions",
          children: {
            currentTurn: fn("() => Combatant|undefined", "Get current turn combatant"),
            inCombat: fn("() => boolean", "Check if combat is active"),
            combatStarted: fn("() => boolean", "Check if combat has started"),
            perTurnCheck: fn("(entity, name, ownTurnOnly, tokenId) => boolean", "Check once-per-turn usage"),
            setTurnCheck: fn("async (entity, name, reset) => Promise", "Set per-turn usage flag"),
            getCurrentCombatantToken: fn("() => Token5e|undefined", "Get current combatant's token"),
            isOwnTurn: fn("(token) => boolean", "Check if it's this token's turn"),
          }
        },
        templateUtils: {
          type: "object", detail: "object", info: "Template utility functions",
          children: {
            getTokensInTemplate: fn("(template) => Token5e[]", "Get tokens within a template"),
            getTokensInShape: fn("(shape, scene, ...) => Token5e[]", "Get tokens in a shape"),
            placeTemplate: fn("async (templateData, returnTokens?) => Promise", "Place a measured template"),
            getCastData: fn("(template) => object", "Get cast data from template"),
            getCastLevel: fn("(template) => number", "Get cast level from template"),
            getSaveDC: fn("(template) => number", "Get save DC from template"),
            getSourceActor: fn("async (template) => Promise<Actor5e>", "Get source actor of template"),
            overlap: fn("(template1, template2) => boolean", "Check if two templates overlap"),
            attachToTemplate: fn("async (template, uuids) => Promise", "Attach entities to template"),
            rayIntersectsTemplate: fn("(templateDoc, ray) => boolean", "Check if ray intersects template"),
          }
        },
        socketUtils: {
          type: "object", detail: "object", info: "Socket utility functions",
          children: {
            gmID: fn("() => string", "Get the GM's user ID"),
            isTheGM: fn("() => boolean", "Check if current user is the GM"),
            hasPermission: fn("(entity, userId) => boolean", "Check user permission on entity"),
            firstOwner: fn("(document, useId) => User", "Get first owner of document"),
            remoteRollItem: fn("async (item, config, options, userId) => Promise", "Roll item as another user"),
          }
        },
        regionUtils: {
          type: "object", detail: "object", info: "Region utility functions",
          children: {
            createRegions: fn("async (regionDatas, scene, ...) => Promise", "Create scene regions"),
            templateToRegionShape: fn("(template, ...) => object", "Convert template to region shape"),
            getCastData: fn("(region) => object", "Get cast data from region"),
            getCastLevel: fn("(region) => number", "Get cast level from region"),
            getSaveDC: fn("(region) => number", "Get save DC from region"),
            rayIntersectsRegion: fn("(region, ray) => boolean", "Check if ray intersects region"),
          }
        },
        macroUtils: {
          type: "object", detail: "object", info: "Embedded macro utility functions",
          children: {
            getEmbeddedMacros: fn("(entity, type, options?) => object[]", "Get embedded macros on entity"),
            addEmbeddedMacro: fn("async (entity, macroData) => Promise", "Add embedded macro to entity"),
            removeEmbeddedMacro: fn("async (entity, type, name) => Promise", "Remove embedded macro"),
            getDocumentPasses: fn("(document, type) => string[]", "Get valid passes for doc+event type"),
            getEventTypes: fn("() => string[]", "Get all event type keys"),
            getAllDocumentPasses: fn("(document) => object", "Get all passes for all event types"),
            getAllEmbeddedMacros: fn("(entity) => object[]", "Get all embedded macros"),
          }
        },
        activityUtils: {
          type: "object", detail: "object", info: "Activity utility functions",
          children: {
            getActivityByIdentifier: fn("(item, identifier, ...) => Activity|undefined", "Get activity by identifier"),
            getIdentifier: fn("(activity) => string", "Get CPR identifier of activity"),
            setIdentifier: fn("async (activity, identifier) => Promise", "Set CPR identifier"),
            withChangedDamage: fn("(activity, formula, types?, ...) => Activity", "Clone activity with changed damage"),
            duplicateActivity: fn("(activity) => Activity", "Duplicate an activity"),
            getSaveDC: fn("(activity) => number", "Get save DC of activity"),
            hasSave: fn("(activity) => boolean", "Check if activity has a save"),
            isSpellActivity: fn("(activity) => boolean", "Check if activity belongs to a spell"),
            canUse: fn("(activity) => boolean", "Check if activity can be used"),
            isHidden: fn("(activity) => boolean", "Check if activity is hidden"),
          }
        },
        genericUtils: {
          type: "object", detail: "object", info: "General utility functions",
          children: {
            sleep: fn("(ms) => Promise<void>", "Sleep for ms milliseconds"),
            translate: fn("(key) => string", "Localize a string key"),
            format: fn("(key, obj) => string", "Format a localized string"),
            setProperty: fn("(object, key, value) => boolean", "Set a nested property"),
            getProperty: fn("(object, key) => any", "Get a nested property"),
            duplicate: fn("(object) => object", "Deep duplicate an object"),
            deepClone: fn("(object) => object", "Deep clone an object"),
            mergeObject: fn("(original, other, options?) => object", "Merge objects"),
            update: fn("async (entity, updates?, options?) => Promise", "Update entity (GM-safe)"),
            remove: fn("async (entity) => Promise", "Delete entity (GM-safe)"),
            setFlag: fn("async (entity, scope, key, value) => Promise", "Set flag (GM-safe)"),
            unsetFlag: fn("async (entity, scope, key) => Promise", "Unset flag (GM-safe)"),
            getCPRSetting: fn("(key) => any", "Get a CPR module setting"),
            setCPRSetting: fn("async (key, value) => Promise", "Set a CPR module setting"),
            randomID: fn("(length?) => string", "Generate random ID"),
            notify: fn("(message, type?, ...) => void", "Show notification"),
            getIdentifier: fn("(entity) => string", "Get CPR identifier from entity"),
            getRules: fn("(entity) => string", "Get rules version (legacy/modern)"),
            titleCase: fn("(inputString) => string", "Convert string to title case"),
            createEmbeddedDocuments: fn("async (entity, type, updates, options) => Promise", "Create embedded docs (GM-safe)"),
            updateEmbeddedDocuments: fn("async (entity, type, updates, options) => Promise", "Update embedded docs (GM-safe)"),
            deleteEmbeddedDocuments: fn("async (entity, type, ids, options) => Promise", "Delete embedded docs (GM-safe)"),
          }
        },
        compendiumUtils: {
          type: "object", detail: "object", info: "Compendium utility functions",
          children: {
            getCPRAutomation: fn("async (item, ...) => Promise<object>", "Get CPR automation for item"),
            getAllAutomations: fn("async (item, options?) => Promise<object[]>", "Get all automations for item"),
            getItemFromCompendium: fn("async (key, name, ...) => Promise<Item>", "Get item from compendium"),
            getPreferredAutomation: fn("async (item, options) => Promise<object>", "Get preferred automation"),
            getActorFromCompendium: fn("async (key, name, ...) => Promise<Actor>", "Get actor from compendium"),
          }
        },
        constants: {
          type: "object", detail: "object", info: "CPR constants and lookup tables",
          children: {
            packs: prop("object", "Compendium pack keys"),
            attacks: prop("string[]", "All attack types"),
            meleeAttacks: prop("string[]", "Melee attack types"),
            rangedAttacks: prop("string[]", "Ranged attack types"),
            weaponAttacks: prop("string[]", "Weapon attack types"),
            spellAttacks: prop("string[]", "Spell attack types"),
            sizes: prop("object", "Creature size mappings"),
            damageTypeOptions: prop("object[]", "Damage type select options"),
            creatureTypeOptions: prop("object[]", "Creature type select options"),
            itemTypes: prop("string[]", "Valid item types"),
            abilityOptions: prop("object[]", "Ability score select options"),
            statusOptions: prop("object[]", "Status condition options"),
            skillOptions: prop("object[]", "Skill select options"),
            overTimeOptions: prop("object[]", "Overtime effect options"),
            getBaseWeaponOptions: fn("() => object[]", "Get base weapon options"),
            getToolNames: fn("() => object[]", "Get tool proficiency names"),
            getFeatOptions: fn("() => object[]", "Get feat options"),
          }
        },
        errors: {
          type: "object", detail: "object", info: "Error helper functions",
          children: {
            missingPack: fn("() => void", "Log missing pack error"),
            missingPackItem: fn("(key, name) => void", "Log missing pack item error"),
            missingActivity: fn("(identifier) => void", "Log missing activity error"),
          }
        },
        animationUtils: {
          type: "object", detail: "object", info: "Animation utility functions (Sequencer/JB2A)",
          children: {
            sequencerCheck: fn("() => boolean", "Check if Sequencer is available"),
            jb2aCheck: fn("() => boolean", "Check if JB2A is available"),
            simpleAttack: fn("(sourceToken, targetToken, animation, ...) => void", "Play simple attack animation"),
            preloadAnimations: fn("async (animations, showProgress?) => Promise", "Preload animation files"),
          }
        },
        spellUtils: {
          type: "object", detail: "object", info: "Spell utility functions",
          children: {
            getClassSpells: fn("(identifier) => string[]", "Get spells for a class"),
            getAllClassSpells: fn("() => object", "Get all class spell lists"),
            isClassSpell: fn("(item, identifier) => boolean", "Check if spell belongs to class"),
            getCompendiumSpell: fn("async (name, ...) => Promise<Item>", "Get spell from compendium"),
          }
        },
        crosshairUtils: {
          type: "object", detail: "object", info: "Crosshair utility functions",
          children: {
            aimCrosshair: fn("async (...) => Promise<object>", "Show aiming crosshair"),
          }
        },
      };

      const CPR_COMPLETIONS: CompletionNode = {
        utils: {
          type: "object", detail: "object", info: "CPR utility modules",
          children: CPR_UTILS,
        },
        Summons: {
          type: "class", detail: "class", info: "CPR Summons handler",
          children: {
            spawn: fn("async (sourceActors, updates?, originItem, summonerToken, options?) => Promise", "Spawn summoned creatures"),
          }
        },
        Teleport: {
          type: "class", detail: "class", info: "CPR Teleport handler",
        },
        Crosshairs: {
          type: "class", detail: "class", info: "CPR Crosshairs class",
        },
        DialogApp: {
          type: "class", detail: "class", info: "CPR Dialog application",
        },
        EmbeddedMacros: {
          type: "class", detail: "class", info: "CPR Embedded Macros application",
        },
        macros: prop("object", "CPR macro implementations"),
        legacyMacros: prop("object", "CPR legacy macro implementations"),
        integration: {
          type: "object", detail: "object", info: "Third-party integrations",
          children: {
            ddbi: fn("(item) => Promise<object>", "Get D&D Beyond Importer automation"),
            acc: prop("object", "Additional Compendiums Companion integration"),
          }
        },
      };

      if (!tree.chrisPremades) {
        tree.chrisPremades = { type: "object", detail: "object", info: "chris-premades (CPR) module namespace" };
      }
      mergeCompletions(tree.chrisPremades, CPR_COMPLETIONS);
      console.log("midi-qol | Injected rich chrisPremades completions");
    }

    // Rebuild signature map with the new completions
    rebuildSignatureMap();

    console.log("midi-qol | Midi-qol completions injected successfully");
  });
}
