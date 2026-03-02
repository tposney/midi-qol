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
      targets: { type: "property", detail: "Set<Token5e>", info: "The targeted tokens" },
      hitTargets: { type: "property", detail: "Set<Token5e>", info: "Tokens that were hit" },
      failedSaves: { type: "property", detail: "Set<Token5e>", info: "Tokens that failed saves" },
      savedTargets: { type: "property", detail: "Set<Token5e>", info: "Tokens that succeeded saves" },
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
        children: {
          type: { type: "property", detail: "string", info: "Activity type" },
          name: { type: "property", detail: "string", info: "Activity name" },
          item: { type: "property", detail: "Item5e", info: "Parent item" },
          damage: { type: "property", detail: "object", info: "Damage configuration" },
          save: { type: "property", detail: "object", info: "Save configuration" },
          attack: { type: "property", detail: "object", info: "Attack configuration" },
          use: { type: "method", detail: "(usage?, dialog?, message?) => Promise<ChatMessage[]>", info: "Use this activity" },
          rollAttack: { type: "method", detail: "(config?, dialog?, message?) => Promise<D20Roll[]>", info: "Roll attack" },
          rollDamage: { type: "method", detail: "(config?, dialog?, message?) => Promise<DamageRoll[]>", info: "Roll damage" },
        }
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
      attackRoll: { type: "property", detail: "D20Roll", info: "The attack roll" },
      attackTotal: { type: "property", detail: "number", info: "Attack roll total" },
      damageRolls: { type: "property", detail: "DamageRoll[]", info: "Damage rolls" },
      damageTotal: { type: "property", detail: "number", info: "Total damage" },
      damageDetail: { type: "property", detail: "object[]", info: "Damage breakdown by type" },
      saveResults: { type: "property", detail: "Map", info: "Save results by token UUID" },
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
  (Hooks as any).on("macro-autocomplete.ready", ({ tree, rebuildSignatureMap, schemaToCompletions, mergeCompletions, classToCompletions }: {
    tree: CompletionNode;
    rebuildSignatureMap: () => void;
    schemaToCompletions?: (schema: any) => CompletionNode;
    mergeCompletions?: (target: { children?: CompletionNode }, additions: CompletionNode) => void;
    classToCompletions?: (cls: any) => { staticChildren: CompletionNode; instanceChildren: CompletionNode; constructorDetail?: string };
  }) => {
    console.log("midi-qol | Injecting midi-qol completions into macro-autocomplete");

    const cfg = (globalThis as any).CONFIG;

    // Inject MidiQOL namespace
    tree.MidiQOL = MIDI_COMPLETIONS.MidiQOL;

    // Inject workflow top-level variable (spread from scope by Foundry)
    tree.workflow = MIDI_COMPLETIONS.workflow;

    // Inject item as top-level variable (spread from scope by Foundry)
    // Base data properties declared here; instance methods come from prototype walk
    tree.item = {
      type: "variable", detail: "Item", info: "Item being used (available in midi-qol macros, spread from scope)",
      children: {
        name: { type: "property", detail: "string", info: "Item name" },
        type: { type: "property", detail: "string", info: "Item type (weapon, spell, feat, equipment, consumable, ...)" },
        img: { type: "property", detail: "string", info: "Item image path" },
        uuid: { type: "property", detail: "string", info: "Item UUID" },
        id: { type: "property", detail: "string", info: "Item ID" },
        isOwner: { type: "property", detail: "boolean", info: "Current user is owner" },
        system: {
          type: "property", detail: "object", info: "Item system data (populated from system schema)",
          children: {}
        },
        items: { type: "property", detail: "Collection<Item>", info: "Actor's item collection" },
        effects: { type: "property", detail: "Collection<ActiveEffect>", info: "Item's effects" },
        actor: { type: "property", detail: "Actor | null", info: "Owning actor" },
      }
    };

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
      item: { type: "property", detail: "Item", info: "Parent item" },
      actor: { type: "property", detail: "Actor", info: "Owning actor (via item.actor)" },

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
      // Add to scope.children for `scope.xxx` completion
      if (tree.scope?.children) {
        tree.scope.children[key] = { type: "property", detail, info };
      }
      // Create top-level variable entry if it doesn't already exist.
      // Entries with a `ref` share children/instanceChildren with the referenced entry.
      if (!tree[key]) {
        const source = ref ? tree[ref] : undefined;
        tree[key] = {
          type: "variable", detail, info,
          ...(source?.children && { children: source.children }),
          ...(source?.instanceChildren && { instanceChildren: source.instanceChildren }),
        };
      }
    }

    // Rebuild signature map with the new completions
    rebuildSignatureMap();

    console.log("midi-qol | Midi-qol completions injected successfully");
  });
}
