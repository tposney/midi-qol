import { i18n } from "../../../midi-qol.js";
import { defineService } from "../../api/services.js";
import { wireDicePickers, pickedIn } from "../../lib/dicePicker.js";
import { askUser, registerRequestHandler, type IncomingRequest } from "../../lib/requests.js";
import { configSettings } from "../../settings.js";
import { playerForActor, refreshRollTotal } from "../../utils.js";

/*
 * diceReroll (single): rerolling chosen dice of one roll or several (Empowered Spell's damage dice across a spell's
 * damage rolls, a module's "reroll up to N dice"). Who rolled picks the dice: midi's provider asks the roller's user,
 * here or on their client through the request core (the lowest dice suggested, and taken when nobody answers in
 * time); a module can provide its own picker. The reroll keeps the new result, the higher or the lower.
 *
 *   const rolls = await MidiQOL.dice.reroll(workflow.damageRolls, { max: 3, actor: workflow.actor, title: "Empowered Spell" });
 *   const rolls = await MidiQOL.dice.reroll([roll], { max: 1, keep: "higher", allow: die => die.result <= 2 });
 *
 * A die is keyed "roll-die-result": the roll's index in the list, the term's index in roll.dice and the result's index
 * in that term, which stay valid on a copy.
 */

export interface DieChoice {
  key: string;
  roll: number;
  die: number;
  index: number;
  faces: number;
  result: number;
  label: string;
  /** What the die belongs to, for grouping (its damage type, else the roll's formula) */
  group: string;
}

/** What the picker is asked: plain data, sent to another client as it is */
export interface DicePick {
  title: string;
  prompt: string;
  max: number;
  dice: { key: string, label: string, group: string }[];
  /** Ticked to start with, and the answer when nobody answers in time */
  suggested: string[];
}

export interface DiceRerollProvider {
  /** The keys of the dice to reroll (no more than `max`), or undefined when the roller declines */
  pick(pick: DicePick, roller?: Actor.Implementation | null): Promise<string[] | undefined>;
}

export interface RerollOptions {
  max: number;
  keep?: "new" | "higher" | "lower";
  title?: string;
  prompt?: string;
  /** Whose roll: their user picks */
  actor?: Actor.Implementation | null;
  /** Which dice may be picked (default: all that count) */
  allow?: (die: DieChoice) => boolean;
  /** Already picked (no one is asked) */
  picked?: string[];
}

declare module "../../api/services.js" {
  interface MidiServices { diceReroll: DiceRerollProvider }
}

export let diceRerollService: ReturnType<typeof defineService<DiceRerollProvider>>;

function groupOf(roll: Roll, rollIndex: number): string {
  const type = (roll.options as { type?: string }).type;
  const damageTypes = CONFIG.DND5E.damageTypes as Record<string, { label?: string } | undefined>;
  const healingTypes = CONFIG.DND5E.healingTypes as Record<string, { label?: string } | undefined>;
  const label = type ? damageTypes[type]?.label ?? healingTypes[type]?.label : undefined;
  return label ? i18n(label) : `${roll.formula}${rollIndex ? ` (${rollIndex + 1})` : ""}`;
}

/** The dice that count (active, not discarded) in the rolls */
export function diceChoices(rolls: Roll[]): DieChoice[] {
  return rolls.flatMap((roll, r) => roll.dice.flatMap((term, die) => term.results.flatMap((result, index) => result.active && !result.discarded
    ? [{ key: `${r}-${die}-${index}`, roll: r, die, index, faces: term.faces ?? 0, result: result.result, label: `d${term.faces}: ${result.result}`, group: groupOf(roll, r) }]
    : [])));
}

/** The dice worth rerolling: below their average, lowest first, up to `count` */
export function suggestLowChoices(choices: DieChoice[], count: number): string[] {
  return choices.filter(d => d.result < (d.faces + 1) / 2)
    .sort((a, b) => a.result / a.faces - b.result / b.faces).slice(0, Math.max(0, count)).map(d => d.key);
}

/** The picker's checkboxes, grouped (a heading per damage type when there are several) */
function pickerHTML(pick: DicePick): string {
  const groups = [...new Set(pick.dice.map(d => d.group))];
  const box = (d: DicePick["dice"][number]) =>
    `<label class="midi-qol-die"><input type="checkbox" name="dice" value="${d.key}"${pick.suggested.includes(d.key) ? " checked" : ""}> ${foundry.utils.escapeHTML(d.label)}</label>`;
  const body = groups.map(group => `${groups.length > 1 ? `<div class="midi-qol-dice-group">${foundry.utils.escapeHTML(group)}</div>` : ""}`
    + pick.dice.filter(d => d.group === group).map(box).join("")).join("");
  return `<p>${foundry.utils.escapeHTML(pick.prompt)}</p><span class="midi-qol-dice-picker" data-max="${pick.max}">${body}</span>`;
}

