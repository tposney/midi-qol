/**
 * The damage card as a chat message sub-type: rendered from `message.system` on display rather than
 * having its markup stored.
 *
 * `flags.midi-qol.undoDamage` stays where it is — the system data is the render source, the flag is
 * the undo source, and cards written before this change carry it.
 */

import { error } from "../../midi-qol.js";
import { buildDamageCardContext, DamageListContextEntry, processUndoDamageCard } from "../GMAction.js";

/** Registered at setup, once dnd5e's base class is on `game.dnd5e`. */
export let MidiDamageMessageData: any;

/**
 * Must match the `documentTypes` entry in module.json. A literal, not built from MODULE_ID: the
 * import cycle through GMAction leaves MODULE_ID undefined when this module initialises.
 */
export const DAMAGE_MESSAGE_TYPE = "midi-qol.damage";

export function setupDamageCardMessage() {
    const base = globalThis.dnd5e?.dataModels?.abstract?.ChatMessageDataModel;
    if (!base) {
        error("dnd5e does not expose ChatMessageDataModel; damage cards will keep their stored markup");
        return;
    }
    const { BooleanField, StringField } = foundry.data.fields;

    MidiDamageMessageData = class extends base {
        // defined by defineSchema below; declared so the compiler can see them
        declare player: boolean;
        declare doHits: boolean;
        declare autoApplyDamage: string;
        declare forceApply: boolean;
        declare showNPC: boolean;
        declare playerButtons: boolean;
        declare parent: ChatMessage.Implementation;

        /**
         * Only the decisions taken when the damage was applied — the figures stay in
         * `flags.midi-qol.undoDamage` and everything else is looked up when the card renders.
         */
        static defineSchema() {
            return {
                player: new BooleanField({ initial: false }),
                doHits: new BooleanField({ initial: true }),
                autoApplyDamage: new StringField({ required: true, blank: true }),
                forceApply: new BooleanField({ initial: false }),
                showNPC: new BooleanField({ initial: true }),
                playerButtons: new BooleanField({ initial: false })
            };
        }

        static metadata = Object.freeze(foundry.utils.mergeObject(base.metadata, {
            template: "modules/midi-qol/templates/damage-results.html"
        }, { inplace: false }));

        /** The player card is the same data through a narrower template. */
        get template() {
            return this.player
                ? "modules/midi-qol/templates/damage-results-player.html"
                : "modules/midi-qol/templates/damage-results.html";
        }

        async _prepareContext(): Promise<{
            damageApplied: string;
            damageWasApplied: boolean;
            damageList: DamageListContextEntry[];
            needsButtonAll: boolean;
            showNPC: boolean;
            playerButtons?: boolean;
        }> {
            return buildDamageCardContext(this.parent, {
                player: this.player, doHits: this.doHits, autoApplyDamage: this.autoApplyDamage,
                forceApply: this.forceApply, showNPC: this.showNPC, playerButtons: this.playerButtons
            });
        }

        /**
         * Wire the buttons here, not from renderChatMessageHTML — that hook fires before this model
         * has filled the message body. Pre-sub-type cards keep their markup, so the hook remains.
         */
        _onRender(element: HTMLElement) {
            super._onRender?.(element);
            processUndoDamageCard(this.parent, element, {});
        }
    };

    CONFIG.ChatMessage.dataModels[DAMAGE_MESSAGE_TYPE] = MidiDamageMessageData;
}
