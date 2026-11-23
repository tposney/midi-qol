import { MODULE_ID } from "../../../midi-qol.js";
import { unTimedExecuteAsGM } from "../../GMAction.js";
import { endHide, markHidden, searchHidden, DEFAULT_DC as HIDE_DC, hiddenDC } from "../../lib/hiding.js";
import { stanchDC } from "../../lib/stanch.js";
import { applyStatusCondition, getSpeaker } from "../../utils.js";
import { registerInteraction, type InteractionContext } from "./registry.js";

/*
 * M8d: midi's default interactions, each registered as another module's would be (2024 rules). They use dnd5e's own
 * statuses and rolls: Hide is dnd5e's Hiding status (lib/hiding.ts), Stabilize dnd5e's Stable status with the death
 * saves reset as dnd5e does, Help an effect with midi's advantage flags and dnd5e's source-turn expiry.
 */

const say = (key: string, data?: Record<string, string>) => (data ? game.i18n?.format(`midi-qol.Interactions.${key}`, data) : game.i18n?.localize(`midi-qol.Interactions.${key}`)) ?? key;

type SkillRoll = { total?: number, isSuccess?: boolean } | undefined;
/** dnd5e's skill roll; its dialog as midi's fast-forward settings say for the user rolling (isAutoFastForward) */
async function rollSkill(context: InteractionContext, actor: Actor.Implementation, skill: string, target?: number): Promise<SkillRoll> {
  const roller = actor as unknown as { rollSkill(config: object, dialog?: object): Promise<SkillRoll[] | null> };
  const rolls = await roller.rollSkill({ skill, ...(target ? { target } : {}) });
  return rolls?.[0];
}

async function whisperGM(actor: Actor.Implementation, content: string) {
  await ChatMessage.create({ speaker: getSpeaker(actor), content, whisper: game.users!.filter(u => u.isGM).map(u => u.id) });
}

async function createEffectOn(actor: Actor.Implementation, data: object) {
  if (actor.isOwner) await actor.createEmbeddedDocuments("ActiveEffect", [data as never]);
  else await unTimedExecuteAsGM("createEffects", { actorUuid: actor.uuid, effects: [data], options: {} });
}

/** Hide: a DC 15 Stealth check; on a success dnd5e's Hiding status with the total as the DC to find you */
async function hide(context: InteractionContext) {
  const actor = context.subject.actor!;
  const roll = await rollSkill(context, actor, "ste", HIDE_DC);
  if (!roll) return false;
  if ((roll.total ?? 0) < HIDE_DC) return;
  await markHidden(actor, roll.total!);
}

/** Search: a Perception check against each hidden enemy in sight; those found stop hiding */
async function search(context: InteractionContext) {
  const { subject } = context;
  const actor = subject.actor!;
  const roll = await rollSkill(context, actor, "prc");
  if (!roll) return false;
  const total = roll.total ?? 0;
  const { found, missed } = searchHidden(subject, total);
  for (const t of found) await endHide(t.actor);
  const list = (tokens: TokenDocument.Implementation[]) => tokens.map(t => `${t.name} (DC ${hiddenDC(t.actor) ?? HIDE_DC})`).join(", ");
  if (found.length) await ChatMessage.create({ speaker: getSpeaker(actor), content: `<p>${say("Search.found", { name: actor.name ?? "", found: found.map(t => t.name).join(", ") })}</p>` });
  if (missed.length) await whisperGM(actor, `<p>${say("Search.missed", { name: actor.name ?? "", total: String(total), missed: list(missed) })}</p>`);
}

const atZero = (actor: Actor.Implementation | null | undefined) => {
  const hp = (actor?.system as { attributes?: { hp?: { value?: number } } } | undefined)?.attributes?.hp?.value;
  return hp !== undefined && hp <= 0 && !actor!.statuses.has("dead");
};

/** Stabilize: a DC 10 Medicine check stabilizes a creature at 0 hit points (dnd5e's Stable status, its death saves reset); a wound that can be stanched is checked at its DC instead (lib/stanch.ts closes it) */
async function stabilize(context: InteractionContext) {
  const { subject, target } = context;
  const creature = (target as TokenDocument.Implementation).actor!;
  const woundDC = stanchDC(creature);
  if (woundDC !== undefined) { await rollSkill(context, subject.actor!, "med", woundDC); return; }
  const roll = await rollSkill(context, subject.actor!, "med", 10);
  if (!roll) return false;
  if ((roll.total ?? 0) < 10) return;
  const updates = { "system.attributes.death.success": 0, "system.attributes.death.failure": 0 };
  if (creature.isOwner) await creature.update(updates as never);
  else await unTimedExecuteAsGM("updateActor", { actorUuid: creature.uuid, updates });
  await applyStatusCondition(creature, "stable");
}

