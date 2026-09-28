/** The damage card as a chat message sub-type, rendered from `message.system`; `flags.midi-qol.undoDamage` stays the undo source. */

import { error } from "../../midi-qol.js";
import { ChatMessageRenderOptions } from "../../globals.js";
import { buildDamageCardContext, DamageListContextEntry, processUndoDamageCard } from "../GMAction.js";

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

        /** Decisions taken when damage was applied; figures stay in `flags.midi-qol.undoDamage`. */
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
                player: this.player, doHits: this.doHits, autoApplyDamage: this.autoApplyDamage,
                forceApply: this.forceApply, showNPC: this.showNPC, playerButtons: this.playerButtons
            });
        }

        /** Buttons are wired here: renderChatMessageHTML fires before the body is filled (it remains for older cards). */
        _onRender(element: HTMLElement) {
            super._onRender?.(element);
            processUndoDamageCard(this.parent, element, {});
        }
    };

    CONFIG.ChatMessage.dataModels[DAMAGE_MESSAGE_TYPE] = MidiDamageMessageData;
}
