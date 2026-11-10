/**
 * MidiQOL.contestedRoll, and an example of a card note drawn by its own renderer, written only against the card note
 * API as another module would be (cardNotes.ts): the note's data says who rolls what, its two checks are its messages
 * (roles source/target), and it is drawn per viewer as each check, or who is still to roll, then the result from the
 * checks' current totals. On a card that can't draw notes (stored markup) the note is shown on its own in the log.
 */

import { trackPlayerWait } from "./playerWaits.js";
import { error, GameSystemConfig, i18n, i18nFormat, MODULE_ID } from "../../midi-qol.js";
import { SaveDetails, TokenOrDocument } from "../../globals.js";
import { CardNoteRenderContext } from "../ChatClasses/CardNoteMessage.js";
import { preferredActiveGM, socketlibSocket } from "../GMAction.js";
import { getCachedDocument, getToken, getTokenDocument, playerFor, rollModeToMessageMode, validRollAbility } from "../utils.js";
import { addCardNote, registerCardNoteRenderer, renderLinkedMessage, visibleRollTotal } from "./cardNotes.js";
import { tokenName } from "./tokenNames.js";
import { configSettings } from "../settings.js";

export const CONTEST_NOTE_KIND = "midi-qol.contest";

export type ContestNoteData = {
  flavor: string;
  sides: Record<"source" | "target", { name: string, uuid?: string, label: string }>;
  /** A roll was never made. */
  incomplete?: boolean;
};

/** Mark a summarised roll as dnd5e marks a roll against a DC, so it takes dnd5e's success/failure colours. */
function markRoll(html: string, outcome: "success" | "failure" | undefined): string {
  if (!outcome || !html) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("button.dice-roll, .dice-total").forEach(el => el.classList.add(outcome));
  return template.innerHTML;
}

/** A side's name as this viewer may see it. */
function sideName(side: { name: string, uuid?: string }): string {
  return side.uuid ? tokenName(side.uuid, side.name) : side.name;
}

async function renderContest({ data, messages }: CardNoteRenderContext): Promise<string> {
  const { flavor, sides, incomplete } = data as ContestNoteData;
  const escape = foundry.utils.escapeHTML;
  const byRole = new Map(messages.map(m => [(m.getFlag(MODULE_ID, "cardNote") as { role?: string } | undefined)?.role, m]));
  const source = byRole.get("source"), target = byRole.get("target");
  const total = (message: ChatMessage.Implementation | undefined) => message?.rolls?.[0]?.total;
  const difference = source && target ? (total(source) ?? NaN) - (total(target) ?? NaN) : NaN;
  const outcome = isNaN(difference) ? undefined : difference > 0 ? "success" : difference < 0 ? "failure" : "tie";
  // midi's highlighting settings, as for other rolls: critical-attacks-only leaves success/failure unmarked.
  const highlight = configSettings.highlightSuccess && !configSettings.highLightCriticalAttackOnly;
  const rollOutcome = (role: "source" | "target") => !highlight || outcome === "tie" || !outcome ? undefined
    : (outcome === "success") === (role === "source") ? "success" : "failure";

  const parts: string[] = [];
  if (sides) parts.push(`<div class="midi-qol-contest-heading"><strong>${escape(flavor)}</strong>`
    + ` <span>${escape(sides.source.label)} ${i18n("midi-qol.versus")} ${escape(sides.target.label)}</span></div>`);
  for (const role of ["source", "target"] as const) {
    const message = role === "source" ? source : target;
    if (message) parts.push(markRoll(await renderLinkedMessage(message), rollOutcome(role)));
    else if (!incomplete && sides?.[role]) {
      parts.push(`<div class="midi-qol-contest-waiting"><i class="fa-solid fa-hourglass-half"></i> `
        + `${escape(i18nFormat("midi-qol.ContestWaiting", { name: sideName(sides[role]), roll: sides[role].label }))}</div>`);
    }
  }
  if (source && target) {
    // A total this viewer can't see on its own message (private, hidden or obscured) is ?? here too, and the result isn't coloured.
    const seen = [visibleRollTotal(source), visibleRollTotal(target)];
    const shown = (value: number | undefined) => value ?? "??";
    const coloured = highlight && seen.every(value => value !== undefined);
    const icon = { success: "fa-check", failure: "fa-xmark", tie: "fa-equals" }[outcome ?? "tie"];
    const label = outcome ? i18n({ success: "midi-qol.save-success", failure: "midi-qol.save-failure", tie: "midi-qol.save-drawn" }[outcome]) : "";
    parts.push(`<div class="midi-qol-contest-result ${coloured ? outcome ?? "" : ""}"><i class="fa-solid ${icon}"></i>`
      + ` <span>${escape(flavor)} ${label}</span><span class="midi-qol-contest-totals">${shown(seen[0])} ${i18n("midi-qol.versus")} ${shown(seen[1])}</span></div>`);
  } else if (incomplete) {
    parts.push(`<div class="midi-qol-contest-result incomplete"><i class="fa-solid fa-ban"></i> `
      + `<span>${escape(i18nFormat("midi-qol.ContestNoResult", { flavor }))}</span></div>`);
  }
  return `<div class="midi-qol-contest">${parts.join("")}</div>`;
}

