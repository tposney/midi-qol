import { i18n } from "../../midi-qol.js";

/*
 * Picking dice of a roll (Empowered Spell's reroll, a module's "reroll up to N dice"). A die is keyed "die-result":
 * its index in roll.dice and the result's index in that term, which stay valid on a copy of the roll.
 *
 *   const keys = await MidiQOL.dice.pick(roll, { max: 2, title: "Empowered Spell" });
 *   const html = MidiQOL.dice.controlHTML(roll, { max: 2 });   // in your own form; MidiQOL.dice.wire(form) limits it
 */

export interface DieOption { key: string, faces: number, result: number, label: string }

/** The roll's dice that count (active, not discarded) */
export function diceOptions(roll: Roll): DieOption[] {
  return roll.dice.flatMap((term, die) => term.results.flatMap((result, index) => result.active && !result.discarded
    ? [{ key: `${die}-${index}`, faces: term.faces ?? 0, result: result.result, label: `d${term.faces}: ${result.result}` }] : []));
}

/** The dice worth rerolling: below their average, lowest first, up to `count` */
export function suggestLowDice(roll: Roll, count: number): string[] {
  return diceOptions(roll).filter(d => d.result < (d.faces + 1) / 2)
    .sort((a, b) => a.result / a.faces - b.result / b.faces).slice(0, Math.max(0, count)).map(d => d.key);
}

/** The dice as checkboxes (name "dice"), `chosen` ticked; `max` is kept by wire() */
export function diceControlHTML(roll: Roll, { max = 1, chosen = [] as string[] }: { max?: number, chosen?: string[] } = {}): string {
  return `<span class="midi-qol-dice-picker" data-max="${max}">${diceOptions(roll).map(d =>
    `<label class="midi-qol-die"><input type="checkbox" name="dice" value="${d.key}"${chosen.includes(d.key) ? " checked" : ""}> ${d.label}</label>`).join("")}</span>`;
}

/** No more than a picker's max ticked: ticking one more unticks the earliest; `onChange` gets the ticked keys */
export function wireDicePickers(root: HTMLElement, onChange?: (keys: string[], picker: HTMLElement) => void) {
  for (const picker of Array.from(root.querySelectorAll<HTMLElement>(".midi-qol-dice-picker"))) {
    picker.addEventListener("change", event => {
      const input = event.target as HTMLInputElement;
      const ticked = Array.from(picker.querySelectorAll<HTMLInputElement>("input[name='dice']:checked"));
      const max = Number(picker.dataset.max) || 1;
      if (ticked.length > max) for (const other of ticked.filter(t => t !== input).slice(0, ticked.length - max)) other.checked = false;
      onChange?.(pickedIn(picker), picker);
    });
  }
}

export const pickedIn = (picker: HTMLElement) => Array.from(picker.querySelectorAll<HTMLInputElement>("input[name='dice']:checked")).map(t => t.value);

/** Asks for up to `max` of the roll's dice (the lowest suggested): their keys, or undefined when cancelled */
export async function pickDice(roll: Roll, { max = 1, title = "", suggested }: { max?: number, title?: string, suggested?: string[] } = {}): Promise<string[] | undefined> {
  if (!diceOptions(roll).length) return [];
  let picked: string[] | undefined;
  await foundry.applications.api.DialogV2.wait({
    window: { title },
    content: `<p>${i18n("midi-qol.BonusPrompt.Dice").replace("{max}", String(max))}</p>${diceControlHTML(roll, { max, chosen: suggested ?? suggestLowDice(roll, max) })}`,
    buttons: [
      { action: "ok", label: i18n("midi-qol.Use"), default: true, callback: (_event: Event, button: HTMLButtonElement) => {
        const picker = button.form?.querySelector<HTMLElement>(".midi-qol-dice-picker");
        picked = picker ? pickedIn(picker) : [];
      } },
      { action: "cancel", label: i18n("Cancel") }
    ],
    rejectClose: false,
    render: (_event: Event, app: foundry.applications.api.DialogV2) => wireDicePickers(app.element)
  });
  return picked;
}

export const diceApi = { options: diceOptions, suggestLow: suggestLowDice, controlHTML: diceControlHTML, wire: wireDicePickers, pick: pickDice };
