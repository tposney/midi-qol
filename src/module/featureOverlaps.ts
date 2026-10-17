import { MODULE_ID, ceInterface, i18n } from "../midi-qol.js";
import { checkMechanic, configSettings, safeGetGameSetting, safeSetGameSetting } from "./settings.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";

/** Jobs more than one system can do (e.g. marking a creature wounded): the GM is told when several are on. */
interface OverlapSide {
  /** midi-qol, the system id or a module id. */
  source: string;
  /** i18n key naming the setting that switches it on. */
  setting: string;
  /** Settings ("namespace.key") whose change re-checks the overlap. */
  keys: string[];
  active(): boolean;
}

interface FeatureOverlap {
  id: string;
  sides: OverlapSide[];
  /** Resolves the conflict in favour of midi; offered as TroubleShooter's Auto Fix. */
  fix?: () => Promise<void>;
}

export interface ActiveOverlap {
  id: string;
  feature: string;
  advice: string;
  sides: { source: string, sourceTitle: string, setting: string }[];
  /** Changes when the systems involved change, so a dismissed overlap comes back. */
  signature: string;
  acknowledged: boolean;
  fix?: () => Promise<void>;
}

// MODULE_ID is not yet set while this module is evaluated (circular import with midi-qol.ts).
const MIDI = "midi-qol";

/** Side standing for the status list itself, named after Custom D&D 5e when its Conditions config builds it. */
const STATUS_EFFECTS = "statusEffects";

const customDnd5e = (key: string) => game.modules.get("custom-dnd5e")?.active ? safeGetGameSetting("custom-dnd5e", key) : undefined;

/** A status midi is set to use that no longer exists (e.g. hidden in Custom D&D 5e's Conditions config). */
const statusMissing = (id: string | undefined) => !!id && id !== "none" && !CONFIG.statusEffects.some(e => e.id === id)
  && !ceInterface?.findEffect?.({ effectId: id.replace("zce-", "ce-") });
const deadStatusMissing = () => statusMissing(configSettings.midiDeadCondition) || statusMissing(configSettings.midiUnconsciousCondition);

