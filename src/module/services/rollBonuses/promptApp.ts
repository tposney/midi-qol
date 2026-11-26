import { tokenFor } from "../../lib/tokenResolver.js";
import { RollModifyDialog } from "../../utils.js";
import { parseFlagValue } from "../../rules/optionalFlags.js";
import { effectOrder } from "./rules.js";
import type { OfferedBonus } from "./service.js";
import { bonusCostBadges, wirePickOne, type PromptResponses } from "../../lib/promptCosts.js";
import { bonusDamageTypeKey, rememberedChoice } from "../../lib/rememberedChoices.js";
import { getDistance } from "../distance/service.js";
import type { BonusConfigured, BonusSelection } from "./service.js";
import { diceControlHTML, pickedIn, wireDicePickers } from "../../lib/dicePicker.js";
import { diceChoices, suggestLowChoices } from "../diceReroll/service.js";
import { standingChoice, standingKey, STANDING_CHOICES, wireStandingSelects } from "./standing.js";

/*
 * midi's bonus prompt: a roll's optional bonuses (flags.midi-qol.optional and rollBonuses contributors), ticked
 * together and applied with one Apply, through RollModifyDialog's handlers (so a bonus
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
    const buttons: Record<string, { label?: string, icon?: string, tooltip?: string, candidate?: OfferedBonus }> = this.data.buttons ?? {};
    const actor = this.data.actor;
    // The row's standing choice (M15 stage 5a): the roller's own bonuses only (someone else's is its holder's)
    const standingOf = (candidate: OfferedBonus | undefined) => candidate && actor && (!candidate.spender || candidate.spender === actor.uuid)
      ? { standingKey: standingKey(candidate), standingLabel: candidate.flagLabel ?? candidate.label, choice: standingChoice(actor, standingKey(candidate)) } : {};
    const entries = Object.entries(buttons).filter(([id]) => id !== "no").map(([id, button]) => {
      const controls = button.candidate ? this.#controlsFor(button.candidate) : undefined;
      const configured = button.candidate ? this.#configured.get(button.candidate.id) : undefined;
      const cost = bonusCostBadges(configured?.cost ?? button.candidate?.cost);
      // An image in place of the default dice icon (a contributor's own icon HTML is kept)
      const img = button.candidate?.img && !button.candidate.iconHTML ? button.candidate.img : undefined;
      return { id, label: configured?.label ?? button.label, controls, disabled: configured?.disabled, icon: img ? undefined : button.icon, img, tooltip: button.tooltip, badges: cost.badges, exclusive: cost.reaction ? "reaction" : undefined, ...standingOf(button.candidate) };
    });
    const standingChoices = STANDING_CHOICES.map(value => ({ value, label: game.i18n?.localize(`midi-qol.Standing.${value}`) ?? value }));
    // M32a step 3: another part's rows (a failed save's reactions), after the bonuses; kept ticked across re-renders
    const responses: PromptResponses | undefined = this.data.responses;
    if (responses?.rows.length) responses.shown = true;
    const responseEntries = (responses?.rows ?? []).map(row => ({ ...row, id: `resp:${row.id}`, checked: responses?.chosen ? responses.chosen.includes(row.id) : row.checked }));
    return { ...context, entries: [...entries, ...responseEntries], standingChoices };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    wirePickOne(this.element);
    wireDicePickers(this.element);
    for (const row of Array.from(this.element.querySelectorAll<HTMLElement>("li.midi-qol-prompt-inputs")))
      row.addEventListener("change", event => void this.#onControl(row, event.target as HTMLInputElement));
    this.element.querySelector("[data-bonus-action='apply']")?.addEventListener("click", () => this.applyTicked());
    this.element.querySelector("[data-bonus-action='skip']")?.addEventListener("click", () => this.data.buttons?.no?.callback?.());
    wireStandingSelects(this.element, this.data.actor);
  }

  /** Applies the ticked bonuses in the order shown, each through its own handler. */
  async applyTicked() {
    const ticked = Array.from(this.element.querySelectorAll<HTMLInputElement>("input[name='bonus']:checked")).map(input => input.value);
    const responses: PromptResponses | undefined = this.data.responses;
    if (responses) responses.chosen = ticked.filter(id => id.startsWith("resp:")).map(id => id.slice(5));
    const ids = ticked.filter(id => !id.startsWith("resp:"));
    // Handlers re-render the dialog (new button ids), so take the buttons first; applied in the application order
    // (replace, reroll, add, outcome; rules orderForApplication), so an add ticked above a reroll isn't rerolled away
    const kindOf = (button: { value?: unknown, candidate?: { effect?: { kind?: string } } }) => {
      if (button.candidate?.effect?.kind) return button.candidate.effect.kind;
      const parsed = parseFlagValue(button.value);
      return parsed && "effect" in parsed ? parsed.effect.kind : "rider";
    };
    // Contract 4: each ticked row as configured for its selection (a disabled one isn't taken)
    const disabled = (id: string) => { const key = this.data.buttons?.[id]?.candidate?.id; return !!(key && this.#configured.get(key)?.disabled); };
    for (const id of ids) {
      const button = this.data.buttons?.[id];
      const key = button?.candidate?.id;
      const selection = key ? this.#selections.get(key) : undefined;
      if (!button?.candidate || !key || !selection) continue;
      const configured = this.#configured.get(key);
      button.candidate = { ...button.candidate, selection,
        ...(configured?.effect ? { effect: configured.effect } : {}), ...(configured?.cost ? { cost: configured.cost } : {}) };
    }
    const chosen = ids.filter(id => !disabled(id)).map(id => this.data.buttons?.[id]).filter(Boolean)
      .map((button, index) => ({ button, index })).sort((a, b) => (effectOrder(kindOf(a.button)) - effectOrder(kindOf(b.button))) || (a.index - b.index))
      .map(({ button }) => button);
    let rerolled = false;
    for (const button of chosen) {
      if (!this.rendered) break;
      const value: string = typeof button.value === "string" ? button.value : "";
      const kind: string | undefined = button.candidate?.effect?.kind;
      if (value.startsWith("reroll") || value.startsWith("replace") || kind === "reroll" || kind === "replace" || kind === "mode") rerolled = true;
      await this.submit(button);
    }
    if (!this.rendered) return;
    const remaining = Object.keys(this.data.buttons ?? {}).filter(id => id !== "no").length;
    if (!rerolled || remaining === 0) await this.close();
  }

  /* Contract 4: a row's scaling, inputs, damage type and targets */

  #selections = new Map<string, BonusSelection>();
  #configured = new Map<string, BonusConfigured>();

  /** The controls of a row whose bonus has a selection; its first selection kept */
  #controlsFor(candidate: OfferedBonus): PromptControl[] | undefined {
    const id = candidate.id;
    const controls: PromptControl[] = [];
    let selection = this.#selections.get(id);
    const first = !selection;
    selection ??= { inputs: {}, targets: [] };
    if (candidate.scaling) {
      const min = candidate.scaling.min ?? 1;
      if (first) selection.scaling = min;
      controls.push({ kind: "number", name: "scaling", label: candidate.scaling.label ?? game.i18n?.localize("midi-qol.BonusPrompt.Scaling") ?? "Level", min, max: candidate.scaling.max, value: selection.scaling ?? min });
    }
    for (const input of candidate.inputs ?? []) {
      if (first && input.default !== undefined) selection.inputs[input.name] = input.default;
      const value = selection.inputs[input.name];
      const chosen = (option: string) => Array.isArray(value) ? value.includes(option) : String(value) === option;
      controls.push({ kind: input.type, name: `in.${input.name}`, label: input.label, min: input.min, max: input.max, value: Array.isArray(value) ? undefined : value as string | number | boolean | undefined,
        options: input.options?.map(o => ({ value: o.value, label: o.label, selected: chosen(o.value) })) });
    }
    const types = candidate.effect.kind === "add" && !candidate.effect.damageType ? candidate.damageTypes ?? [] : [];
    if (types.length > 1) {
      if (first) selection.damageType = (rememberedChoice(this.data.actor, bonusDamageTypeKey(standingKey(candidate)))?.value as string | undefined) ?? types[0];
      const typeLabel = (type: string) => CONFIG.DND5E.damageTypes[type]?.label ?? type;
      controls.push({ kind: "select", name: "damageType", label: game.i18n?.localize("DND5E.DamageType") ?? "Damage type",
        options: types.map(type => ({ value: type, label: typeLabel(type), selected: type === selection!.damageType })) });
    }
    if (candidate.targeting) {
      const options = eligibleTargets(this.data.actor, candidate.targeting).flatMap(token => token.uuid ? [{ value: token.uuid, label: token.name ?? "", selected: selection!.targets.includes(token.uuid) }] : []);
      const max = this.#configured.get(id)?.maxTargets ?? candidate.targeting.max;
      controls.push({ kind: "targets", name: "targets", label: game.i18n?.format("midi-qol.BonusPrompt.Targets", { max: String(max) }) ?? "Targets", options });
    }
    // A reroll of chosen dice: the roll's dice to pick, up to its max (the lowest suggested)
    const effect = candidate.effect;
    const roll: Roll | undefined = this.data.currentRoll;
    if (effect.kind === "reroll" && effect.dice === "choose" && roll) {
      const max = this.#diceMax(effect.max, roll);
      const choices = diceChoices([roll]);
      if (first) selection.dice = suggestLowChoices(choices, max);
      controls.push({ kind: "dice", name: "dice", label: game.i18n?.format("midi-qol.BonusPrompt.Dice", { max: String(max) }) ?? "Dice", max,
        html: diceControlHTML(choices, { max, chosen: selection.dice ?? [] }) });
    }
    if (!controls.length) return undefined;
    if (first) {
      this.#selections.set(id, selection);
      if (candidate.configure) void this.#configure(id, candidate, selection, false);
    }
    return controls;
  }

  /** How many dice a "choose" reroll may take (a formula on the roller's data; 1 when it can't be read) */
  #diceMax(max: number | string | undefined, roll: Roll): number {
    if (typeof max === "number") return max;
    if (!max?.trim()) return 1;
    try {
      return new Roll(max, { ...roll.data, ...(this.data.actor?.getRollData() ?? {}) }).evaluateSync({ strict: false }).total || 1;
    } catch {
      return 1;
    }
  }

  /** A control changed: the selection, its targets limit, the bonus configured for it */
  async #onControl(row: HTMLElement, input: HTMLInputElement) {
    const id = row.dataset.row ?? "";
    const candidate: OfferedBonus | undefined = this.data.buttons?.[id]?.candidate;
    const selection = candidate ? this.#selections.get(candidate.id) : undefined;
    if (!candidate || !selection) return;
    if (input.name === "targets") {
      const ticked = Array.from(row.querySelectorAll<HTMLInputElement>("input[name='targets']:checked"));
      // Over its limit: the one just ticked stays, the earliest goes
      const max = this.#configured.get(candidate.id)?.maxTargets ?? candidate.targeting?.max ?? 1;
      if (ticked.length > max) for (const other of ticked.filter(t => t !== input).slice(0, ticked.length - max)) other.checked = false;
      selection.targets = Array.from(row.querySelectorAll<HTMLInputElement>("input[name='targets']:checked")).map(t => t.value);
    } else if (input.name === "dice") {
      // The picker keeps its max (wireDicePickers, wired first)
      const picker = row.querySelector<HTMLElement>(".midi-qol-dice-picker");
      selection.dice = picker ? pickedIn(picker) : [];
    } else if (input.name === "scaling") selection.scaling = Number(input.value);
    else if (input.name === "damageType") selection.damageType = input.value;
    else if (input.name.startsWith("in.")) {
      const name = input.name.slice(3);
      const kind = candidate.inputs?.find(i => i.name === name)?.type;
      selection.inputs[name] = kind === "checkbox" ? input.checked : kind === "number" ? Number(input.value)
        : kind === "multi" ? Array.from((input as unknown as HTMLSelectElement).selectedOptions).map(o => o.value) : input.value;
    }
    // Changing a row's selection ticks it
    const tick = this.element.querySelector<HTMLInputElement>(`input[name='bonus'][value='${id}']`);
    if (tick && !tick.checked) { tick.checked = true; tick.dispatchEvent(new Event("change")); }
    if (candidate.configure) await this.#configure(candidate.id, candidate, selection, true);
  }

  async #configure(id: string, candidate: OfferedBonus, selection: BonusSelection, render: boolean) {
    try {
      const query = this.data.bonusQuery ?? { kind: "check" as const, actor: this.data.actor };
      const configured = await candidate.configure!(selection, { query, phase: this.data.bonusPhase ?? "preResult", roll: this.data.currentRoll, selection });
      if (configured) this.#configured.set(id, configured);
      else this.#configured.delete(id);
    } catch (err) {
      this.#configured.set(id, { disabled: String((err as Error)?.message ?? err) });
    }
    if (!render || !this.rendered) return;
    // Re-rendered for the new label and cost: the rows ticked stay ticked
    const ticked = Array.from(this.element.querySelectorAll<HTMLInputElement>("input[name='bonus']:checked")).map(input => input.value);
    await this.render();
    for (const value of ticked) {
      const input = this.element.querySelector<HTMLInputElement>(`input[name='bonus'][value='${value}']`);
      if (input) input.checked = true;
    }
  }
}

