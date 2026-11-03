/**
 * midi's usage card as dnd5e's usage message sub-type: dnd5e renders the card face, midi adds hits, saves,
 * advantage presentation and the damage tray. Design notes: dnd5e-v6-checklist, M13.
 */

import { error } from "../../midi-qol.js";
import { Activity, ChatMessageRenderOptions, Dnd5eChatMessage } from "../../globals.js";
import { configSettings, safeGetGameSetting } from "../settings.js";
import { getRemoveAllButtons, getRemoveAttackButtons, getRemoveDamageButtons, midiRenderAttackRoll,
  midiRenderDamageRolls, midiRenderOtherDamageRolls, midiRenderBonusDamageRolls, midiRenderFormulaRoll, renderRollAttributionIcon, renderSaveRollHTML } from "../utils.js";
import { MODULE_ID } from "../../midi-qol.js";
import { Workflow } from "../Workflow.js";
import { followUpButtons } from "../followUps.js";
import { NOTE_MESSAGE_TYPE, noteCard, notesOf } from "./CardNoteMessage.js";

/** Renderer per roll-backed section; damage renderers aggregate the section's rolls into one block. */
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
 * Which of the card's buttons this user should see. Policy comes from the settings at render (GM and player
 * settings differ), progress mostly from `message.rolls`. Used for midi's buttons and dnd5e's.
 */
export function midiButtonVisibility(message: Dnd5eChatMessage | undefined, activity?: Activity) {
  const midi = (message?.system as { midi?: Record<string, any> } | undefined)?.midi ?? {};
  const progress = midi.progress ?? {};
  const rollTypeOf = (r: unknown) => foundry.utils.getProperty(r as object, "options.midi-qol.rollType");
  const rolls = message?.rolls ?? [];
  const attackRolled = rolls.some(r => rollTypeOf(r) === "attack");
  const damageRolled = rolls.some(r => DAMAGE_ROLL_TYPES.includes(String(rollTypeOf(r))));

  // Confirmation holds the buttons only while pending; `progress.confirmed` alone does not mean the card is finished.
  const confirmEnabled = !!midi.confirmAttackDamage;
  const confirmPending = confirmEnabled && !progress.confirmed;
  // midi's card actions dispatch through the activity: once its item is gone none of them can run.
  const done = !!progress.allRemoved || !activity || !!message?.getFlag(MODULE_ID, "undone");
  const removeAll = done || getRemoveAllButtons(activity);
  // Attacks handed to one use per target: those cards attack, damage and apply effects.
  const split = !!progress.attacksSplit;

  // Rolled (or the workflow finished without the roll) and the policy removes its control; also governs dnd5e's
  // buttons where midi draws none.
  const finished = !!progress.finished;
  const attackSpent = (attackRolled || finished) && !confirmPending && (removeAll || getRemoveAttackButtons(activity));
  const damageSpent = (damageRolled || finished) && !confirmPending && (removeAll || getRemoveDamageButtons(activity));

  return {
    attack: !done && !split && !!midi.hasAttack && !attackSpent,
    damage: !done && !split && !!midi.hasDamage && !damageSpent,
    attackSpent: done || attackSpent,
    damageSpent: done || damageSpent,
    // An activity with no attack roll still confirms, with one button instead of hit/miss.
    confirm: !done && !split && confirmPending,
    confirmHitMiss: !done && !split && confirmPending && !!midi.hasAttackRoll,
    cancel: !done && !split && confirmPending && !!configSettings.undoWorkflow,
    effects: !done && !split && !!midi.hasEffects
      && !(progress.effectsApplied && configSettings.autoItemEffects === "applyRemove"),
    allRemoved: done,
    savesResolved: !!progress.savesResolved,
    teleported: !!progress.teleported,
    templatesPlaced: !!progress.templatesPlaced
  };
}

/** Registered at init, beside the damage-card model. */
export let MidiUsageMessageData: any;

export const USAGE_MESSAGE_TYPE = "usage";

/** The card's roll sections; the template places each by name, in step with `templates/chat/usage-card.hbs`. */
export const SECTION_NAMES = [
  "attack", "hits", "damage", "otherDamage", "bonusDamage", "utility", "saves"
] as const;

export type SectionName = typeof SECTION_NAMES[number];

/** The per-target fields `saves.html` reads. Anything else on a save entry is not worth storing. */
export const SAVE_TEMPLATE_FIELDS = [
  "attributionTooltip", "coverLabel", "gmName", "hasAttribution", "img",
  "rollTotal", "saveClass", "saveSymbol", "saveTooltip", "saveToolTipClass", "saveTotalClass", "targetClass"
] as const;

