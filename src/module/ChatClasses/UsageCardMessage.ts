/**
 * The usage card — midi's main card — as a chat message sub-type.
 *
 * midi's card has always *been* a dnd5e usage message; what differed is how the markup got there.
 * Until now midi supplied `usage.chatCard` in each activity's metadata, dnd5e rendered that into
 * `message.content`, and its own `usage-card.hbs` short-circuited on it:
 *
 *     {{#if content}}{{{ content }}}{{else}}{{> "dnd5e.card-face" }}{{/if}}
 *
 * So the system's card face never ran, and midi carried a hand-written copy of the header, icon and
 * name block. That copy is why the card lost its styling under 6.0: `ItemMessageData` adds the
 * `compact` class to the message element, every avatar and header rule in dnd5e.css is scoped to
 * `:not(.compact)`, and midi's markup does not implement the compact contract that replaces them.
 *
 * `usage.chatCard` and `_usageChatContext` are deprecated in dnd5e 6.0 and removed in 6.2
 * (`activity/mixin.mjs#legacyUsageContent`), so this is not optional work.
 *
 * The rule followed here, and worth keeping to for the rest of the card migration: **mirror the call
 * structure, but do not reimplement the work**. Header, description, rows, buttons and the effects
 * tray come from dnd5e's own partials; midi contributes only the sections dnd5e has no equivalent
 * for — per-target hits, saves, advantage presentation and the damage tray.
 */

import { error } from "../../midi-qol.js";
import { Activity, ChatMessageRenderOptions, Dnd5eChatMessage } from "../../globals.js";
import { configSettings } from "../settings.js";
import { getRemoveAllButtons, getRemoveAttackButtons, getRemoveDamageButtons, midiRenderAttackRoll,
  midiRenderDamageRolls, midiRenderOtherDamageRolls, midiRenderBonusDamageRolls, midiRenderFormulaRoll, renderRollAttributionIcon, renderSaveRollHTML } from "../utils.js";
import { MODULE_ID } from "../../midi-qol.js";

/**
 * The renderer each roll-backed section uses, keyed by the roll type it is built from.
 *
 * Every renderer takes the section's whole roll list. The damage ones aggregate it into a single
 * block - one formula, one total, an icon per damage type - which is how the card read before the
 * rolls were stored separately. Attack and utility sections carry one roll, so they render it.
 */
const SECTION_ROLL_RENDERERS: Record<string, (rolls: Roll[]) => Promise<string> | string> = {
  attack: rolls => midiRenderAttackRoll(rolls[0]),
  defaultDamage: midiRenderDamageRolls,
  otherDamage: midiRenderOtherDamageRolls,
  bonusDamage: midiRenderBonusDamageRolls,
  utility: rolls => midiRenderFormulaRoll(rolls[0])
};

/** Roll types midi tags damage rolls with; the presence of one means damage has been rolled. */
const DAMAGE_ROLL_TYPES = ["defaultDamage", "otherDamage", "bonusDamage"];

/**
 * Which of the card's buttons this user should see, resolved at render.
 *
 * Two things decide it, and only one of them is worth storing.
 *
 * The *policy* — `getRemoveAttackButtons` and friends — is a pure function of the activity and the
 * current settings, so it is evaluated here rather than persisted. That matters beyond tidiness:
 * those predicates read `gmRemoveButtons` for a GM and `removeButtons` for a player, and the two are
 * separate settings on separate tabs of the config panel. Stripping the buttons from the stored card
 * — which is what midi did while the card was markup — baked whoever happened to roll into the
 * document, so a player's roll imposed the player setting on the GM and vice versa. Only one of the
 * two settings ever took effect per card. Resolving per viewer honours both.
 *
 * The *progress* — has the attack been rolled, has the GM confirmed — cannot be derived from
 * settings, but most of it need not be stored either: `message.rolls` already carries a
 * `midi-qol.rollType` on every roll, so "the attack has been rolled" is a question the message can
 * answer about itself. Only genuine events that leave no other trace are persisted, in `midi.progress`.
 *
 * Called from both `_prepareContext` (midi's own buttons) and `MidiActivityMixin.shouldHideChatButton`
 * (dnd5e's), so the rule exists once.
 */
