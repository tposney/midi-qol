import { i18n } from "../../../midi-qol.js";
import { defineService } from "../../api/services.js";
import { diceControlHTML, wireDicePickers, pickedIn } from "../../lib/dicePicker.js";
import { DialogCountdown } from "../../lib/dialogCountdown.js";
import { beginPlayerWait, type PlayerWait, type WaitChoice, type WaitChoiceSpec } from "../../lib/playerWaits.js";
import { askUser, registerRequestHandler, type IncomingRequest } from "../../lib/requests.js";
import { configSettings } from "../../settings.js";
import { playerForActor, refreshRollTotal } from "../../utils.js";

/*
 * diceReroll (single): rerolling chosen dice of one roll or several (Empowered Spell's damage dice across a spell's
 * damage rolls, a module's "reroll up to N dice"). Who rolled picks the dice: midi's provider asks the roller's user,
 * here or on their client through the request core (the lowest dice suggested, and taken when nobody answers in
 * time); a module can provide its own picker. The reroll keeps the new result, the higher or the lower. A player
 * choosing has the player timeout's countdown, and the GM sees the wait in the player list (reroll the suggested
 * dice or keep the roll for them).
 *
 *   const rolls = await MidiQOL.dice.reroll(workflow.damageRolls, { max: 3, actor: workflow.actor, title: "Empowered Spell" });
 *   const rolls = await MidiQOL.dice.reroll([roll], { max: 1, keep: "higher", allow: die => die.result <= 2 });
 *   const keys = await MidiQOL.dice.pick(rolls, { max: 2 });   // only asked; MidiQOL.dice.rerollChosen(rolls, keys) rerolls
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
  dice: { key: string, label: string, group: string, faces?: number, result?: number }[];
  /** Ticked to start with, and the answer when nobody answers in time */
  suggested: string[];
}

/** What the pick is for: the GM's wait chip is the roller's token and ends with its owner (a workflow) */
export interface PickContext {
  tokenUuid?: string;
  owner?: object;
}

export interface DiceRerollProvider {
  /** The keys of the dice to reroll (no more than `max`), or undefined when the roller declines */
  pick(pick: DicePick, roller?: Actor.Implementation | null, context?: PickContext): Promise<string[] | undefined>;
}

export interface PickOptions {
  max: number;
  title?: string;
  prompt?: string;
  /** Whose roll: their user picks */
  actor?: Actor.Implementation | null;
  /** Which dice may be picked (default: all that count) */
  allow?: (die: DieChoice) => boolean;
  /** The roller's token (the GM's wait chip) */
  tokenUuid?: string;
  /** What waits for the pick (a workflow): the GM's wait chip ends with it */
  owner?: object;
}

export interface RerollOptions extends PickOptions {
  keep?: "new" | "higher" | "lower";
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
  return `<p>${foundry.utils.escapeHTML(pick.prompt)}</p>${diceControlHTML(pick.dice, { max: pick.max, chosen: pick.suggested })}`;
}

interface PickHere {
  /** Another client asked (its countdown, its settling) */
  request?: IncomingRequest;
  /** Asked here: the countdown's seconds, the suggested dice taken when it runs out */
  seconds?: number;
  /** Asked here of a player: the GM's wait chip, whose answer closes the picker */
  wait?: PlayerWait<string[]>;
}

/** The picker on this client: the keys, or undefined when declined */
async function pickHere(pick: DicePick, { request, seconds = 0, wait }: PickHere = {}): Promise<string[] | undefined> {
  let picked: string[] | undefined;
  let dialog: foundry.applications.api.DialogV2 | undefined;
  let expired = false;
  const countdown = request ? request.countdown()
    : seconds > 0 ? new DialogCountdown({ seconds, onExpire: () => { expired = true; void dialog?.close(); } }) : undefined;
  void wait?.settled.then(() => { void dialog?.close(); });
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
      dialog = app;
      wireDicePickers(app.element);
      countdown?.attach(app.element);
      request?.onSettled(() => { void app.close(); });
    },
    close: () => { countdown?.stop(); }
  });
  countdown?.stop();
  // The GM answered for the player: theirs wins
  if (wait?.answeredForPlayer) return (await wait.settled).value;
  wait?.end();
  if (expired) return pick.suggested;
  if (request && (request.settledHow || !await request.claim())) return undefined;
  return picked;
}