/** A roll section: a roll type rendered from `message.rolls`, a template with data, or stored markup. */
export type MidiCardSection = { label: string, rollType?: string, template?: string, data?: Record<string, unknown>, html?: string };

export function setupUsageCardMessage() {
  // Must run at init, subclassing the current occupant so another module's model is kept. Untyped: fvtt-types
  // does not describe the system's models.
  const base: any = CONFIG.ChatMessage.dataModels?.[USAGE_MESSAGE_TYPE]
    ?? globalThis.dnd5e?.dataModels?.chatMessage?.UsageMessageData;
  if (!base) {
    error("dnd5e does not expose a usage chat message model; usage cards keep their stored markup");
    return;
  }

  const { ArrayField, BooleanField, ForeignDocumentField, NumberField, ObjectField, SchemaField, StringField } = foundry.data.fields;

  MidiUsageMessageData = class extends base {
    declare parent: ChatMessage.Implementation;
    declare midi: Record<string, any>;

    /** Rendering decisions settled at creation, since they depend on a workflow that is gone by render time. */
    static defineSchema() {
      const schema = super.defineSchema();
      // midi's per-target detail extends dnd5e's own targets list; its element schema is not frozen.
      const targets = schema.targets as { element?: { fields?: Record<string, unknown> } } | undefined;
      if (targets?.element?.fields) {
        Object.assign(targets.element.fields, {
          uncannyDodge: new BooleanField({ required: false }),
          uncannyDodgeIcon: new StringField({ required: false, blank: true }),
          saved: new BooleanField({ required: false }),
          superSaver: new BooleanField({ required: false }),
          semiSuperSaver: new BooleanField({ required: false }),
          saveMults: new ObjectField({ required: false }),
          itemType: new StringField({ required: false, blank: true })
        });
      }
      return {
        ...schema,
        // The card of the workflow this use was started from (Workflow.executingCardFor); deleted with it.
        origin: new ForeignDocumentField(foundry.documents.BaseChatMessage),
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

          // Activities offered as buttons after the attack hit (followUps.ts).
          followUps: new ArrayField(new SchemaField({
            activityUuid: new StringField({ required: true, blank: false }),
            label: new StringField({ required: false, blank: true }),
            targetUuids: new ArrayField(new StringField()),
            critical: new BooleanField({ initial: false }),
            used: new BooleanField({ initial: false })
          }), { required: false }),

          // Shown as a `[n]` button prefix after the first roll.
          attackRollCount: new NumberField({ required: false, integer: true, initial: 0 }),
          damageRollCount: new NumberField({ required: false, integer: true, initial: 0 }),

          // Only events that leave no other trace; the rest is derived (see midiButtonVisibility).
          progress: new SchemaField({
            allRemoved: new BooleanField({ initial: false }),
            // The use's attacks were handed to one use per target; their cards carry the rolls.
            attacksSplit: new BooleanField({ initial: false }),
            confirmed: new BooleanField({ initial: false }),
            effectsApplied: new BooleanField({ initial: false }),
            // The workflow ran to completion: no roll can advance it now (e.g. every target missed)
            finished: new BooleanField({ initial: false }),
            savesResolved: new BooleanField({ initial: false }),
            teleported: new BooleanField({ initial: false }),
            templatesPlaced: new BooleanField({ initial: false })
          }, { required: false }),

          // The card's roll sections, written as the workflow produces them.
          sections: new SchemaField(Object.fromEntries(SECTION_NAMES.map(name => [name,
            new SchemaField({
              label: new StringField({ required: false, blank: true }),
              // Rendered from the rolls of this type in `message.rolls`.
              rollType: new StringField({ required: false, blank: true }),
              // Or rendered per viewer from a template and its data; `html` is for older cards.
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

    /** dnd5e skips `shouldHideChatButton` for buttons visible to all, so midi's removal is applied here. */
    _prepareButtons() {
      const buttons = super._prepareButtons() as { action: string, visibility: string, hidden: boolean }[];
      const parent = this.parent as Dnd5eChatMessage;
      const visible = midiButtonVisibility(parent, parent.getAssociatedActivity?.());
      return buttons.map(button => {
        if (button.hidden || button.visibility !== "all") return button;
        const spent = visible.allRemoved || (visible.savesResolved && ["rollSave", "rollCheck"].includes(button.action))
          || (visible.teleported && button.action === "planTeleport");
        return spent ? { ...button, hidden: true } : button;
      });
    }

    /** dnd5e's context plus midi's keys; a message with `content` (older cards) renders it verbatim. */
    async _prepareContext(options: ChatMessageRenderOptions): Promise<Record<string, any>> {
      const context = await this.#prepareBaseContext(options);
      if (context?.content) return context;

      // A teleport that moves the controlled tokens opens its targets list on them (dnd5e's Selected view).
      const activity = (this.parent as Dnd5eChatMessage).getAssociatedActivity?.();
      // @ts-expect-error no dnd5e-types
      const targetState = this.parent._targetState;
      const teleportMovers = (activity as { midiTeleport?: { movers?: string } } | undefined)?.midiTeleport?.movers;
      if (activity?.type === "teleport" && teleportMovers === "default" && targetState && !targetState.mode) targetState.mode = "selected";

      // midi's display settings act on parts dnd5e's card face renders unconditionally.
      if (this.midi?.hideItemDetails) delete context.description;
      if (this.midi && this.midi.displayProperties === false) {
        if (context.rows) delete context.rows.properties;
        // Materials is a supplement, labelled with the unlocalised key.
        if (context.supplements) {
          context.supplements = context.supplements.filter((sup: any) => sup?.label !== "DND5E.Materials");
        }
      }

      // midi applies the effects itself and offers no button for them, so there is nothing for a tray to do.
      if (["applyNoButton", "applyRemove"].includes(configSettings.autoItemEffects)) context.effects = [];

      // Notes, and messages a note owns, are drawn by the notes.
      context.summaries = (context.summaries ?? []).filter((summary: any) => !drawnSeparately(game.messages?.get(summary.id)));
      const sections = await this.#renderSections(this.#applySaveSummaries(context));
      context.midi = {
        ...(this.midi ?? {}),
        sections,
        buttons: midiButtonVisibility(this.parent, (this.parent as Dnd5eChatMessage).getAssociatedActivity?.()),
        // The damage roll about to be made; Handlebars has no arithmetic helper.
        nextDamageRollCount: (this.midi?.damageRollCount ?? 0) + 1,
        followUps: followUpButtons(this.parent),
        damageApplicationTypes: this.#damageApplicationTypes(),
        notes: await this.#renderNotes()
      };
      return context;
    }

    /** The notes this viewer may see, rendered, by anchor and position. */
    async #renderNotes(): Promise<Record<string, Record<string, string[]>>> {
      const out: Record<string, Record<string, string[]>> = {};
      const place = (anchor: string, position: string, html: string) => ((out[anchor] ??= {})[position] ??= []).push(html);
      const notes = notesOf(this.parent).filter(note => note.visible)
        .sort((a, b) => (((a.system as { sort?: number }).sort ?? 0) - ((b.system as { sort?: number }).sort ?? 0)) || ((a.timestamp ?? 0) - (b.timestamp ?? 0)));
      for (const note of notes) {
        const system = note.system as { anchor?: string, position?: string, render?: (options: object) => Promise<string> };
        try {
          place(system.anchor ?? "bottom", system.position ?? "append", await system.render?.({ summary: true }) ?? "");
        } catch (err) {
          error(`card note ${note.id} could not be rendered`, err);
        }
      }
      return out;
    }

    /**
     * dnd5e 6 folds the card's save and check messages into it as summaries for viewers with "Summarize chat cards"
     * on. On a midi card that summary is midi's saves section (style "midi": dnd5e's summaries of the saves and checks it
     * has a result row for are dropped, others kept) or dnd5e's per-roll summaries, with midi's section keeping only saves that have none:
     * other modules' saves reach midi without a linked message.
     * With the setting off neither is drawn and the messages show in the log. Returns the save targets to omit.
     */
    #applySaveSummaries(context: Record<string, any>): Set<string> | "all" {
      if (!this.midi) return new Set();
      if (safeGetGameSetting("dnd5e", "chatCardSummary") === false) {
        context.summaries = [];
        return "all";
      }
      if (configSettings.saveSummaryStyle !== "dnd5e") {
        // midi's section stands in for the summaries of the saves and checks it shows a result for (a save rolled from the
        // card's button is recorded in it, cardSaves.ts); any other summary is dnd5e's to show.
        const shown = new Set((this.midi?.sections?.saves?.data?.saves ?? [])
          .filter((save: any) => save?.saveClass || (save?.rollTotal != null && save.rollTotal !== ""))
          .map((save: any) => save?.target?.document?.uuid).filter(Boolean));
        context.summaries = (context.summaries ?? []).filter((summary: any) =>
          !(["save", "check"].includes(game.messages?.get(summary.id)?.type ?? "") && shown.has(summary.token?.uuid)));
        return new Set();
      }
      return new Set((context.summaries ?? []).map((summary: any) => summary.token?.uuid).filter(Boolean));
    }

    /** dnd5e's context with a stand-in activity when the item is gone; dnd5e's would throw and break the log batch. */
    async #prepareBaseContext(options: ChatMessageRenderOptions): Promise<Record<string, any>> {
      const parent = this.parent as Dnd5eChatMessage;
      const resolve = parent.getAssociatedActivity;
      if (typeof resolve !== "function" || resolve.call(parent)) return super._prepareContext(options);
      Object.defineProperty(parent, "getAssociatedActivity", {
        // dnd5e reads `activity?.target.affects.type`, so the stand-in needs the nested shape.
        value: () => ({
          metadata: {},
          target: { affects: {}, template: {} },
          shouldHideChatButton: () => true
        }),
        configurable: true, writable: true
      });
      try {
        const context = await super._prepareContext(options);
        // Buttons dispatch through the activity, so none without one.
        delete context.buttons;
        delete context.buttonGroups;
        return context;
      } finally {
        delete (parent as unknown as Record<string, unknown>).getAssociatedActivity;
      }
    }

    /** Each save entry's roll markup, rendered from the card's save roll tagged with its target uuid. */
    async #withSaveRolls(saves: any[]): Promise<any[]> {
      const byTarget = new Map<string, Roll>();
      for (const roll of this.parent.rolls ?? []) {
        if (foundry.utils.getProperty(roll, `options.${MODULE_ID}.rollType`) !== "save") continue;
        const uuid = foundry.utils.getProperty(roll, `options.${MODULE_ID}.targetUuid`);
        if (typeof uuid === "string") byTarget.set(uuid, roll);
      }
      return Promise.all(saves.map(async (save: any) => ({
        ...save,
        // Older cards stored the markup.
        rollHTML: save.rollHTML || await renderSaveRollHTML(byTarget.get(save?.target?.document?.uuid ?? ""))
      })));
    }

    /** The sections for rendering: roll-backed ones from `message.rolls`, template ones per viewer, `html` as stored. */
    async #renderSections(omitSaves: Set<string> | "all" = new Set()): Promise<Record<string, unknown>> {
      const stored: Record<string, any> = this.midi?.sections ?? {};
      const out: Record<string, unknown> = {};
      for (const name of SECTION_NAMES) {
        let section = stored[name];
        // Targets added to an attack card after its roll (e.g. by another module's buttons) get a hits list to show in.
        if (name === "hits" && !section && stored.attack && this.#recordedTargets().length)
          section = { label: "", template: "modules/midi-qol/templates/hits.html", data: { hits: [] } };
        if (name === "saves" && section?.data?.saves) {
          // The heading (DC, damage on save) stays when dnd5e's summaries replace the rows; it has no DC of its own.
          section = (omitSaves === "all" || !section.data.saves.length) ? null : { ...section, data: { ...section.data,
            saves: section.data.saves.filter((save: any) => !omitSaves.has(save?.target?.document?.uuid ?? "")) } };
        }
        if (!section) { out[name] = null; continue; }
        if (section.template) {
          out[name] = {
            ...section,
            html: await foundry.applications.handlebars.renderTemplate(section.template, {
              ...(section.data ?? {}),
              ...(section.data?.saves ? { saves: await this.#withSaveRolls(section.data.saves) } : {}),
              // Against everything midi evaluated, not just the rows left once dnd5e's summaries replace some.
              unevaluated: this.#unevaluatedTargets(name, stored[name]?.data ?? section.data),
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

    #recordedTargets(): { name?: string, img?: string, token?: string }[] {
      return ((this as unknown as { targets?: { name?: string, img?: string, token?: string }[] }).targets ?? []);
    }

    /**
     * Recorded targets with no entry in midi's hits or saves list: added to the card after the roll, so never checked
     * by the workflow. Shown with a marker rather than a result.
     */
    #unevaluatedTargets(name: string, data: Record<string, any> | undefined): { id: string, uuid: string, name: string, img: string }[] {
      const entries: any[] = name === "hits" ? (data?.hits ?? []) : name === "saves" ? (data?.saves ?? []) : [];
      if (!["hits", "saves"].includes(name)) return [];
      const known = new Set(entries.map(entry => entry?.target?.id).filter(Boolean));
      return this.#recordedTargets()
        .map(t => ({ id: t.token?.split(".").pop() ?? "", uuid: t.token ?? "", name: t.name ?? "", img: t.img ?? "" }))
        .filter(t => t.id && !known.has(t.id));
    }

    /**
     * Damage roll types that get their own tray (each has its own save multiplier); empty if this viewer gets none.
     * Who gets a tray is dnd5e's decision, made as its own damage cards make it: the GM, or players where
     * `allowPlayerDamageTray` is on, and nobody on a card whose content is hidden from them.
     */
    #damageApplicationTypes(): string[] {
      const allowed = !!game.user?.isGM || !!safeGetGameSetting("dnd5e", "allowPlayerDamageTray");
      if (!allowed || !this.parent.isContentVisible) return [];
      const present = new Set((this.parent.rolls ?? []).map(r => foundry.utils.getProperty(r, `options.${MODULE_ID}.rollType`)));
      return DAMAGE_ROLL_TYPES.filter(type => present.has(type));
    }
  };

  CONFIG.ChatMessage.dataModels[USAGE_MESSAGE_TYPE] = MidiUsageMessageData;
  Hooks.on("createChatMessage", linkToExecutingWorkflow);
  // Notifications render with canClose, which dnd5e treats as a popout and so doesn't hide a message a card summarises:
  // a message hidden in the log (a save or check on its card, a card note, a note's checks) would pop up on its own.
  Hooks.once("setup", () => globalThis.libWrapper.register(MODULE_ID, "foundry.applications.sidebar.tabs.ChatLog.prototype.notify",
    function (this: unknown, wrapped: (...args: unknown[]) => unknown, message: ChatMessage.Implementation, options: { existing?: HTMLElement } = {}, ...rest: unknown[]) {
      const logged = options.existing ?? ui.chat?.element?.querySelector<HTMLElement>(`.message[data-message-id="${message?.id}"]`);
      if (logged?.hidden) return;
      return wrapped(message, options, ...rest);
    }, "MIXED"));
  Hooks.on("createChatMessage", redrawForNoteMessage);
  Hooks.on("updateChatMessage", redrawForNoteMessage);
  Hooks.on("deleteChatMessage", redrawForNoteMessage);

  // A card whose item is deleted loses its buttons, but only when rendered again; redraw the ones on screen.
  Hooks.on("deleteItem", (item: Item.Implementation) => {
    for (const message of game.messages ?? []) {
      if (!(message.system instanceof MidiUsageMessageData)) continue;
      // @ts-expect-error no dnd5e-types
      if (message.system.item?.uuid !== item.uuid) continue;
      if (ui.chat?.element?.querySelector(`.message[data-message-id="${message.id}"]`)) ui.chat.updateMessage(message);
    }
  });
}

/** A usage card drawn from its data, not from stored markup. */
export function rendersFromModel(message: ChatMessage.Implementation): boolean {
  return !!MidiUsageMessageData && message.system instanceof MidiUsageMessageData && !message._source.content;
}

/** Messages linked to a card that the card draws in their own place, not among dnd5e's summaries: its notes. */
function drawnSeparately(message: ChatMessage.Implementation | undefined): boolean {
  return message?.type === NOTE_MESSAGE_TYPE;
}

/**
 * dnd5e redraws a message's parent when one of its messages is created, deleted or changes: for a note's message that is
 * the note, which is hidden, so its card is redrawn here. A reroll changes a message's rolls, which dnd5e ignores.
 */
function redrawForNoteMessage(message: ChatMessage.Implementation) {
  const note = game.messages?.get((message._source.system as { origin?: string } | undefined)?.origin ?? "");
  const card = note?.type === NOTE_MESSAGE_TYPE ? noteCard(note) : undefined;
  if (card && ui.chat?.element?.querySelector(`.message[data-message-id="${card.id}"]`)) ui.chat.updateMessage(card);
}

/**
 * A use started from inside a workflow can run on another client (CAT's `completeItemUse` runs it on the actor's owner),
 * where the workflow doesn't exist, so the card arrives unlinked. The client running that workflow links it.
 */
function linkToExecutingWorkflow(message: ChatMessage.Implementation, _options: object, userId: string) {
  if (userId === game.user?.id || !MidiUsageMessageData || !(message.system instanceof MidiUsageMessageData)) return;
  if ((message._source.system as { origin?: string | null } | undefined)?.origin) return;
  const actor = ChatMessage.getSpeakerActor(message.speaker);
  const parent = actor ? Workflow.executingCardFor(actor) : undefined;
  if (!parent || parent.id === message.id || !message.canUserModify(game.user!, "update")) return;
  const path: string = "system.origin";
  message.update({ [path]: parent.id });
}
