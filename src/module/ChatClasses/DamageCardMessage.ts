/** The damage card as a chat message sub-type, rendered from `message.system`; `flags.midi-qol.undoDamage` stays the undo source. */

import { error } from "../../midi-qol.js";
import { ChatMessageRenderOptions, ContextMenuEntryV14 } from "../../globals.js";
import { buildDamageCardContext, DamageListContextEntry, processUndoDamageCard } from "../GMAction.js";
import { USAGE_MESSAGE_TYPE } from "./UsageCardMessage.js";
import { NOTE_MESSAGE_TYPE } from "./CardNoteMessage.js";
import { messagesFrom } from "../lib/cardState.js";

/** Registered at setup, once dnd5e's base class is on `game.dnd5e`. */
export let MidiDamageMessageData: any;

/** Matches module.json `documentTypes`; a literal because MODULE_ID is undefined here (import cycle via GMAction). */
export const DAMAGE_MESSAGE_TYPE = "midi-qol.damage";

export function setupDamageCardMessage() {
    const base = globalThis.dnd5e?.dataModels?.abstract?.ChatMessageDataModel;
    if (!base) {
        error("dnd5e does not expose ChatMessageDataModel; damage cards will keep their stored markup");
        return;
    }
    const { BooleanField, ForeignDocumentField, StringField } = foundry.data.fields;

    MidiDamageMessageData = class extends base {
        // defined by defineSchema below; declared so the compiler can see them
        declare playerView: boolean;
        declare doHits: boolean;
        declare autoApplyDamage: string;
        declare forceApply: boolean;
        declare showNPC: boolean;
        declare playerButtons: boolean;
        declare origin: ChatMessage.Implementation | null;
        declare parent: ChatMessage.Implementation;

        /** Decisions taken when damage was applied; figures stay in `flags.midi-qol.undoDamage`. */
        static defineSchema() {
            return {
                playerView: new BooleanField({ initial: false }),
                doHits: new BooleanField({ initial: true }),
                autoApplyDamage: new StringField({ required: true, blank: true }),
                forceApply: new BooleanField({ initial: false }),
                showNPC: new BooleanField({ initial: true }),
                playerButtons: new BooleanField({ initial: false }),
                // The usage card the damage came from, as dnd5e links save messages: deleted with it.
                origin: new ForeignDocumentField(foundry.documents.BaseChatMessage)
            };
        }

        /** Cards from before the merged card stored `player`; an old player card shows players their view. Remove with dnd5e 6.2. */
        static migrateData(source: Record<string, unknown>) {
            if (source.player !== undefined && source.playerView === undefined) source.playerView = source.player;
            return super.migrateData(source);
        }

        static metadata = Object.freeze(foundry.utils.mergeObject(base.metadata, {
            template: "modules/midi-qol/templates/damage-results.html"
        }, { inplace: false }));

        /** Players see the card through a narrower template; the GM always sees the full one. */
        get asPlayer(): boolean {
            return this.playerView && !game.user?.isGM;
        }

        get template() {
            return this.asPlayer
                ? "modules/midi-qol/templates/damage-results-player.html"
                : "modules/midi-qol/templates/damage-results.html";
        }

        // Keeps `options`: the base passes rendering options such as `summary` through.
        async _prepareContext(_options?: ChatMessageRenderOptions): Promise<{
            damageApplied: string;
            damageWasApplied: boolean;
            damageList: DamageListContextEntry[];
            needsButtonAll: boolean;
            showNPC: boolean;
            playerButtons?: boolean;
        }> {
            return buildDamageCardContext(this.parent, {
                playerView: this.playerView, doHits: this.doHits, autoApplyDamage: this.autoApplyDamage,
                forceApply: this.forceApply, showNPC: this.showNPC, playerButtons: this.playerButtons
            }, this.asPlayer);
        }

        _getEnrichmentOptions() {
            return { avatar: false };
        }

        /** Buttons are wired here: renderChatMessageHTML fires before the body is filled (it remains for older cards). */
        _onRender(element: HTMLElement) {
            super._onRender?.(element);
            processUndoDamageCard(this.parent, element, {});
            // Next to the card it came from, the speaker and whisper recipients only repeat it.
            if (this.origin) element.querySelectorAll(".message-header :is(.message-sender, .whisper-to)").forEach(e => e.remove());
        }
    };

    CONFIG.ChatMessage.dataModels[DAMAGE_MESSAGE_TYPE] = MidiDamageMessageData;
    Hooks.on("deleteChatMessage", deleteLinkedDamageCards);
}

/**
 * midi's damage and usage cards and card notes go with the card they came from. dnd5e deletes only summarised messages
 * with their origin, and a player deleting their card can't delete the GM's damage cards, so the active GM does it.
 */
function deleteLinkedDamageCards(message: ChatMessage.Implementation, options: object) {
    if (("deleteAll" in options && options.deleteAll) || !game.users?.activeGM?.isSelf) return;
    // A note's own messages (a contested roll's checks) go with it, as the note goes with its card.
    const linked = () => messagesFrom(message.id!)
        .filter(m => [DAMAGE_MESSAGE_TYPE, USAGE_MESSAGE_TYPE, NOTE_MESSAGE_TYPE].includes(m.type) || message.type === NOTE_MESSAGE_TYPE)
        .map(m => m.id!);
    if (!linked().length) return;
    // After the current delete operation, which may already include them.
    setTimeout(() => {
        const ids = linked();
        if (ids.length) ChatMessage.deleteDocuments(ids);
    }, 0);
}

function isDamageCardData(system: unknown): system is { playerView: boolean } {
    return !!MidiDamageMessageData && system instanceof MidiDamageMessageData;
}

/** Render a damage card as a player sees it, midi's per-viewer stripping included. */
async function renderAsPlayer(message: ChatMessage.Implementation): Promise<HTMLElement> {
    Object.defineProperty(game.user, "isGM", { get: () => false, configurable: true });
    try { return await message.renderHTML(); } finally { Reflect.deleteProperty(game.user!, "isGM"); }
}

/** GM chat context-menu entry: show a damage card as players see it. */
export function addViewAsPlayerOption(_app: unknown, options: ContextMenuEntryV14[]) {
    const messageOf = (li: HTMLElement) => game.messages?.get(li.dataset.messageId ?? "");
    options.push({
        label: "midi-qol.DamageCardViewAsPlayer",
        icon: "fa-solid fa-user",
        visible: li => !!game.user?.isGM && messageOf(li)?.type === DAMAGE_MESSAGE_TYPE,
        onClick: async (_event, li) => {
            const message = messageOf(li);
            if (!message) return;
            const html = await renderAsPlayer(message);
            const shown = isDamageCardData(message.system) && message.system.playerView;
            foundry.applications.api.DialogV2.prompt({
                window: { title: shown ? "midi-qol.DamageCardPlayerView" : "midi-qol.DamageCardPlayerViewHidden" },
                content: html.outerHTML,
                rejectClose: false
            });
        }
    });
}