export function midiButtonVisibility(message: Dnd5eChatMessage | undefined, activity?: Activity) {
  const midi = (message?.system as { midi?: Record<string, any> } | undefined)?.midi ?? {};
  const progress = midi.progress ?? {};
  const rollTypeOf = (r: unknown) => foundry.utils.getProperty(r as object, "options.midi-qol.rollType");
  const rolls = message?.rolls ?? [];
  const attackRolled = rolls.some(r => rollTypeOf(r) === "attack");
  const damageRolled = rolls.some(r => DAMAGE_ROLL_TYPES.includes(String(rollTypeOf(r))));

  /*
   * Confirmation holds the buttons only while it is *pending*. Once the GM has confirmed, the normal
   * removal policy resumes — which is what makes the confirm-time calls that also ask for the attack
   * and damage buttons to go work without being recorded separately.
   *
   * `progress.confirmed` is set by callers that merely wanted the confirm buttons gone, including
   * when confirmation is switched off entirely, so it must not by itself imply the card is finished.
   */
  // Recorded on the card: the setting at the time of use, and whether the activity had anything to confirm.
  const confirmEnabled = !!midi.confirmAttackDamage;
  const confirmPending = confirmEnabled && !progress.confirmed;
  const done = !!progress.allRemoved;
  const removeAll = done || getRemoveAllButtons(activity);

  /*
   * "The roll has been made and the policy says its control goes." Kept separate from the two
   * `attack`/`damage` answers below because it governs dnd5e's buttons as well as midi's: midi only
   * draws its own control for some activities, and where it does not the system's should still
   * disappear on the same terms rather than lingering as the one way to re-roll.
   */
  const attackSpent = attackRolled && !confirmPending && (removeAll || getRemoveAttackButtons(activity));
  const damageSpent = damageRolled && !confirmPending && (removeAll || getRemoveDamageButtons(activity));

  return {
    attack: !done && !!midi.hasAttack && !attackSpent,
    damage: !done && !!midi.hasDamage && !damageSpent,
    attackSpent: done || attackSpent,
    damageSpent: done || damageSpent,
    // Not gated on `hasAttackRoll`: an activity with no attack still gets a confirm step, as a
    // single "confirm roll" button rather than the hit/miss pair.
    confirm: !done && confirmPending,
    confirmHitMiss: !done && confirmPending && !!midi.hasAttackRoll,
    // `undoWorkflow` is a setting, so it is read now rather than stored.
    cancel: !done && confirmPending && !!configSettings.undoWorkflow,
    effects: !done && !!midi.hasEffects
      && !(progress.effectsApplied && configSettings.autoItemEffects === "applyRemove"),
    allRemoved: done,
    savesResolved: !!progress.savesResolved,
    templatesPlaced: !!progress.templatesPlaced
  };
}

/** Registered at init, beside the damage-card model. */
export let MidiUsageMessageData: any;

export const USAGE_MESSAGE_TYPE = "usage";

/**
 * The card's roll sections, in the order the template lays them out.
 *
 * Named rather than free-form because the template does not simply iterate them — the condensed
 * layout puts attack and damage side by side, and hits sits between them — so each is placed by name.
 * Kept in step with the container classes in `templates/chat/usage-card.hbs`.
 */
export const SECTION_NAMES = [
  "attack", "hits", "damage", "otherDamage", "bonusDamage", "utility", "saves"
] as const;

export type SectionName = typeof SECTION_NAMES[number];

/** The per-target fields `saves.html` reads. Anything else on a save entry is not worth storing. */
export const SAVE_TEMPLATE_FIELDS = [
  "attributionTooltip", "coverLabel", "gmName", "hasAttribution", "img", "playerName",
  "rollTotal", "saveClass", "saveSymbol", "saveTooltip", "saveToolTipClass", "saveTotalClass", "targetClass"
] as const;

