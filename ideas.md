Create new UI for settngs - mirror workflow?
   finer control on which parts are applied.
DSN + merged card - how to both display and hide the roll card? Or is there a better way
magic items + speed rolls not updating charges correclty.
chat damage buttons on non-merged card
?? chaining items
dynamic effect categories to setup:
  item is used - things that happen no matter what (serach for ??) || macro.always
  item applies effect to targets and de applies to target (search for @target) macro.targets
  item applies effect to targers and the de applies to self (target type === self??/@actor) macro.self
  target triggered effects - some sort of "special targets" that tirgger effects
How to treat saves on items with attack rolls?
How to display damage types on mergee card

New Features Summary
Better dnd5e integration, uses standard dnd5e rolls.
merge card for attack/damage
magic items support
new ui for configuration
immunities support dnd5e new physical damage - backport to minor-qol?
critical damage application types
Synthetic damage roll support (e.g. divine smite/hunters mark)


      <div>class="form-group"</div>
      {
        name: "AutoShiftClick",
        scope: "world",
        default: "all",
        type: String,
        choices: {off: "Off", attack: "Attack Rolls Only", damage: "Damage Rolls Only", all: "Attack and Damage"},
        onChange: fetchParams,
        config: false,
      },
      {
        name: "PreRollChecks",
        scope: "world",
        default: false,
        type: Boolean,
        onChange: fetchParams,
        config: false
      },
      {
        name: "AutoTarget",
        scope: "world",
        default: "wallsBlock",
        type: String,
        choices: {none: "None", always: "Always", wallsBlock: "Walls Block"},
        config: false,
        onChange: fetchParams
      },
      {
        name: "AutoCheckHit",
        scope: "world",
        choices: {none: "None", all: "Check - all see result", whisper: "Check - only GM sees", snotty: "Auto check + abuse"},
        default: "all",
        type: String,
        config: false,
        onChange: fetchParams
      },
      {
        name: "AutoCheckSaves",
        scope: "world",
        choices: {none: "None", all:  "Save - All see result", whisper: "Save - only GM sees", allShow: "Save - All see Result + Rolls"},
        default: "all",
        type: String,
        config:false,
        onChange: fetchParams
      },
      {
        name: "CheckSaveText",
        scope: "world",
        default: false,
        type: Boolean,
        config: false,
        onChange: fetchParams
      },
      {
        name: "PlayerRollSaves",
        scope: "world",
        choices: {none: "None",  letme: "Let Me Roll That For You", chat: "Chat Message"},
        default: "none",
        config: false,
        type: String,
        onChange: fetchParams
      },
      {
        name: "PlayerSaveTimeout",
        scope: "world",
        default: 30,
        type: Number,
        config: false,
        onChange: fetchParams
      },
      {
        name: "AutoRollDamage",
        scope: "world",
        choices: {none: "None", always:  "Always", onHit: "Attack Hits"},
        default: "onHit",
        type: String,
        config: false,
        onChange: fetchParams
      },
      {
        name: "CriticalDamage",
        scope: "world",
        choices: {default: "DND5e default", maxDamage:  "base max only", maxCrit: "max critical dice", maxAll: "max all dice"},
        default: "default",
        type: String,
        onChange: fetchParams
      },
      {
        name: "AddChatDamageButtons",
        scope: "world",
        default: true,
        type: Boolean,
        config: false,
        onChange: fetchParams
      },
      {
        name: "AutoApplyDamage",
        scope: "world",
        default: "yesCard",
        type: String,
        choices: {none: "No", yes: "Yes", yesCard: "Yes + undo damage card"},
        config: false,
        onChange: fetchParams
      },
      {
        name: "AutoRemoveTargets",
        scope: "world",
        default: "dead",
        type: String,
        choices: {none: "Never", dead: "untarget dead", all: "untarget all"},
        onChange: fetchParams
      },
      {
        name: "DamageImmunities",
        scope: "world",
        default: "savesDefault",
        type: String,
        config:false,
        choices: {none: "Never", immunityDefult: "apply immuniites", immunityPhysical: "apply immunities + physical"},
        onChange: fetchParams
      },
      {
        name: "AutoEffects",
        scope: "world",
        default: true,
        type: Boolean,
        config: false,
        onChange: fetchParams
      },
      {
        name: "MacroSpeedRolls",
        scope: "world",
        default: true,
        type: Boolean,
        onChange: fetchParams
      },
      {
        name: "HideNPCNames",
        scope: "world",
        default: "????",
        type: String,
        config: false,
        onChange: fetchParams
      },
      {
        name: "UseTokenNames",
        scope: "world",
        default: false,
        type: Boolean,
        config: false,
        onChange: fetchParams
      },
      {
        name: "ItemDeleteCheck",
        scope: "client",
        default: true,
        type: Boolean,
        choices: [],
        config:true,
        onChange: fetchParams
      },
      {
        name: "showGM",
        scope: "world",
        default: false,
        type: Boolean,
        choices: [],
        onChange: fetchParams
      },
      {
        name: "ColoredBorders",
        scope: "world",
        default: "None",
        type: String,
        choices: {none: "None", borders: "Borders Only", borderNames: "Border + Name"},
        onChange: fetchParams
      },
      {
        name: "RangeTarget",
        scope: "world",
        default: false,
        type: Boolean,
        choices: [],
        config: false,
        onChange: fetchParams
      },
      {
        name: "Debug",
        scope: "world",
        default: "None",
        type: String,
        choices: {none: "None", warn: "warnings", debug: "debug", all: "all"},
        onChange: fetchParams
      }