import { error } from "../midi-qol.js";
import { challengeModeArmorOptions } from "../module/settings.js";
import type { Workflow } from "../module/Workflow.js";
import { declareRule, ruleId, ruleOn, ruleValue } from "./registry.js";

/*
 * Optional rule challengeModeArmor (a policy of midi's armour, hit check and damage): a creature has an evasion class
 * (EC) and an armour class (AR). An attack that beats the AC hits; one between EC and AC is a glancing hit: in
 * "challenge" mode the armour reduces its damage by AR, in "scale" modes its damage is scaled by how far into the
 * armour it got. midi's armour preparation, hit check and damage ask this rule. (Later: glancing hits as an
 * attackOutcome answer, rather than a policy of the hit check.)
 */

export const CHALLENGE_ARMOR_RULE = ruleId("challengeModeArmor");

/** "none", "challenge", "scale" or "scaleNoAR" */
export const challengeArmorMode = (): string => {
  const mode = ruleValue("challengeModeArmor");
  return typeof mode === "string" && mode ? mode : "none";
};
/** The rule is on: hits are checked against EC and AC */
export const challengeArmorOn = () => ruleOn("challengeModeArmor");
/** Glancing hits scale their damage ("scale", "scaleNoAR") */
export const glancingHitsScale = () => ["scale", "scaleNoAR"].includes(challengeArmorMode());

/** A glancing hit's damage scale: how far between EC and AC the attack got, in tenths */
export function glancingScale(attackTotal: number, ec: number, ar: number): number {
  return Math.floor((attackTotal - ec + 1) / (ar + 1) * 10) / 10;
}

/** A glancing hit's effect on a target's damage: a scale ("scale" modes) or the armour's reduction ("challenge") */
export function glancingDamage(workflow: Workflow, tokenDocument: TokenDocument.Implementation, actor: Actor.Implementation): { scale: number, ar: number } {
  if (!workflow.hitTargetsEC?.has(tokenDocument)) return { scale: 1, ar: 0 };
  if (glancingHitsScale() && workflow.attackRoll) return { scale: workflow.challengeModeScale?.[tokenDocument.uuid ?? "dummy"] ?? 1, ar: 0 };
  // @ts-expect-error no dnd5e-types
  if (challengeArmorMode() === "challenge") return { scale: 1, ar: actor.system.attributes.ac.AR ?? 0 };
  return { scale: 1, ar: 0 };
}

/** An actor's EC and AR from its armour (midi's derived-data preparation calls this) */
export function prepareChallengeArmor(actor: Actor.Implementation) {
  if (!challengeArmorOn()) return;

  // @ts-expect-error no dnd5e-types
  const armorDetails = actor.system.attributes.ac ?? {};
  const ac = armorDetails?.value ?? 10;
  const equippedArmor = armorDetails.equippedArmor;
  // dnd5e's values for AC, magical bonus included unless antimagic: the item's own armor.value gets it only later
  // in preparation (dnd5e 6.1)
  const equippedArmorAC = equippedArmor ? (armorDetails.armor ?? equippedArmor.system.armor.value) : 10;
  let armorAC = equippedArmorAC;
  const equippedShield = armorDetails.equippedShield;
  const shieldAC = equippedShield ? (armorDetails.shield ?? equippedShield.system.armor.value) : 0;

  if (challengeArmorMode() !== "challenge") {
    switch (armorDetails.calc) {
      // @ts-expect-error no dnd5e-types
      case 'flat': armorAC = (ac.flat ?? 10) - actor.system.abilities.dex.mod; break;
      case 'draconic': armorAC = 13; break;
      // @ts-expect-error no dnd5e-types
      case 'natural': armorAC = (armorDetails.value ?? 10) - actor.system.abilities.dex.mod; break;
      case 'custom': armorAC = equippedArmorAC; break;
      case 'mage': armorAC = 13; break; // perhaps this should be 10 if mage armor is magic bonus
      case 'unarmoredMonk': armorAC = 10; break;
      case 'unarmoredBarb': armorAC = 10; break;
      default: armorAC = equippedArmorAC; break;
    };
    const armorReduction = armorAC - 10 + shieldAC;
    const ec = ac - armorReduction;
    // @ts-expect-error no dnd5e-types
    actor.system.attributes.ac.EC = ec;
    // @ts-expect-error no dnd5e-types
    actor.system.attributes.ac.AR = armorReduction;
  } else {
    // @ts-expect-error no dnd5e-types
    if (!actor.system.abilities) {
      error("challenge mode armor failed to find abilities");
      error(actor);
      return;
    }
    // dnd5e's Dex modifier as the armor allows it (none for heavy, capped for medium)
    // @ts-expect-error no dnd5e-types
    const dexMod = armorDetails.dex ?? actor.system.abilities.dex.mod;
    // @ts-expect-error no dnd5e-types
    actor.system.attributes.ac.EC = 10 + dexMod + shieldAC;
    // @ts-expect-error no dnd5e-types
    actor.system.attributes.ac.AR = ac - 10 - dexMod;
  }
}

export function registerChallengeModeArmorRule() {
  declareRule({ id: CHALLENGE_ARMOR_RULE, setting: "challengeModeArmor", service: "policy", label: "Challenge mode armour (evasion and armour classes, glancing hits)",
    settings: [{ key: "challengeModeArmor", type: "string", label: "midi-qol.ChallengeModeArmor.Name", hint: "midi-qol.ChallengeModeArmor.Hint", choices: challengeModeArmorOptions, default: "none" }] });
  // The armour config sheet shows EC and AR
  //@ts-expect-error not in fvtt-types
  Hooks.on("renderArmorClassConfig", (app: { document?: Actor.Implementation }, html: HTMLElement) => {
    if (!challengeArmorOn()) return;
    // @ts-expect-error no dnd5e-types
    const ac = app.document?.system?.attributes?.ac;
    const card = html.querySelector("fieldset.card");
    if (!ac || !card) return;
    card.querySelectorAll("[data-midi-challenge-armor]").forEach(el => el.remove());
    for (const [label, value] of [["EC", ac.EC], ["AR", ac.AR]]) {
      const row = document.createElement("div");
      row.classList.add("form-group");
      row.dataset.midiChallengeArmor = label;
      row.innerHTML = `<label>${label}</label><div class="form-fields">${value ?? ""}</div>`;
      card.append(row);
    }
  });
}