const skillLabel = (id: string) => (CONFIG as unknown as { DND5E: { skills: Record<string, { label: string }> } }).DND5E.skills[id]?.label ?? id;
const proficientSkills = (actor: Actor.Implementation) =>
  Object.entries((actor.system as { skills?: Record<string, { value?: number }> }).skills ?? {}).filter(([, s]) => (s.value ?? 0) >= 1).map(([id]) => id);

function helpEffect(helper: Actor.Implementation, name: string, changes: object[], specialDuration: string[]) {
  return {
    name, img: "icons/svg/upgrade.svg", origin: helper.uuid, transfer: false,
    duration: { expiry: "sourceStart" },
    system: { changes },
    flags: { dae: { specialDuration }, [MODULE_ID]: { interaction: "help" } }
  };
}

/** Help with a check: one of your skill proficiencies; the ally's next check with it has advantage, until your next turn */
async function helpCheck({ subject, target, options }: InteractionContext) {
  const helper = subject.actor!, ally = (target as TokenDocument.Implementation).actor!;
  const skills = proficientSkills(helper);
  let skill = typeof options.skill === "string" ? options.skill : undefined;
  if (!skill) {
    const choices = skills.map(id => `<option value="${id}">${skillLabel(id)}</option>`).join("");
    skill = await foundry.applications.api.DialogV2.prompt({
      window: { title: say("Help.check") },
      content: `<div class="form-group"><label>${say("Help.skill")}</label><select name="skill">${choices}</select></div>`,
      ok: { callback: (_event: Event, button: HTMLButtonElement) => (button.form?.elements.namedItem("skill") as HTMLSelectElement | null)?.value }
    }) as string | undefined;
  }
  if (!skill || !skills.includes(skill)) return false;
  await createEffectOn(ally, helpEffect(helper, `${say("Help.name")}: ${skillLabel(skill)}`,
    [{ key: `flags.${MODULE_ID}.advantage.skill.${skill}`, type: "custom", value: "1" }], [`isSkill.${skill}`]));
}

/** Help with an attack: an enemy within 5 ft of you; the next attack roll against it by one of your allies has advantage, until your next turn */
async function helpAttack({ subject, target }: InteractionContext) {
  const helper = subject.actor!, enemy = (target as TokenDocument.Implementation).actor!;
  await createEffectOn(enemy, helpEffect(helper, `${say("Help.name")}: ${helper.name}`,
    [{ key: `flags.${MODULE_ID}.grants.advantage.attack.all`, type: "custom", value: `workflow.actor.uuid !== "${helper.uuid}"` }], ["isAttacked"]));
}

const disposition = (a: TokenDocument.Implementation, b: TokenDocument.Implementation) => a.disposition * b.disposition;

export function registerDefaultInteractions() {
  registerInteraction("midi-qol.hide", { label: "midi-qol.Interactions.Hide.name", hint: "midi-qol.Interactions.Hide.hint", icon: "fa-solid fa-user-ninja",
    targets: "self", cost: { action: 1 }, run: hide, priority: 50 });
  registerInteraction("midi-qol.search", { label: "midi-qol.Interactions.Search.name", hint: "midi-qol.Interactions.Search.hint", icon: "fa-solid fa-magnifying-glass",
    targets: "self", cost: { action: 1 }, run: search, priority: 49 });
  registerInteraction("midi-qol.stabilize", { label: "midi-qol.Interactions.Stabilize.name", hint: "midi-qol.Interactions.Stabilize.hint", icon: "fa-solid fa-kit-medical",
    targets: "creature", range: 5, cost: { action: 1 }, run: stabilize, priority: 40,
    available: ({ target }) => atZero((target as TokenDocument.Implementation).actor) || stanchDC((target as TokenDocument.Implementation).actor) !== undefined ? undefined : say("Stabilize.notDying") });
  registerInteraction("midi-qol.helpCheck", { label: "midi-qol.Interactions.Help.check", hint: "midi-qol.Interactions.Help.checkHint", icon: "fa-solid fa-handshake-angle",
    targets: "creature", cost: { action: 1 }, run: helpCheck, priority: 30,
    available: ({ subject, target }) => disposition(subject, target as TokenDocument.Implementation) === -1 ? say("Help.notAlly")
      : proficientSkills(subject.actor!).length ? undefined : say("Help.noSkill") });
  registerInteraction("midi-qol.helpAttack", { label: "midi-qol.Interactions.Help.attack", hint: "midi-qol.Interactions.Help.attackHint", icon: "fa-solid fa-hand-fist",
    targets: "creature", range: 5, cost: { action: 1 }, run: helpAttack, priority: 29,
    available: ({ subject, target }) => disposition(subject, target as TokenDocument.Implementation) === -1 ? undefined : say("Help.notEnemy") });
}