/** The picker on this client (a request's, when another client asked): the keys, or undefined when declined */
async function pickHere(pick: DicePick, request?: IncomingRequest): Promise<string[] | undefined> {
  let picked: string[] | undefined;
  await foundry.applications.api.DialogV2.wait({
    window: { title: pick.title },
    content: pickerHTML(pick),
    buttons: [
      { action: "ok", label: i18n("midi-qol.DiceReroll.Reroll"), default: true, callback: (_event: Event, button: HTMLButtonElement) => {
        const picker = button.form?.querySelector<HTMLElement>(".midi-qol-dice-picker");
        picked = picker ? pickedIn(picker) : [];
      } },
      { action: "cancel", label: i18n("midi-qol.DiceReroll.Keep") }
    ],
    rejectClose: false,
    render: (_event: Event, app: foundry.applications.api.DialogV2) => {
      wireDicePickers(app.element);
      request?.onSettled(() => { void app.close(); });
    }
  });
  if (request && (request.settledHow || !await request.claim())) return undefined;
  return picked;
}

export const DICE_REQUEST = "midi-qol.chooseDice";

/** midi's picker: asked of the roller's user (a player owning the creature, else the GM), here or on their client */
const midiPicker: DiceRerollProvider = {
  async pick(pick, roller) {
    const user = (roller ? playerForActor(roller) as User.Implementation | undefined : undefined) ?? game.users?.activeGM ?? undefined;
    if (!user || user.isSelf || !user.active) return pickHere(pick);
    return askUser<string[] | undefined>(user, {
      type: DICE_REQUEST, data: pick, kind: "dice", actorUuid: roller?.uuid ?? undefined, label: pick.title,
      timeoutMs: (configSettings.playerSaveTimeout ?? 0) * 1000, fallback: () => pick.suggested
    }).settled.then(settled => settled.value, () => pick.suggested);
  }
};

/** The rolls with the dice of `keys` rerolled (copies; the others returned as they are), keeping the new, higher or lower */
export async function rerollChosen(rolls: Roll[], keys: string[], keep: RerollOptions["keep"] = "new"): Promise<Roll[]> {
  const copies = new Map<number, Roll>();
  const copyOf = (r: number) => {
    let copy = copies.get(r);
    if (!copy) copies.set(r, copy = (rolls[r].constructor as typeof Roll).fromData(JSON.parse(JSON.stringify(rolls[r]))) as Roll);
    return copy;
  };
  for (const key of keys) {
    const [r, die, index] = key.split("-").map(Number);
    if (!rolls[r]) continue;
    const term = copyOf(r).dice[die];
    const old = term?.results[index];
    if (!term || !old?.active || old.discarded) continue;
    const fresh = (await new Roll(`1d${term.faces}`).evaluate()).total ?? 1;
    const takeNew = keep === "new" || (keep === "higher" && fresh > old.result) || (keep === "lower" && fresh < old.result);
    old.rerolled = true;
    if (takeNew) {
      old.active = false;
      term.results.push({ result: fresh, active: true });
    } else term.results.push({ result: fresh, active: false, discarded: true });
  }
  return rolls.map((roll, r) => copies.has(r) ? refreshRollTotal(copies.get(r)!) : roll);
}

/** Ask the roller which dice (up to `max`) to reroll, then reroll them: the rolls, changed or as they were */
export async function rerollDice(rolls: Roll[], options: RerollOptions): Promise<Roll[]> {
  const choices = diceChoices(rolls).filter(d => options.allow?.(d) ?? true);
  const max = Math.max(0, Math.floor(options.max));
  if (!choices.length || !max) return rolls;
  let keys = options.picked;
  if (!keys) {
    const pick: DicePick = {
      title: options.title ?? i18n("midi-qol.DiceReroll.Title"),
      prompt: options.prompt ?? i18n("midi-qol.DiceReroll.Prompt").replace("{max}", String(max)),
      max,
      dice: choices.map(d => ({ key: d.key, label: d.label, group: d.group })),
      suggested: suggestLowChoices(choices, max)
    };
    keys = await (diceRerollService.get() ?? midiPicker).pick(pick, options.actor);
  }
  const allowed = new Set(choices.map(d => d.key));
  const chosen = (keys ?? []).filter(key => allowed.has(key)).slice(0, max);
  return chosen.length ? rerollChosen(rolls, chosen, options.keep) : rolls;
}

export function defineDiceRerollService() {
  diceRerollService = defineService<DiceRerollProvider>("diceReroll", {
    kind: "single",
    description: "Picks which dice of a roll (or a use's damage rolls) to reroll: the roller's user, here or on their client"
  });
  diceRerollService.register("midi-qol", midiPicker, { label: "Midi-QOL", priority: 0 });
  registerRequestHandler(DICE_REQUEST, (data: DicePick, request: IncomingRequest) => pickHere(data, request));
}
