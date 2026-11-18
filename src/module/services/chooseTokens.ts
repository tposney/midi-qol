import { i18n } from "../../midi-qol.js";
import { defineService } from "../api/services.js";
import { getDistance } from "../utils.js";

/*
 * chooseTokens (single): "pick N of these tokens", for macros and modules (cleave, a summon's command, a reaction's
 * target). midi's default is a DialogV2 list with each token's image, name and distance; a module can provide its own.
 *
 *   const chosen = await MidiQOL.chooseTokens({ tokens: nearby, max: 1, title: "Cleave", from: attackerToken });
 */

export interface ChooseTokensRequest {
  tokens: readonly (Token.Implementation | TokenDocument.Implementation)[];
  /** Fewest to choose (default 1; 0 allows choosing none). */
  min?: number;
  /** Most to choose (default 1). */
  max?: number;
  title?: string;
  /** A line above the list. */
  hint?: string;
  /** Show each token's distance from this token. */
  from?: Token.Implementation | TokenDocument.Implementation;
  /** Tokens ticked to start with. */
  preselected?: readonly (Token.Implementation | TokenDocument.Implementation)[];
}

export interface ChooseTokensProvider {
  /** The chosen tokens' documents, or null when cancelled. */
  choose(request: ChooseTokensRequest): Promise<TokenDocument.Implementation[] | null>;
}

const documentOf = (token: Token.Implementation | TokenDocument.Implementation): TokenDocument.Implementation =>
  token instanceof TokenDocument ? token : token.document;

const escape = (text: string) => foundry.utils.escapeHTML(text);

/** midi's picker: a radio list for one choice, checkboxes up to `max` otherwise. */
const midiChooser: ChooseTokensProvider = {
  async choose(request) {
    const documents = request.tokens.map(documentOf);
    if (!documents.length) return [];
    const min = Math.max(0, request.min ?? 1);
    const max = Math.max(min, request.max ?? 1);
    const single = max === 1;
    const preselected = new Set((request.preselected ?? []).map(t => documentOf(t).uuid));
    const from = request.from;
    const rows = documents.map((document, index) => {
      const distance = from && document.object ? getDistance(from, document.object, {}) : undefined;
      const distanceText = distance !== undefined && distance >= 0 ? ` <span class="hint">(${Math.round(distance)} ${escape(canvas?.scene?.grid.units ?? "")})</span>` : "";
      const checked = preselected.has(document.uuid ?? "") ? "checked" : "";
      return `<label class="midi-qol-choose-token" style="display:flex;align-items:center;gap:8px">
        <input type="${single ? "radio" : "checkbox"}" name="choice" value="${index}" ${checked}>
        <img src="${escape(document.texture.src ?? "")}" width="36" height="36" style="border:none">
        <span>${escape(document.name ?? "")}${distanceText}</span></label>`;
    }).join("");
    const hint = request.hint ? `<p>${escape(request.hint)}</p>` : "";
    const counts = !single ? `<p class="hint">${escape(i18n("midi-qol.ChooseTokens.Count").replace("{min}", String(min)).replace("{max}", String(max)))}</p>` : "";
    const { DialogV2 } = foundry.applications.api;
    const result = await DialogV2.wait({
      window: { title: request.title ?? i18n("midi-qol.ChooseTokens.Title") },
      classes: ["midi-qol-choose-tokens"],
      position: { width: 320 },
      content: `${hint}${counts}<div style="display:flex;flex-direction:column;gap:4px">${rows}</div>`,
      buttons: [
        {
          action: "ok", label: i18n("midi-qol.ChooseTokens.Confirm"), default: true,
          callback: (_event: Event, button: HTMLButtonElement) => {
            const inputs = button.form ? Array.from(button.form.querySelectorAll<HTMLInputElement>('input[name="choice"]:checked')) : [];
            return inputs.map(input => Number(input.value));
          }
        },
        { action: "cancel", label: i18n("midi-qol.ChooseTokens.Cancel") }
      ],
      // No more than `max` ticked; the confirm button only with at least `min`
      render: (_event: Event, dialog: foundry.applications.api.DialogV2) => {
        const root = dialog.element;
        const update = () => {
          const boxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="choice"]'));
          const ticked = boxes.filter(b => b.checked).length;
          if (!single) for (const box of boxes) box.disabled = !box.checked && ticked >= max;
          const ok = root.querySelector<HTMLButtonElement>('button[data-action="ok"]');
          if (ok) ok.disabled = ticked < min;
        };
        root.addEventListener("change", update);
        update();
      },
      rejectClose: false
    });
    if (!Array.isArray(result)) return null;
    return result.map(index => documents[index]).filter((d): d is TokenDocument.Implementation => !!d);
  }
};

declare module "../api/services.js" {
  interface MidiServices { chooseTokens: ChooseTokensProvider }
}

export let chooseTokensService: ReturnType<typeof defineService<ChooseTokensProvider>>;

export function defineChooseTokensService() {
  chooseTokensService = defineService<ChooseTokensProvider>("chooseTokens", {
    kind: "single",
    description: "Ask the user to pick some of a list of tokens"
  });
  chooseTokensService.register("midi-qol", midiChooser, { label: "Midi-QOL token chooser" });
}

/** The active provider's choice (midi's dialog by default): the chosen tokens' documents, or null when cancelled. */
export async function chooseTokens(request: ChooseTokensRequest): Promise<TokenDocument.Implementation[] | null> {
  const provider = chooseTokensService?.get() ?? midiChooser;
  return provider.choose(request);
}