interface PromptControl {
  kind: "number" | "select" | "multi" | "checkbox" | "text" | "targets" | "dice";
  name: string;
  label: string;
  min?: number;
  max?: number;
  value?: string | number | boolean;
  options?: { value: string, label: string, selected?: boolean }[];
  /** A dice picker's control (lib/dicePicker) */
  html?: string;
}

/** The creatures a bonus may pick: within its range of the roller, by disposition to it, the roller only when `self` */
function eligibleTargets(actor: Actor.Implementation | undefined, targeting: NonNullable<OfferedBonus["targeting"]>): TokenDocument.Implementation[] {
  if (targeting.candidates) return targeting.candidates.map(uuid => fromUuidSync(uuid)).filter((t): t is TokenDocument.Implementation => t instanceof TokenDocument);
  const own = tokenFor(actor);
  return (canvas?.scene?.tokens.contents ?? []).filter(token => {
    if (!token.actor) return false;
    if (own && token.uuid === own.uuid) return !!targeting.self;
    if (own && targeting.disposition === "ally" && token.disposition !== own.disposition) return false;
    if (own && targeting.disposition === "enemy" && token.disposition === own.disposition) return false;
    if (own && targeting.range !== undefined && token.object && own.object && getDistance(own.object, token.object) > targeting.range) return false;
    return true;
  });
}