export const DICE_REQUEST = "midi-qol.chooseDice";

/** What the GM can answer for a player from the player list: the suggested dice (the default), or none */
const gmChoices = (pick: DicePick): Partial<Record<WaitChoice, WaitChoiceSpec<string[]>>> => ({
  suggested: { label: "midi-qol.DiceReroll.Suggested", value: () => pick.suggested },
  skip: () => []
});

/** midi's picker: asked of the roller's user (a player owning the creature, else the GM), here or on their client */
const midiPicker: DiceRerollProvider = {
  async pick(pick, roller, context) {
    const user = (roller ? playerForActor(roller) as User.Implementation | undefined : undefined) ?? game.users?.activeGM ?? undefined;
    // A player's pick holds the use up: the player timeout's countdown (a GM's has none)
    const timeoutMs = user && !user.isGM ? (configSettings.playerSaveTimeout ?? 0) * 1000 : 0;
    const spec = { kind: "dice", actorUuid: roller?.uuid ?? undefined, tokenUuid: context?.tokenUuid, label: pick.title, owner: context?.owner };
    if (!user || user.isSelf || !user.active) {
      const wait = user?.isSelf && !user.isGM ? beginPlayerWait<string[]>({ ...spec, userId: user.id!, choices: gmChoices(pick) }) : undefined;
      return pickHere(pick, { seconds: timeoutMs / 1000, wait });
    }
    return askUser<string[] | undefined>(user, {
      ...spec, type: DICE_REQUEST, data: pick, timeoutMs, fallback: () => pick.suggested, gmChoices: gmChoices(pick)
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

/** Ask the roller which dice (up to `max`) of the rolls to reroll: the keys (none when declined) */
export async function pickDice(rolls: Roll | Roll[], options: PickOptions): Promise<string[]> {
  const list = Array.isArray(rolls) ? rolls : [rolls];
  const choices = diceChoices(list).filter(d => options.allow?.(d) ?? true);
  const max = Math.max(0, Math.floor(options.max));
  if (!choices.length || !max) return [];
  const pick: DicePick = {
    title: options.title ?? i18n("midi-qol.DiceReroll.Title"),
    prompt: options.prompt ?? i18n("midi-qol.DiceReroll.Prompt").replace("{max}", String(max)),
    max,
    dice: choices.map(d => ({ key: d.key, label: d.label, group: d.group, faces: d.faces, result: d.result })),
    suggested: suggestLowChoices(choices, max)
  };
  const keys = await (diceRerollService.get() ?? midiPicker).pick(pick, options.actor, { tokenUuid: options.tokenUuid, owner: options.owner });
  return allowedKeys(choices, keys, max);
}

const allowedKeys = (choices: DieChoice[], keys: string[] | undefined, max: number) => {
  const allowed = new Set(choices.map(d => d.key));
  return (keys ?? []).filter(key => allowed.has(key)).slice(0, max);
};

/** Ask the roller which dice (up to `max`) to reroll, then reroll them: the rolls, changed or as they were */
export async function rerollDice(rolls: Roll[], options: RerollOptions): Promise<Roll[]> {
  const chosen = options.picked
    ? allowedKeys(diceChoices(rolls).filter(d => options.allow?.(d) ?? true), options.picked, Math.max(0, Math.floor(options.max)))
    : await pickDice(rolls, options);
  return chosen.length ? rerollChosen(rolls, chosen, options.keep) : rolls;
}

export function defineDiceRerollService() {
  diceRerollService = defineService<DiceRerollProvider>("diceReroll", {
    kind: "single",
    description: "Picks which dice of a roll (or a use's damage rolls) to reroll: the roller's user, here or on their client"
  });
  diceRerollService.register("midi-qol", midiPicker, { label: "Midi-QOL", priority: 0 });
  registerRequestHandler(DICE_REQUEST, (data: DicePick, request: IncomingRequest) => pickHere(data, { request }));
}