const FEATURE_OVERLAPS: FeatureOverlap[] = [
  { id: "wounded", sides: [
    { source: MIDI, setting: "midi-qol.AddWounded.Name", keys: ["midi-qol.ConfigSettings"], active: () => (configSettings.addWounded ?? 0) > 0 },
    { source: "dnd5e", setting: "SETTINGS.DND5E.BLOODIED.Name", keys: ["dnd5e.bloodied"], active: () => (safeGetGameSetting("dnd5e", "bloodied") ?? "none") !== "none" },
    { source: "custom-dnd5e", setting: "midi-qol.Overlaps.Settings.customApplyBloodied", keys: ["custom-dnd5e.apply-bloodied"], active: () => customDnd5e("apply-bloodied") === true },
  ] },
  { id: "dead", sides: [
    { source: MIDI, setting: "midi-qol.AddDead.Name", keys: ["midi-qol.ConfigSettings"], active: () => (configSettings.addDead ?? "none") !== "none" },
    { source: "custom-dnd5e", setting: "midi-qol.Overlaps.Settings.customApplyDead", keys: ["custom-dnd5e.apply-dead", "custom-dnd5e.apply-unconscious"],
      active: () => (customDnd5e("apply-dead") ?? "none") !== "none" || customDnd5e("apply-unconscious") === true },
    { source: "monks-combat-details", setting: "midi-qol.Overlaps.Settings.monksAutoDefeated", keys: ["monks-combat-details.auto-defeated"],
      active: () => !!game.modules.get("monks-combat-details")?.active && (safeGetGameSetting("monks-combat-details", "auto-defeated") ?? "none") !== "none" },
  ] },
  { id: "deadStatusMissing", sides: [
    { source: MIDI, setting: "midi-qol.AddDead.Name", keys: ["midi-qol.ConfigSettings"],
      active: () => (configSettings.addDead ?? "none") !== "none" && deadStatusMissing() },
    { source: STATUS_EFFECTS, setting: "midi-qol.Overlaps.Settings.statusMissing", keys: ["custom-dnd5e.conditions", "custom-dnd5e.enable-conditions"],
      active: deadStatusMissing },
  ] },
  { id: "initiative", sides: [
    { source: MIDI, setting: "midi-qol.AutoRerollInitiative.Name", keys: ["midi-qol.ConfigSettings"], active: () => !!checkMechanic("autoRerollInitiative") },
    { source: "custom-dnd5e", setting: "midi-qol.Overlaps.Settings.customRerollInitiative",
      keys: ["custom-dnd5e.reroll-initiative-each-round", "custom-dnd5e.enable-speed-factor-initiative"],
      active: () => (customDnd5e("reroll-initiative-each-round") ?? "off") !== "off" || customDnd5e("enable-speed-factor-initiative") === true },
  ], fix: async () => {
    await game.settings?.set(MIDI, "ConfigSettings", { ...configSettings, optionalRules: { ...configSettings.optionalRules, autoRerollInitiative: false } });
  } },
  // Custom D&D 5e replaces the damage roll, so midi applies nothing; midi has its own average damage.
  { id: "averageDamage", sides: [
    { source: MIDI, setting: "midi-qol.Overlaps.Settings.midiDamage", keys: [], active: () => true },
    { source: "custom-dnd5e", setting: "midi-qol.Overlaps.Settings.customAverageDamage", keys: ["custom-dnd5e.use-average-damage"],
      active: () => (customDnd5e("use-average-damage") ?? "neither") !== "neither" },
  ], fix: async () => {
    const custom = customDnd5e("use-average-damage");
    const averageDamage = custom === "both" ? "all" : custom;
    if (["npc", "character", "all"].includes(averageDamage))
      await game.settings?.set(MIDI, "ConfigSettings", { ...configSettings, averageDamage });
    await safeSetGameSetting("custom-dnd5e", "use-average-damage", "neither");
  } },
  // These replace the whole use, with no midi equivalent: the fix turns them off.
  { id: "damageReplaced", sides: [
    { source: MIDI, setting: "midi-qol.Overlaps.Settings.midiDamage", keys: [], active: () => true },
    { source: "custom-dnd5e", setting: "midi-qol.Overlaps.Settings.customDamage",
      keys: ["custom-dnd5e.enable-mob-damage", "custom-dnd5e.enable-probabilistic-damage"],
      active: () => customDnd5e("enable-mob-damage") === true || (customDnd5e("enable-probabilistic-damage") ?? "neither") !== "neither" },
  ], fix: async () => {
    await safeSetGameSetting("custom-dnd5e", "enable-mob-damage", false);
    await safeSetGameSetting("custom-dnd5e", "enable-probabilistic-damage", "neither");
  } },
];

const OVERLAP_KEYS = new Set(FEATURE_OVERLAPS.flatMap(o => o.sides.flatMap(s => s.keys)));

function sourceTitle(source: string): string {
  if (source === STATUS_EFFECTS) return customDnd5e("enable-conditions") ? sourceTitle("custom-dnd5e") : i18n("midi-qol.Overlaps.StatusEffects");
  if (source === game.system?.id) return game.system.title;
  return game.modules.get(source)?.title ?? source;
}

function acknowledgedSignatures(): string[] {
  return safeGetGameSetting(MODULE_ID, "acknowledgedOverlaps") ?? [];
}

export function activeFeatureOverlaps(): ActiveOverlap[] {
  const acknowledged = new Set(acknowledgedSignatures());
  const result: ActiveOverlap[] = [];
  for (const overlap of FEATURE_OVERLAPS) {
    const sides = overlap.sides.filter(side => { try { return side.active(); } catch { return false; } });
    if (sides.length < 2) continue;
    const signature = `${overlap.id}:${sides.map(s => s.source).sort().join(",")}`;
    result.push({
      id: overlap.id,
      feature: i18n(`midi-qol.Overlaps.${overlap.id}.Feature`),
      advice: i18n(`midi-qol.Overlaps.${overlap.id}.Advice`),
      sides: sides.map(s => ({ source: s.source, sourceTitle: sourceTitle(s.source), setting: i18n(s.setting) })),
      signature,
      acknowledged: acknowledged.has(signature),
      fix: overlap.fix
    });
  }
  return result;
}

