import { RollModifyDialog } from "../utils.js";

/*
 * midi's phased bonus prompt: the same bonuses as the classic dialog (flags.midi-qol.optional and rollBonuses
 * contributors), ticked together and applied with one Apply, through the classic dialog's own handlers (so a bonus
 * does the same whichever window offers it). After a reroll or replace it stays open while bonuses remain, with the
 * new roll; otherwise Apply closes it. Skip closes it without applying.
 */
export class BonusPromptApp extends RollModifyDialog {
  static PARTS = {
    dialog: {
      id: "dialog-optional",
      classes: ["dialog", "midi-qol", "optional", "midi-qol-bonus-prompt"],
      template: "modules/midi-qol/templates/bonus-prompt.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const buttons: Record<string, { label?: string, icon?: string }> = this.data.buttons ?? {};
    const entries = Object.entries(buttons).filter(([id]) => id !== "no").map(([id, button]) => ({ id, label: button.label, icon: button.icon }));
    return { ...context, entries };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector("[data-bonus-action='apply']")?.addEventListener("click", () => this.applyTicked());
    this.element.querySelector("[data-bonus-action='skip']")?.addEventListener("click", () => this.data.buttons?.no?.callback?.());
  }

  /** Applies the ticked bonuses in the order shown, each through its own handler. */
  async applyTicked() {
    const ids = Array.from(this.element.querySelectorAll<HTMLInputElement>("input[name='bonus']:checked")).map(input => input.value);
    // Handlers re-render the dialog (new button ids), so take the buttons first
    const chosen = ids.map(id => this.data.buttons?.[id]).filter(Boolean);
    let rerolled = false;
    for (const button of chosen) {
      if (!this.rendered) break;
      const value: string = typeof button.value === "string" ? button.value : "";
      const kind: string | undefined = button.candidate?.effect?.kind;
      if (value.startsWith("reroll") || value.startsWith("replace") || kind === "reroll" || kind === "replace") rerolled = true;
      await this.submit(button);
    }
    if (!this.rendered) return;
    const remaining = Object.keys(this.data.buttons ?? {}).filter(id => id !== "no").length;
    if (!rerolled || remaining === 0) await this.close();
  }
}