export function setupContestNote() {
  registerCardNoteRenderer(CONTEST_NOTE_KIND, renderContest);
}

export async function contestedRoll(data: {
  source: { rollType: string, ability: string, token: TokenOrDocument | string, rollOptions: any },
  target: { rollType: string, ability: string, token: TokenOrDocument | string, rollOptions: any },
  displayResults: boolean,
  itemCardUuid: string,
  flavor: string,
  rollOptions: any,
  success: (results) => {}, failure: (results) => {}, drawn: (results) => {}
}): Promise<{ result: number | undefined, rolls: any[] }> {
  const source = data.source;
  const target = data.target;
  const sourceToken = getToken(source?.token);
  const targetToken = getToken(target?.token);
  const { success, failure, drawn, displayResults, itemCardUuid, flavor } = data;

  let canProceed = true;
  if (!source || !target || !sourceToken || !targetToken || !source.rollType || !target.rollType || !source.ability || !target.ability || !validRollAbility(source.rollType, source.ability) || !validRollAbility(target.rollType, target.ability)) {
    error(`contestRoll | source[${sourceToken?.name}], target[${targetToken?.name}], source.rollType[${source.rollType}], target.rollType[${target?.rollType}], source.ability[${source.ability}], target.ability[${target?.ability}] must all be defined`);
    canProceed = false;
  }
  if (!["test", "abil", "save", "skill"].includes(source?.rollType ?? "")) {
    error(`contestedRoll | sourceRollType must be one of test/abil/skill/save not ${source.rollType}`);
    canProceed = false;
  }
  if (!["test", "abil", "save", "skill"].includes(target?.rollType ?? "")) {
    error(`contestedRoll | target.rollType must be one of test/abil/skill/save not ${target.rollType}`);
    canProceed = false;
  }
  if (!canProceed) return { result: undefined, rolls: [] }

  const sourceDocument = sourceToken!.document;
  const targetDocument = targetToken!.document;

  source.ability = validRollAbility(source.rollType, source.ability) ?? "";
  target.ability = validRollAbility(target.rollType, target.ability) ?? "";

  let player1 = playerFor(sourceToken);
  if (!player1?.active) player1 = preferredActiveGM();
  let player2 = playerFor(targetToken);
  if (!player2?.active) player2 = preferredActiveGM();
  if (!player1 || !player2) return { result: undefined, rolls: [] };
  // Normalize roll types for SaveDetails
  const normalizeRollType = (rt: string): string => {
    if (rt === "abil" || rt === "test") return "check";
    return rt.trim();
  };

  // With a card the contest is a card note: who it waits for, the two checks and the result, drawn on the card (or on
  // its own in the log for a card with stored markup).
  const card = itemCardUuid ? getCachedDocument(itemCardUuid) : undefined;
  const onCard = displayResults !== false && card instanceof ChatMessage;
  const rollLabel = (rollType: string, ability: string): string => rollType === "skill"
    ? GameSystemConfig.skills[ability]?.label ?? ability
    : `${GameSystemConfig.abilities[ability]?.label ?? ability} ${i18n(rollType === "save" ? "DND5E.SavingThrow" : "DND5E.ActionAbil")}`;
  const contestFlavor = flavor ?? i18n("midi-qol.ContestedRoll");
  const contestData: ContestNoteData = {
    flavor: contestFlavor,
    sides: {
      source: { name: sourceToken?.name ?? "", uuid: getTokenDocument(sourceToken)?.uuid, label: rollLabel(source.rollType, source.ability) },
      target: { name: targetToken?.name ?? "", uuid: getTokenDocument(targetToken)?.uuid, label: rollLabel(target.rollType, target.ability) }
    }
  };
  const note = onCard ? await addCardNote(card, foundry.utils.escapeHTML(contestFlavor), {
    anchor: "saves", position: "after", kind: CONTEST_NOTE_KIND, data: contestData
  }) : undefined;

  // Build SaveDetails for each participant
  const buildContestedSaveDetails = (
    actorUuid: string,
    rollType: string,
    abilityOrSkill: string,
    role: "source" | "target",
    rollOptions: { advantage?: boolean, disadvantage?: boolean }
  ): SaveDetails => {
    const normalizedType = normalizeRollType(rollType);
    const isSkill = rollType === "skill";
    return {
      actorUuid,
      advantage: rollOptions.advantage,
      disadvantage: rollOptions.disadvantage,
      modifierTracker: undefined,
      isFriendly: false,
      isMagicSave: false,
      isConcentrationCheck: undefined,
      rollDC: 0,
      saveItemUuid: "",
      workflowId: "",
      // A contest drawn on its card rolls its checks for its note, not for the card's activity.
      itemCardUuid: note?.uuid ?? itemCardUuid ?? "",
      workflowOptions: {},
      rollType: normalizedType,
      rollAbilities: isSkill ? [] : [abilityOrSkill.trim()],
      rollSkills: isSkill ? [abilityOrSkill.trim()] : [],
      rollTools: [],
      itemId: "",
      cardNote: note ? { role } : undefined
    };
  };

  // Options for both rolls, then each side's own: advantage, disadvantage, fastForward, rollMode.
  const sourceRollOptions = { ...(data.rollOptions ?? {}), ...(source.rollOptions ?? {}) };
  const targetRollOptions = { ...(data.rollOptions ?? {}), ...(target.rollOptions ?? {}) };
  const sourceSaveDetails = buildContestedSaveDetails(
    sourceDocument?.actor?.uuid ?? "",
    source.rollType,
    source.ability,
    "source",
    sourceRollOptions
  );
  const targetSaveDetails = buildContestedSaveDetails(
    targetDocument?.actor?.uuid ?? "",
    target.rollType,
    target.ability,
    "target",
    targetRollOptions
  );

  // The GM can roll for a player who hasn't (the player list): rolled for them, or on the GM's screen
  const contestRoll = (user: User.Implementation, saveDetails: typeof sourceSaveDetails, rollOptions: typeof sourceRollOptions, actorUuid?: string, tokenUuid?: string) => {
    const roll = (asUser: string, fastForward: boolean | undefined, mode?: "advantage" | "disadvantage") => socketlibSocket.executeAsUser("rollAbility", asUser, {
      saveDetails: mode ? { ...saveDetails, advantage: mode === "advantage", disadvantage: mode === "disadvantage" } : saveDetails,
      // Rolled by a GM for the player: shown to them as their own roll would have been
      displayOptions: { chatMessage: true, fastForward, rollMode: rollModeToMessageMode(rollOptions.rollMode), forUserId: asUser !== user.id ? user.id : undefined }
    });
    const gm = () => game.users?.activeGM?.id ?? user.id!;
    return trackPlayerWait({
      kind: "contest", userId: user.id!, actorUuid, tokenUuid,
      label: i18nFormat("midi-qol.PlayerWaits.ContestLabel", { flavor: flavor ?? i18n("midi-qol.ContestedRoll") }),
      choices: {
        roll: { label: "midi-qol.PlayerWaits.Choice.normal", value: () => roll(gm(), true) },
        advantage: { label: "midi-qol.PlayerWaits.Choice.advantage", value: () => roll(gm(), true, "advantage") },
        disadvantage: { label: "midi-qol.PlayerWaits.Choice.disadvantage", value: () => roll(gm(), true, "disadvantage") },
        gmRoll: () => roll(gm(), false)
      }
    }, () => roll(user.id!, rollOptions.fastForward));
  };
  const resultPromises = [
    contestRoll(player1, sourceSaveDetails, sourceRollOptions, sourceDocument?.actor?.uuid, sourceDocument?.uuid),
    contestRoll(player2, targetSaveDetails, targetRollOptions, targetDocument?.actor?.uuid, targetDocument?.uuid)
  ];

  let results = await Promise.all(resultPromises);
  let roll1 = results[0];
  let roll2 = results[1];
  if (roll1 instanceof Array) roll1 = roll1[0];
  if (roll2 instanceof Array) roll2 = roll2[0];
  let result: number | undefined = roll1?.total - roll2?.total;
  if (isNaN(result)) result = undefined;
  if (note && result === undefined) await note.update({ "system.data.incomplete": true } as ChatMessage.UpdateData);
  // Without a card the result is a message of its own.
  if (displayResults !== false && !note) {
    let resultString: string;
    if (result === undefined) resultString = "";
    else resultString = result > 0 ? i18n("midi-qol.save-success") : result < 0 ? i18n("midi-qol.save-failure") : result === 0 ? i18n("midi-qol.save-drawn") : "no result"
    const skippedString = i18n("midi-qol.Skipped");
    const content = `${flavor ?? i18n("midi-qol.ContestedRoll")} ${resultString} ${roll1.total ?? skippedString} ${i18n("midi-qol.versus")} ${roll2.total ?? skippedString}`;
    ChatMessage.create({ content: `<p>${content}</p>`, speaker: ChatMessage.getSpeaker({ token: sourceToken }) });
  }

  const rollsToReturn = [roll1, roll2];
  if (result === undefined) return { result, rolls: rollsToReturn };
  if (result > 0 && success) success(rollsToReturn);
  else if (result < 0 && failure) failure(rollsToReturn);
  else if (result === 0 && drawn) drawn(rollsToReturn)
  return { result, rolls: rollsToReturn };
}