/**
 * One roll section of the card. Either it names the rolls it is built from, or it carries markup —
 * the roll-backed ones regenerate at render, the rest (hits, saves) do not.
 */
export type MidiCardSection = { label: string, rollType?: string, template?: string, data?: Record<string, unknown>, html?: string };

export function setupUsageCardMessage() {
  /*
   * Subclass whatever is registered *now*, not dnd5e's base class, so a module that claimed the slot
   * first is composed with rather than silently discarded. dnd5e registers its own models during the
   * system's `init`, which runs before any module's.
   *
   * This must happen at `init`: `game.messages` is constructed before `ready`, and a document keeps
   * the data model class it was built with. Registering later left every message loaded at startup
   * on dnd5e's base model, where `system.midi` is not in the schema — so the card rendered as a plain
   * dnd5e card, and any `toObject()` round-trip dropped midi's data from the database outright.
   */
  // Typed loosely for the same reason `MidiDamageMessageData` is: the system's model classes are not
  // described by fvtt-types, and the registered occupant may be any module's subclass of them.
  const base: any = CONFIG.ChatMessage.dataModels?.[USAGE_MESSAGE_TYPE]
    ?? globalThis.dnd5e?.dataModels?.chatMessage?.UsageMessageData;
  if (!base) {
    error("dnd5e does not expose a usage chat message model; usage cards keep their stored markup");
    return;
  }

  const { BooleanField, NumberField, ObjectField, SchemaField, StringField } = foundry.data.fields;

  MidiUsageMessageData = class extends base {
    declare parent: ChatMessage.Implementation;
    declare midi: Record<string, any>;

    /**
     * The card's rendering decisions, stored rather than recomputed.
     *
     * Nearly all of them depend on the workflow — `hasDamage` comes from `getAutoRollDamage(workflow)`,
     * `hasEffects` from the workflow type, `dmgBtnText` from its fast-forward option — and the
     * workflow exists when the activity is *used*, not when the card is *rendered*. A card is
     * rendered again on every reload and every scroll back through the log, long after the workflow
     * has gone, so deciding these at render time would give a card that looked right once and decayed
     * afterwards. They are settled once, at creation, and read back from here.
     *
     * Only what the template needs lives here. Anything that must survive midi being disabled stays
     * in `flags.midi-qol.*`, because unknown `system.*` keys are stripped on validation.
     */
    static defineSchema() {
      const schema = super.defineSchema();
      /*
       * Extend dnd5e's own `targets` rather than keeping a second list beside it.
       *
       * `TargetsField` is `{ac, actor, img, name, token}` and, being a SchemaField, silently drops
       * anything else — so midi's per-target detail (save results and multipliers, uncanny dodge)
       * had nowhere to go and the damage tray could not see it. Its element schema is not frozen, so
       * the extra fields are added to the field dnd5e already defined: one target list, dnd5e's
       * `TargetsField.resolve`/`getDescriptors` and `<recorded-targets>` all keep working, and
       * midi's detail travels with the target it describes.
       */
      const targets = schema.targets as { element?: { fields?: Record<string, unknown> } } | undefined;
      if (targets?.element?.fields) {
        Object.assign(targets.element.fields, {
          uncannyDodge: new BooleanField({ required: false }),
          uncannyDodgeIcon: new StringField({ required: false, blank: true }),
          flankingBonus: new NumberField({ required: false }),
          saved: new BooleanField({ required: false }),
          superSaver: new BooleanField({ required: false }),
          semiSuperSaver: new BooleanField({ required: false }),
          saveMults: new ObjectField({ required: false }),
          itemType: new StringField({ required: false, blank: true })
        });
      }
      return {
        ...schema,
        midi: new SchemaField({
          hasButtons: new BooleanField({ initial: false }),
          hasAttack: new BooleanField({ initial: false }),
          hasAttackRoll: new BooleanField({ initial: false }),
          hasDamage: new BooleanField({ initial: false }),
          hasEffects: new BooleanField({ initial: false }),
          condensed: new BooleanField({ initial: false }),
          mergeCardMulti: new BooleanField({ initial: false }),
          confirmAttackDamage: new BooleanField({ initial: false }),
          hideItemDetails: new BooleanField({ initial: false }),
          displayProperties: new BooleanField({ initial: true }),
          dmgBtnText: new StringField({ required: false, blank: true }),
          // Set while the workflow waits for a manual attack roll: the advantage state it will use.
          attackBtnText: new StringField({ required: false, blank: true }),

          /*
           * How many times each roll has been made, shown as a `[n]` prefix on the buttons once past
           * the first. The old card did this by regex-rewriting the rendered button label inside
           * `content`; the count is data, so it is stored as data and the template does the prefixing.
           */
          attackRollCount: new NumberField({ required: false, integer: true, initial: 0 }),
          damageRollCount: new NumberField({ required: false, integer: true, initial: 0 }),

          /*
           * Events the card cannot work out for itself.
           *
           * Deliberately small. Whether the attack has been rolled is answered by `message.rolls`,
           * and whether the buttons should go once it has is answered by the settings at render —
           * see `midiButtonVisibility`. What is left is the handful of things that leave no other
           * trace: the GM confirming a hit, a workflow being cancelled outright, effects applied,
           * saves resolved, templates placed.
           */
          progress: new SchemaField({
            allRemoved: new BooleanField({ initial: false }),
            confirmed: new BooleanField({ initial: false }),
            effectsApplied: new BooleanField({ initial: false }),
            savesResolved: new BooleanField({ initial: false }),
            templatesPlaced: new BooleanField({ initial: false })
          }, { required: false }),

          /*
           * The rendered roll sections — attack, hits, damage, saves and so on.
           *
           * midi has always stored these as rendered HTML; what changes is where. Until now each
           * `Workflow#display*` method regex-matched its container inside `message.content` and
           * spliced a filled copy back in. With the card rendered from a template `content` is empty,
           * so every one of those replacements silently matched nothing.
           *
           * The bytes are the same ones `content` used to carry — this is not new storage, it is the
           * same HTML in named slots instead of one opaque blob, which is also what lets the regexes
           * go. Sections are written as they are produced and rendered by position in the template.
           */
          sections: new SchemaField(Object.fromEntries(SECTION_NAMES.map(name => [name,
            new SchemaField({
              label: new StringField({ required: false, blank: true }),
              /*
               * A section names the rolls it is built from rather than storing their markup.
               *
               * `midiRenderTemplateRoll` is a pure function of the Roll — formula, tooltip, flavor,
               * total, advantage mode and the attribution list all come from `roll` and
               * `roll.options`, and those persist in `message.rolls` already. Storing the rendered
               * output as well was keeping a second copy of data the card was carrying anyway:
               * measured at 714 B for the attack section and 1,954 B for damage on a 9.8 kB card.
               *
               * `html` remains for the sections that are not roll-backed (hits, saves) and for cards
               * written before this change.
               */
              rollType: new StringField({ required: false, blank: true }),
              /*
               * Or a section names a template and carries its render data, for the parts that are
               * not roll-backed. Storing the data rather than the output is smaller — the hits
               * section measured 961 B of markup for a single target — and it is also more correct:
               * the old rendered form baked in `isGM` and `collapsibleTargets`, decided by whoever
               * ran the workflow, onto a card that is rendered separately for every client.
               */
              template: new StringField({ required: false, blank: true }),
              data: new ObjectField({ required: false }),
              html: new StringField({ required: false, blank: true })
            }, { required: false, nullable: true, initial: null })
          ])), { required: false })
        }, { required: false })
      };
    }

    static metadata = Object.freeze(foundry.utils.mergeObject(base.metadata, {
      template: "modules/midi-qol/templates/chat/usage-card.hbs"
    }, { inplace: false }));

    /**
     * dnd5e never consults `shouldHideChatButton` for buttons visible to everyone, so midi's own
     * removal — all buttons removed, or saves resolved — is applied to those here.
     */
    _prepareButtons() {
      const buttons = super._prepareButtons() as { action: string, visibility: string, hidden: boolean }[];
      const parent = this.parent as Dnd5eChatMessage;
      const visible = midiButtonVisibility(parent, parent.getAssociatedActivity?.());
      return buttons.map(button => {
        if (button.hidden || button.visibility !== "all") return button;
        const spent = visible.allRemoved || (visible.savesResolved && ["rollSave", "rollCheck"].includes(button.action));
        return spent ? { ...button, hidden: true } : button;
      });
    }

    /**
     * Everything the card face needs is already supplied by the parent model — item, activity,
     * description, subtitle, buttons, effects, summaries. midi adds only its own keys.
     *
     * When the message carries `content` the parent returns `{ content }` alone and nothing else is
     * populated; the template renders that verbatim, which is what keeps cards written before this
     * change, and any activity still on the deprecated path, rendering exactly as they did.
     */
    async _prepareContext(options: ChatMessageRenderOptions): Promise<Record<string, any>> {
      const context = await this.#prepareBaseContext(options);
      if (context?.content) return context;

      /*
       * The damage tray is declared in the template rather than appended after render. dnd5e 6.0
       * emits its own `<damage-application>` from `damage-card.hbs` and no longer calls
       * `_enrichDamageTooltip` — the method midi used to hang its insertion off — so an appended
       * tray simply never appeared.
       */
      /*
       * midi's two display settings act on parts of the card that are now dnd5e's, so they are
       * applied to the prepared context rather than by the template: `showItemDetails` used to gate
       * the description block, and `displayProperties` the property pills, both of which
       * `dnd5e.card-face` renders unconditionally.
       */
      if (this.midi?.hideItemDetails) delete context.description;
      if (this.midi && this.midi.displayProperties === false) {
        if (context.rows) delete context.rows.properties;
        // The materials line is a supplement, not a row, but belongs to the same setting. dnd5e labels
        // it with the unlocalised key.
        if (context.supplements) {
          context.supplements = context.supplements.filter((sup: any) => sup?.label !== "DND5E.Materials");
        }
      }

      const sections = await this.#renderSections();
      context.midi = {
        ...(this.midi ?? {}),
        sections,
        buttons: midiButtonVisibility(this.parent, (this.parent as Dnd5eChatMessage).getAssociatedActivity?.()),
        // The confirm button counts the damage roll about to be made, not the last one. Derived here
        // rather than in the template because core registers no arithmetic Handlebars helper.
        nextDamageRollCount: (this.midi?.damageRollCount ?? 0) + 1,
        damageApplicationTypes: this.#damageApplicationTypes()
      };
      return context;
    }

    /**
     * dnd5e's context preparation, with the activity guaranteed to be an object.
     *
     * `UsageMessageData._prepareContext` reads `activity.metadata.targetPhase` without checking that
     * `getAssociatedActivity()` resolved. A card whose originating item no longer exists — a
     * TrapWorkflow built from a temporary item, or an item since deleted — therefore throws on every
     * render, and because the chat log renders in batches it takes neighbouring messages down with
     * it. Standing in a bare object for the duration lets the card render from what it stored.
     */
    async #prepareBaseContext(options: ChatMessageRenderOptions): Promise<Record<string, any>> {
      const parent = this.parent as Dnd5eChatMessage;
      const resolve = parent.getAssociatedActivity;
      if (typeof resolve !== "function" || resolve.call(parent)) return super._prepareContext(options);
      Object.defineProperty(parent, "getAssociatedActivity", {
        // What dnd5e's context preparation reaches for. Several of its reads guard the activity
        // itself but not the property beneath it — `activity?.target.affects.type` — so the shape
        // has to go a level deeper than it first appears.
        value: () => ({
          metadata: {},
          target: { affects: {}, template: {} },
          // No activity to act on, so none of the stored buttons would do anything.
          shouldHideChatButton: () => true
        }),
        configurable: true, writable: true
      });
      try {
        return await super._prepareContext(options);
      } finally {
        delete (parent as unknown as Record<string, unknown>).getAssociatedActivity;
      }
    }

    /**
     * Put each save entry's roll markup back, rendered from the save roll on the card.
     *
     * The rolls are tagged `rollType: "save"` with the target uuid they belong to, so the entry only
     * has to name its target. Storing the rendered form instead cost 1,036 B per target.
     */
    async #withSaveRolls(saves: any[]): Promise<any[]> {
      const byTarget = new Map<string, Roll>();
      for (const roll of this.parent.rolls ?? []) {
        if (foundry.utils.getProperty(roll, `options.${MODULE_ID}.rollType`) !== "save") continue;
        const uuid = foundry.utils.getProperty(roll, `options.${MODULE_ID}.targetUuid`);
        if (typeof uuid === "string") byTarget.set(uuid, roll);
      }
      return Promise.all(saves.map(async (save: any) => ({
        ...save,
        // Falls back to whatever was stored, for cards written before the rolls were carried.
        rollHTML: save.rollHTML || await renderSaveRollHTML(byTarget.get(save?.target?.document?.uuid ?? ""))
      })));
    }

    /**
     * Build the roll sections for rendering, generating the roll-backed ones from `message.rolls`.
     *
     * A section that names a `rollType` is rendered here with the same midi renderer the workflow
     * used, so the advantage presentation, attribution tooltip and damage-type icons are unchanged —
     * they are properties of the roll, not of the markup. A section that carries `html` (hits, saves,
     * and every card written before this change) is passed through untouched.
     */
    async #renderSections(): Promise<Record<string, unknown>> {
      const stored: Record<string, any> = this.midi?.sections ?? {};
      const out: Record<string, unknown> = {};
      for (const name of SECTION_NAMES) {
        const section = stored[name];
        if (!section) { out[name] = null; continue; }
        if (section.template) {
          out[name] = {
            ...section,
            html: await foundry.applications.handlebars.renderTemplate(section.template, {
              ...(section.data ?? {}),
              ...(section.data?.saves ? { saves: await this.#withSaveRolls(section.data.saves) } : {}),
              // Resolved per viewer, not per roller.
              oneCard: true,
              collapsibleTargets: configSettings.collapsibleTargets,
              isGM: game.user?.isGM
            })
          };
          continue;
        }
        if (!section.rollType) { out[name] = section; continue; }
        const renderer = SECTION_ROLL_RENDERERS[section.rollType];
        const rolls = (this.parent.rolls ?? []).filter(r =>
          foundry.utils.getProperty(r, `options.${MODULE_ID}.rollType`) === section.rollType);
        // No rolls to render from — a card mid-workflow, or one whose rolls were pruned.
        if (!renderer || !rolls.length) { out[name] = { ...section, html: section.html ?? "" }; continue; }
        const html = await renderer(rolls as Roll[]);
        // The attribution icon sits on the label, where the splice used to put it.
        const label = `${section.label ?? ""}${await renderRollAttributionIcon(rolls[0])}`;
        out[name] = { ...section, label, html };
      }
      return out;
    }

    /**
     * The damage roll types to give a tray of their own: each applies its own save multiplier.
     * Empty when this viewer is not offered trays.
     */
    #damageApplicationTypes(): string[] {
      const byRole = configSettings.addChatDamageButtons === "both"
        || (configSettings.addChatDamageButtons === "gm" && game.user?.isGM)
        || (configSettings.addChatDamageButtons === "pc" && !game.user?.isGM);
      const gmWithoutAutoApply = !!game.user?.isGM && configSettings.autoApplyDamage === "none";
      if (!byRole && !gmWithoutAutoApply) return [];
      const present = new Set((this.parent.rolls ?? []).map(r => foundry.utils.getProperty(r, `options.${MODULE_ID}.rollType`)));
      return DAMAGE_ROLL_TYPES.filter(type => present.has(type));
    }
  };

  CONFIG.ChatMessage.dataModels[USAGE_MESSAGE_TYPE] = MidiUsageMessageData;
}