const notified = new Set<string>();

/** Whisper the active GM a card listing overlaps not yet dismissed or already reported. */
export async function notifyFeatureOverlaps() {
  if (!game.user?.isGM || game.users?.activeGM !== game.user) return;
  const active = activeFeatureOverlaps();
  // An overlap switched off and on again is reported again.
  for (const signature of [...notified]) if (!active.some(o => o.signature === signature)) notified.delete(signature);
  const pending = active.filter(o => !o.acknowledged && !notified.has(o.signature));
  if (!pending.length) return;
  pending.forEach(o => notified.add(o.signature));
  const items = pending.map(o => `<li><strong>${o.feature}</strong>: ${o.sides.map(s => `${s.sourceTitle} (${s.setting})`).join(", ")}<br><em>${o.advice}</em></li>`).join("");
  const content = `<div class="midi-qol-overlaps" data-overlaps="${pending.map(o => o.signature).join("|")}">
    <p><strong>${i18n("midi-qol.Overlaps.Title")}</strong></p><p>${i18n("midi-qol.Overlaps.Intro")}</p><ul>${items}</ul>
    <div class="midi-qol-overlap-buttons">
      <button type="button" data-midi-overlap="troubleshooter">${i18n("midi-qol.Overlaps.OpenTroubleShooter")}</button>
      <button type="button" data-midi-overlap="dismiss">${i18n("midi-qol.Overlaps.Dismiss")}</button>
    </div></div>`;
  await ChatMessage.create({ content, speaker: { alias: "midi-qol" }, whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) });
}

function onRenderOverlapCard(message: ChatMessage.Implementation, html: HTMLElement) {
  const card = html.querySelector<HTMLElement>(".midi-qol-overlaps");
  if (!card || !game.user?.isGM) return;
  card.querySelector('[data-midi-overlap="troubleshooter"]')?.addEventListener("click", () => new TroubleShooter().render({ force: true }));
  card.querySelector('[data-midi-overlap="dismiss"]')?.addEventListener("click", async () => {
    const signatures = (card.dataset.overlaps ?? "").split("|").filter(s => s);
    await game.settings?.set(MODULE_ID, "acknowledgedOverlaps", [...new Set([...acknowledgedSignatures(), ...signatures])]);
    ui.notifications?.info(i18n("midi-qol.Overlaps.Dismissed"));
    await message.delete();
  });
}

/** Re-check once a setting change or status list rebuild has settled. */
export const recheckFeatureOverlaps = foundry.utils.debounce(() => notifyFeatureOverlaps(), 1000);

export function setupFeatureOverlaps() {
  Hooks.on("renderChatMessageHTML", onRenderOverlapCard);
  Hooks.on("updateSetting", (setting: Setting.Implementation) => { if (OVERLAP_KEYS.has(setting.key)) recheckFeatureOverlaps(); });
  Hooks.on("customDnd5e.setStatusEffectsConfig", () => recheckFeatureOverlaps());
}

/** TroubleShooter: one warning per active overlap, dismissed ones included. */
export function featureOverlapProblems() {
  return activeFeatureOverlaps().map(o => ({
    moduleId: o.sides.map(s => s.source).join(", "),
    severity: "Warn" as const,
    problemSummary: `${o.feature}: ${o.sides.map(s => s.sourceTitle).join(" + ")}${o.acknowledged ? ` (${i18n("midi-qol.Overlaps.Acknowledged")})` : ""}`,
    fixer: o.advice,
    problemDetail: o.sides.map(s => `${s.sourceTitle}: ${s.setting}`).join("; "),
    fixerFunc: o.fix && (async (app: TroubleShooter) => {
      await o.fix!();
      TroubleShooter.data = TroubleShooter.collectTroubleShooterData();
      app.render({ force: true });
    })
  }));
}

