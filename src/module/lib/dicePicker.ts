/*
 * The dice picker control: a die per checkbox (name "dice"), grouped under a heading when the dice come from several
 * groups (damage types), no more than its max ticked. The dice and what is done with them are the diceReroll service's
 * (services/diceReroll); the bonus prompt and the service's own dialog both show this control.
 *
 *   const html = MidiQOL.dice.controlHTML(MidiQOL.dice.choices([roll]), { max: 2 });   // in your own form
 *   MidiQOL.dice.wire(form);                                                            // keeps it to its max
 */

export interface DieControl { key: string, label: string, group?: string, faces?: number, result?: number }

/** Dice Foundry has an icon for (its roll tooltip's): shown as that die with its result, others as their label */
const ICON_FACES = new Set([4, 6, 8, 10, 12, 20]);

/** The dice as checkboxes, `chosen` ticked; `max` is kept by wireDicePickers */
export function diceControlHTML(dice: DieControl[], { max = 1, chosen = [] as string[] }: { max?: number, chosen?: string[] } = {}): string {
  const groups = [...new Set(dice.map(d => d.group ?? ""))];
  const face = (d: DieControl) => d.faces && ICON_FACES.has(d.faces) && d.result !== undefined
    ? `<span class="midi-qol-die-face d${d.faces}">${d.result}</span>` : foundry.utils.escapeHTML(d.label);
  const box = (d: DieControl) =>
    `<label class="midi-qol-die" data-tooltip="${foundry.utils.escapeHTML(d.label)}"><input type="checkbox" name="dice" value="${d.key}"${chosen.includes(d.key) ? " checked" : ""}> ${face(d)}</label>`;
  const body = groups.map(group => (groups.length > 1 ? `<div class="midi-qol-dice-group">${foundry.utils.escapeHTML(group)}</div>` : "")
    + dice.filter(d => (d.group ?? "") === group).map(box).join("")).join("");
  return `<span class="midi-qol-dice-picker" data-max="${max}">${body}</span>`;
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
