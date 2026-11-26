import type { Entry, EntryAction } from "./types.js";
import type { EffectChange, TargetPresetDef } from "./editorServices.js";

/*
 * An activity read as an entry (the entry editor's activity card): what it does by itself, as dnd5e runs it, in
 * branches ("if a target fails its save: Paralyzed"), and the actions added to each branch. What it does by itself is
 * the activity's own data, edited here and written back to the activity, so dnd5e, its sheet and other modules see
 * the same activity. Added actions are ordinary entries in the activity's midiEntries, one per branch
 * (`activity-<branch>`, on the branch's per-target use event), drawn inside the branch.
 */

export type ActivityBranch = "hit" | "missed" | "saveFailed" | "saveSucceeded" | "each";
export const BRANCH_EVENT: Record<ActivityBranch, string> = {
  hit: "use.target.hit", missed: "use.target.missed", saveFailed: "use.target.saveFailed", saveSucceeded: "use.target.saveSucceeded", each: "use.target.each"
};
export const branchEntryId = (branch: ActivityBranch) => `activity-${branch}`;

/** A branch's own entry: the id and event the editor gives it, and nothing it can't show inside the branch */
export function isBranchEntry(entry: Entry): ActivityBranch | undefined {
  const branch = (Object.keys(BRANCH_EVENT) as ActivityBranch[]).find(b => entry.id === branchEntryId(b));
  if (!branch) return undefined;
  const on = [entry.on].flat();
  if (on.length !== 1 || on[0] !== BRANCH_EVENT[branch]) return undefined;
  if (entry.offer || entry.choose || entry.limit || entry.group || entry.activity || entry.who) return undefined;
  return branch;
}

/** The parts of an activity a card shows, as stored (the activity's _source) */
export interface ActivityData {
  type: string;
  save?: { ability?: string[], dc?: { calculation?: string, formula?: string } };
  attack?: { type?: { value?: string, classification?: string } };
  check?: { ability?: string, associated?: string[], dc?: { calculation?: string, formula?: string } };
  damage?: { onSave?: string, includeBase?: boolean, parts?: DamagePart[] };
  healing?: DamagePart;
  effects?: { _id: string, onSave?: boolean }[];
  /** summon / transform: who or what */
  profiles?: { name?: string, uuid?: string | null, count?: string, types?: string[] }[];
  /** cast: the spell */
  spell?: { uuid?: string | null, level?: number | null };
  /** enchant: what can be enchanted */
  restrictions?: { type?: string };
  /** forward: the activity used */
  activity?: { id?: string };
  /** The item's spell level (0: a cantrip), when it is a spell: how its damage scales */
  spellLevel?: number;
  /** midi's region rules for the area it makes */
  regionBehavior?: { enabled?: boolean, attachToken?: string, dispositionFilter?: number, oncePerTurn?: boolean, rules?: { trigger: string, action: string, targetId: string }[] };
  /** dnd5e's region behaviours (an effect applied while inside) */
  behaviors?: { type: string, config?: { effects?: string[] } }[];
  /** The area it makes, worded ("15 ft emanation"), when it makes one */
  areaLabel?: string;
  /** Its targeting as dnd5e resolves it (the editor fills it from the prepared activity) */
  targeting?: Targeting;
  /** A weapon's damage the attack adds (includeBase): one-handed, and two-handed when versatile (with its stored data) */
  weapon?: { base: DamagePart, versatile?: DamagePart, versatileSource?: DamagePart };
  /** Registered targeting presets to read it with */
  targetPresets?: readonly TargetPresetDef[];
  /** midi's properties (as stored): the card reads and writes its Trigger Activity */
  midiProperties?: TriggerProps;
}

/** Trigger Activity's stored fields (the activity's midiProperties) */
export interface TriggerProps {
  triggeredActivityId?: string;
  triggeredActivityTargets?: string;
  triggeredActivityRollAs?: string;
  triggeredActivityConditionText?: string;
  triggeredActivityConsume?: boolean;
  triggeredActivityConfigure?: boolean;
  triggeredActivityNearWithin?: number;
  triggeredActivityNearMax?: string;
  triggeredActivityNearDisposition?: string;
  triggeredActivityChainLimit?: string;
}

/** The Then line's edits (Trigger Activity): "none" for activity removes the trigger */
export interface TriggerEdits {
  activity: string;
  to?: string;
  rollAs?: string;
  condition?: string;
  within?: number;
  max?: string;
  disposition?: string;
  chain?: string;
  consume?: boolean;
  configure?: boolean;
}

export const TRIGGER_TARGETS = ["targets", "hitTargets", "missedTargets", "failedSaves", "saveTargets", "self", "near", "retarget"] as const;
export const TRIGGER_ROLL_AS = ["self", "firstTarget", "firstHitTarget", "firstMissedTarget", "firstSaveTarget", "firstFailedSaveTarget"] as const;
export const TRIGGER_DISPOSITIONS = ["any", "enemy", "ally"] as const;

/** The words for which creatures (the Targets line's, plural): enemies, allies, else creatures */
export const nearWhoKey = (disposition: unknown) => `Activity.Target.who.${disposition === "enemy" ? "enemys" : disposition === "ally" ? "allys" : "creatures"}`;

/** Whether the activity triggers another */
export const hasTrigger = (props: TriggerProps | undefined) => !!props?.triggeredActivityId && props.triggeredActivityId !== "none";

/** The Then line: "Then use Leap on up to 2 enemies within 30 ft of the target, if …"; undefined without a trigger */
export function triggerText(props: TriggerProps | undefined, t: CardText): string | undefined {
  if (!hasTrigger(props)) return undefined;
  const p = props!;
  const to = p.triggeredActivityTargets ?? "targets";
  const targets = to === "near"
    ? t.say("Activity.Then.near", { max: String(p.triggeredActivityNearMax || "1"), who: t.say(nearWhoKey(p.triggeredActivityNearDisposition)), within: String(p.triggeredActivityNearWithin ?? 30) })
    : t.say(`Activity.Then.to.${(TRIGGER_TARGETS as readonly string[]).includes(to) ? to : "targets"}`);
  const parts = [t.say("Activity.Then.use", { activity: t.activityName(p.triggeredActivityId!) ?? p.triggeredActivityId!, targets })];
  if (p.triggeredActivityRollAs && p.triggeredActivityRollAs !== "self") parts.push(t.say(`Activity.Then.rollAs.${p.triggeredActivityRollAs}`));
  if (p.triggeredActivityConditionText?.trim()) parts.push(t.say("Activity.Then.if", { condition: p.triggeredActivityConditionText.trim() }));
  if (p.triggeredActivityChainLimit?.trim()) parts.push(t.say("Activity.Then.chain", { n: p.triggeredActivityChainLimit.trim() }));
  if (p.triggeredActivityConsume === false) parts.push(t.say("Activity.Then.free"));
  return parts.join(", ");
}

/** The midiProperties paths the Then line's edits change (only what changed) */
export function triggerUpdate(props: TriggerProps | undefined, edits: TriggerEdits): Record<string, unknown> {
  const now = props ?? {};
  const update: Record<string, unknown> = {};
  const set = (key: keyof TriggerProps, value: unknown, initial: unknown) => {
    if (value === undefined) return;
    if (value !== (now[key] ?? initial)) update[`midiProperties.${key}`] = value;
  };
  if (!edits.activity || edits.activity === "none") {
    if (hasTrigger(now)) update["midiProperties.triggeredActivityId"] = "none";
    return update;
  }
  set("triggeredActivityId", edits.activity, "none");
  set("triggeredActivityTargets", edits.to, "targets");
  set("triggeredActivityRollAs", edits.rollAs, "self");
  set("triggeredActivityConditionText", edits.condition, "");
  set("triggeredActivityConsume", edits.consume, true);
  set("triggeredActivityConfigure", edits.configure, true);
  set("triggeredActivityChainLimit", edits.chain, "");
  if ((edits.to ?? now.triggeredActivityTargets) === "near") {
    set("triggeredActivityNearWithin", edits.within, 30);
    set("triggeredActivityNearMax", edits.max, "1");
    set("triggeredActivityNearDisposition", edits.disposition, "any");
  }
  return update;
}

/** What the area an activity makes does: midi's rules, dnd5e's effects while inside */
export interface CardRegion { text: string, rules: string[] }
export interface DamagePart { number?: number | null, denomination?: number | null, bonus?: string, types?: string[], custom?: { enabled?: boolean, formula?: string }, scaling?: { mode?: string, number?: number | null, formula?: string } }

/** A part's formula as dnd5e writes it (its custom formula, else NdX + bonus) */
export function partFormula(part: DamagePart): string {
  if (part.custom?.enabled) return part.custom.formula ?? "";
  const dice = part.number && part.denomination ? `${part.number}d${part.denomination}` : "";
  const bonus = (part.bonus ?? "").trim();
  if (!dice) return bonus;
  if (!bonus) return dice;
  return /^[+-]/.test(bonus) ? `${dice} ${bonus[0]} ${bonus.slice(1).trim()}` : `${dice} + ${bonus}`;
}

/** A part given a formula: kept as dice when it is plain NdX (+ a number), else a custom formula */
export function partWithFormula(part: DamagePart, formula: string): DamagePart {
  const plain = /^\s*(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/.exec(formula);
  if (plain) return { ...part, number: Number(plain[1]), denomination: Number(plain[2]), bonus: plain[3] ? `${plain[3] === "-" ? "-" : ""}${plain[4]}` : "", custom: { enabled: false, formula: "" } };
  return { ...part, custom: { enabled: true, formula } };
}

export type BuiltInKind = "save" | "attack" | "check" | "damage" | "healing" | "effect" | "half" | "none";
/** One thing the activity does by itself; `field`: the card field that edits it */
export interface BuiltInPart { kind: BuiltInKind, text: string, field?: string }
export interface CardBranch { branch: ActivityBranch, builtIn: BuiltInPart[] }
export interface ActivityCardModel { when: BuiltInPart[], branches: CardBranch[], region?: CardRegion, targeting?: BuiltInPart, then?: BuiltInPart }

export interface CardText {
  ability(id: string): string;
  damageType(id: string): string;
  effectName(id: string): string;
  /** A document's name by uuid (a compendium's index), undefined when unknown */
  documentName(uuid: string): string | undefined;
  /** One of the item's activities by id */
  activityName(id: string): string | undefined;
  /** An item type's or creature type's label */
  typeLabel(kind: "item" | "creature", id: string): string;
  /** A wording (`Activity.Type.<type>` falls back to `Activity.Used` when there is none) */
  say(key: string, data?: Record<string, string>): string;
}

const DC_FIELD = "dc";

function dcText(dc: { calculation?: string, formula?: string } | undefined, t: CardText): string {
  const calculation = dc?.calculation ?? "";
  if (calculation === "spellcasting") return t.say("Activity.DC.spellcasting");
  if (calculation) return t.say("Activity.DC.ability", { ability: t.ability(calculation) });
  return t.say("Activity.DC.custom", { dc: dc?.formula || "?" });
}

/** How a part's damage grows: a cantrip's with the caster's level, a spell's with its slot */
function scales(part: DamagePart, data: ActivityData, t: CardText): string {
  if (!part.scaling?.mode || part.scaling.mode === "none" || data.spellLevel === undefined) return "";
  return ` ${t.say(data.spellLevel === 0 ? "Activity.Scales.cantrip" : "Activity.Scales.slot")}`;
}

function damageParts(data: ActivityData, t: CardText, kind: "damage" | "half"): BuiltInPart[] {
  const parts = (data.damage?.parts ?? []).map((part, i) => ({
    kind, field: `part.${i}`,
    text: t.say(kind === "half" ? "Activity.HalfDamage" : "Activity.Damage", { formula: partFormula(part) || "?", type: (part.types ?? []).map(id => t.damageType(id)).join("/") }) + scales(part, data, t)
  } satisfies BuiltInPart));
  if (data.damage?.includeBase && data.type === "attack") parts.unshift({ kind, field: "weapon", text: weaponDamageText(data, t, kind) });
  return parts;
}

/** The weapon's damage the attack adds: "the weapon's 1d8 Slashing damage (1d10 two-handed)" */
function weaponDamageText(data: ActivityData, t: CardText, kind: "damage" | "half"): string {
  const w = data.weapon;
  if (!w || !partFormula(w.base)) return t.say(kind === "half" ? "Activity.HalfBase" : "Activity.BaseDamage");
  const type = (w.base.types ?? []).map(id => t.damageType(id)).join("/");
  const versatile = w.versatile && partFormula(w.versatile)
    ? ` ${t.say("Activity.Versatile", { formula: partFormula(w.versatile), type: w.versatile.types?.length ? w.versatile.types.map(id => t.damageType(id)).join("/") : type })}` : "";
  return t.say(kind === "half" ? "Activity.HalfWeaponDamage" : "Activity.WeaponDamage", { formula: partFormula(w.base), type }) + versatile;
}

/** The weapon's damage edits: one-handed formula and types, versatile (and its two-handed formula and types) */
export interface WeaponEdits { formula?: string, types?: string[], versatile?: boolean, versatileFormula?: string, versatileTypes?: string[] }

/** The weapon's update for the edits (only what changed): system.damage.base / versatile, the versatile property */
export function editedWeapon(weapon: NonNullable<ActivityData["weapon"]>, edits: WeaponEdits | undefined): NonNullable<ActivityData["weapon"]> {
  if (!edits) return weapon;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  let base = weapon.base;
  if (edits.formula !== undefined && edits.formula !== partFormula(base)) base = partWithFormula(base, edits.formula);
  if (edits.types && !same(edits.types, base.types ?? [])) base = { ...base, types: edits.types };
  let stored: DamagePart = weapon.versatileSource ?? { number: null, denomination: null, bonus: "", types: [], custom: { enabled: false, formula: "" } };
  if (edits.versatileFormula !== undefined && edits.versatileFormula !== partFormula(stored)) stored = partWithFormula(stored, edits.versatileFormula);
  if (edits.versatileTypes && !same(edits.versatileTypes, stored.types ?? [])) stored = { ...stored, types: edits.versatileTypes };
  const isVersatile = edits.versatile ?? !!weapon.versatile;
  return { base, versatileSource: stored, ...(isVersatile ? { versatile: stored } : {}) };
}

export function weaponUpdate(weapon: NonNullable<ActivityData["weapon"]>, edits: WeaponEdits, properties: readonly string[]): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const now = editedWeapon(weapon, edits);
  if (!same(now.base, weapon.base)) update["system.damage.base"] = now.base;
  const isVersatile = !!now.versatile;
  if (isVersatile !== properties.includes("ver"))
    update["system.properties"] = isVersatile ? [...properties.filter(p => p !== "ver"), "ver"] : properties.filter(p => p !== "ver");
  if (weapon.versatileSource ? !same(now.versatileSource, weapon.versatileSource) : !!now.versatile && !!partFormula(now.versatileSource!))
    update["system.damage.versatile"] = now.versatileSource;
  return update;
}

function effects(data: ActivityData, t: CardText, filter: (onSave: boolean) => boolean): BuiltInPart[] {
  return (data.effects ?? []).filter(e => filter(!!e.onSave)).map(e => ({ kind: "effect" as const, field: `effect.${e._id}`, text: t.effectName(e._id) }));
}

const RULE_TRIGGERS = ["entry", "exit", "turnStart", "turnEnd"];

/** The area's rules, grouped by what they do: "an enemy that enters it or ends its turn in it: uses Spirit Guardians Save" */
export function cardRegion(data: ActivityData, t: CardText): CardRegion | undefined {
  const view = areaView(data, t);
  if (!view || (!view.groups.length && !view.other.length && !view.dnd5e.length)) return undefined;
  return { text: view.text, rules: [...view.groups, ...view.other, ...view.dnd5e] };
}

/** The area's wording: what it is, each group of rules, rules no group describes, dnd5e's own effects while inside */
export function areaView(data: ActivityData, t: CardText): { text: string, groups: string[], other: string[], dnd5e: string[] } | undefined {
  const rb = data.regionBehavior;
  const dnd5e = (data.behaviors ?? []).filter(b => b.type === "applyActiveEffect").flatMap(b => b.config?.effects ?? []).map(uuid => t.documentName(uuid) ?? "?");
  // Only an area that acts on creatures (midi's rules, or dnd5e's effects while inside) reads as one
  if (!rb?.enabled && !dnd5e.length) return undefined;
  const rules = rb?.enabled ? rb.rules ?? [] : [];
  const area = data.areaLabel || t.say("Activity.Region.anArea");
  const attached = rb?.enabled && rb.attachToken === "caster" ? t.say("Activity.Region.attachedCaster") : rb?.enabled && rb.attachToken === "target" ? t.say("Activity.Region.attachedTarget") : "";
  const who = t.say(`Activity.Region.who.${rb?.dispositionFilter === 1 ? "ally" : rb?.dispositionFilter === 0 ? "any" : "enemy"}`);
  const or = t.say("Activity.Region.or");
  const { groups, other } = areaGroups(rules);
  const groupText = (g: AreaGroup) => g.kind === "use"
    ? t.say("Activity.Region.rule", { who, when: g.triggers.map(tr => t.say(`Activity.Region.trigger.${tr}`)).join(` ${or} `),
      does: t.say("Activity.Region.action.useActivity", { what: t.activityName(g.targetId) ?? g.targetId }) }) + (rb?.oncePerTurn ? ` ${t.say("Activity.Region.oncePerTurn")}` : "")
    : t.say("Activity.Region.whileIn", { effects: t.effectName(g.targetId) });
  const ruleText = (r: RegionRule) => t.say("Activity.Region.rule", { who, when: AREA_TRIGGERS.includes(r.trigger) ? t.say(`Activity.Region.trigger.${r.trigger}`) : r.trigger,
    does: t.say(`Activity.Region.action.${r.action}`, { what: r.action === "useActivity" ? t.activityName(r.targetId) ?? r.targetId : t.effectName(r.targetId) }) });
  return {
    text: t.say("Activity.Region.makes", { area, attached }),
    groups: groups.map(groupText), other: other.map(ruleText), dnd5e: dnd5e.length ? [t.say("Activity.Region.whileIn", { effects: dnd5e.join(", ") })] : []
  };
}

/** What the activity does by itself, by branch */
export function activityCard(data: ActivityData, t: CardText): ActivityCardModel {
  const card = activityCardOf(data, t);
  const region = cardRegion(data, t);
  const targeting = data.targeting ? { kind: "none" as const, text: targetingText(data.targeting, t, data.targetPresets), field: "target" } : undefined;
  const thenText = triggerText(data.midiProperties, t);
  const then = thenText ? { kind: "none" as const, text: thenText, field: "trigger" } : undefined;
  return { ...card, ...(region ? { region } : {}), ...(targeting ? { targeting } : {}), ...(then ? { then } : {}) };
}

function activityCardOf(data: ActivityData, t: CardText): ActivityCardModel {
  switch (data.type) {
    case "attack":
      return {
        when: [{ kind: "attack", text: t.say(`Activity.Attack.${data.attack?.type?.value === "ranged" ? "ranged" : "melee"}`), field: "roll" }],
        branches: [
          { branch: "hit", builtIn: [...damageParts(data, t, "damage"), ...effects(data, t, () => true)] },
          { branch: "missed", builtIn: [] }
        ]
      };
    case "save": {
      const abilities = (data.save?.ability ?? []).map(id => t.ability(id)).join("/") || "?";
      const onSave = data.damage?.onSave ?? "half";
      const succeeded: BuiltInPart[] = (data.damage?.parts?.length ?? 0) && onSave !== "none"
        ? onSave === "full" ? damageParts(data, t, "damage") : damageParts(data, t, "half") : [];
      return {
        when: [{ kind: "save", text: t.say("Activity.Save", { ability: abilities }), field: "roll" }, { kind: "save", text: dcText(data.save?.dc, t), field: DC_FIELD }],
        branches: [
          { branch: "saveFailed", builtIn: [...damageParts(data, t, "damage"), ...effects(data, t, () => true)] },
          { branch: "saveSucceeded", builtIn: [...succeeded, ...effects(data, t, onSave => onSave)] }
        ]
      };
    }
    case "check": {
      const check = data.check;
      const skills = (check?.associated ?? []).join("/");
      const ability = check?.ability ? t.ability(check.ability) : "?";
      return {
        when: [{ kind: "check", text: t.say("Activity.Check", { ability: skills ? `${ability} (${skills})` : ability }), field: "roll" },
          { kind: "check", text: dcText(check?.dc, t), field: DC_FIELD }],
        branches: [{ branch: "each", builtIn: effects(data, t, () => true) }]
      };
    }
    case "summon":
    case "transform": {
      const names = (data.profiles ?? []).map(p => {
        const name = p.name || (p.uuid ? t.documentName(p.uuid) : undefined);
        const types = (p.types ?? []).map(id => t.typeLabel("creature", id)).join("/");
        const label = name && types ? `${name} (${types})` : name || types || "?";
        return p.count && p.count !== "1" ? `${label} ×${p.count}` : label;
      }).join(", ") || "?";
      return {
        when: [{ kind: "none", text: t.say(`Activity.${data.type === "summon" ? "Summons" : "Transforms"}`, { what: names }) }],
        branches: [{ branch: "each", builtIn: effects(data, t, () => true) }]
      };
    }
    case "cast": {
      const spell = data.spell?.uuid ? t.documentName(data.spell.uuid) : undefined;
      return {
        when: [{ kind: "none", text: t.say(data.spell?.level ? "Activity.CastsAt" : "Activity.Casts", { spell: spell ?? "?", level: String(data.spell?.level ?? "") }) }],
        branches: [{ branch: "each", builtIn: [] }]
      };
    }
    case "enchant":
      return {
        when: [{ kind: "none", text: t.say("Activity.Enchants", { what: data.restrictions?.type ? t.typeLabel("item", data.restrictions.type) : t.say("Activity.AnItem") }) }],
        branches: [{ branch: "each", builtIn: effects(data, t, () => true) }]
      };
    case "forward":
      return {
        when: [{ kind: "none", text: t.say("Activity.Forwards", { activity: (data.activity?.id && t.activityName(data.activity.id)) || "?" }) }],
        branches: [{ branch: "each", builtIn: [] }]
      };
    default: {
      const healing = data.healing && partFormula(data.healing)
        ? [{ kind: "healing" as const, field: "healing", text: t.say("Activity.Healing", { formula: partFormula(data.healing), type: (data.healing.types ?? []).map(id => t.damageType(id)).join("/") }) }] : [];
      return {
        // Every other type (a module's too): what it does by its type's wording, else "is used"
        when: [{ kind: "none", text: t.say(`Activity.Type.${data.type}`), field: "roll" }],
        branches: [{ branch: "each", builtIn: [...damageParts(data, t, "damage"), ...healing, ...effects(data, t, () => true)] }]
      };
    }
  }
}

/** The card's fields for an activity: what can be edited here */
export interface CardEdits {
  /** Another roll for the activity: converted on save (same id) */
  convertTo?: RollKind;
  /** The targeting chip's edits */
  target?: TargetEdits;
  /** Effects added in the sentence view (created on the item when saved) */
  newEffects?: NewEffect[];
  /** Effects taken off the activity (left on the item) */
  removeEffects?: string[];
  /** The area's edits: whether it acts, what it is attached to, who, once per turn, its groups of rules */
  area?: AreaEdits;
  /** Activation, duration, concentration, uses (the basics chip) */
  basics?: Partial<Basics>;
  /** The weapon's damage (an attack adding it) */
  weapon?: WeaponEdits;
  /** Whether the attack adds the weapon's damage */
  includeBase?: boolean;
  /** The Then line (Trigger Activity) */
  trigger?: TriggerEdits;
  /** Registered basics fields' values (basicsFields service), by field id */
  basicsExtra?: Record<string, unknown>;
  attackType?: string;
  attackClass?: string;
  saveAbility?: string[];
  checkAbility?: string;
  dcCalculation?: string;
  dcFormula?: string;
  onSave?: string;
  /** A part's formula and its damage types (several: the roller chooses one, as dnd5e's sheet sets them) */
  parts?: { formula: string, types: string[], scaling?: { mode: string, number: number | null } }[];
  healing?: { formula: string, types: string[] };
  effectsOnSave?: Record<string, boolean>;
}

/** The activity update for the card's edits (paths relative to the activity), only what changed */
export function activityUpdate(data: ActivityData, edits: CardEdits): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (edits.attackType && edits.attackType !== (data.attack?.type?.value ?? "")) update["attack.type.value"] = edits.attackType;
  if (edits.attackClass && edits.attackClass !== (data.attack?.type?.classification ?? "")) update["attack.type.classification"] = edits.attackClass;
  if (edits.saveAbility && !same(edits.saveAbility, data.save?.ability ?? [])) update["save.ability"] = edits.saveAbility;
  // A check's DC is check.dc, a save's save.dc
  const dcOf = data.type === "check" ? "check" : "save";
  const dc = data.type === "check" ? data.check?.dc : data.save?.dc;
  if (edits.checkAbility !== undefined && edits.checkAbility !== (data.check?.ability ?? "")) update["check.ability"] = edits.checkAbility;
  if (edits.dcCalculation !== undefined && edits.dcCalculation !== (dc?.calculation ?? "")) update[`${dcOf}.dc.calculation`] = edits.dcCalculation;
  if (edits.dcFormula !== undefined && edits.dcFormula !== (dc?.formula ?? "")) update[`${dcOf}.dc.formula`] = edits.dcFormula;
  if (edits.onSave !== undefined && edits.onSave !== (data.damage?.onSave ?? "half")) update["damage.onSave"] = edits.onSave;
  if (edits.includeBase !== undefined && edits.includeBase !== !!data.damage?.includeBase) update["damage.includeBase"] = edits.includeBase;
  if (edits.parts) {
    const parts = (data.damage?.parts ?? []).map((part, i) => {
      const edit = edits.parts![i];
      if (!edit) return part;
      let next = edit.formula === partFormula(part) ? part : partWithFormula(part, edit.formula);
      if (!same(edit.types, part.types ?? [])) next = { ...next, types: edit.types };
      // How it grows (a spell's slot, a cantrip's level): "" none, "whole" each step, "half" every other step
      if (edit.scaling && (edit.scaling.mode !== (part.scaling?.mode ?? "") || (edit.scaling.mode && edit.scaling.number !== (part.scaling?.number ?? null))))
        next = { ...next, scaling: { ...(part.scaling ?? {}), mode: edit.scaling.mode, number: edit.scaling.mode ? edit.scaling.number ?? 1 : part.scaling?.number ?? null } };
      return next;
    });
    for (const added of edits.parts.slice(parts.length)) if (added.formula.trim()) parts.push(partWithFormula({ types: added.types }, added.formula));
    if (!same(parts, data.damage?.parts ?? [])) update["damage.parts"] = parts;
  }
  if (edits.healing && data.healing) {
    let healing = edits.healing.formula === partFormula(data.healing) ? data.healing : partWithFormula(data.healing, edits.healing.formula);
    if (!same(edits.healing.types, data.healing.types ?? [])) healing = { ...healing, types: edits.healing.types };
    if (!same(healing, data.healing)) update.healing = healing;
  }
  const list = activityEffects(data, edits);
  if (!same(list, data.effects ?? [])) update.effects = list;
  if (edits.trigger) Object.assign(update, triggerUpdate(data.midiProperties, edits.trigger));
  return update;
}

/* Converting an activity to another roll (the sentence view's roll chip): the author picks what happens to the target,
   midi picks the activity type */

export type RollKind = "attack" | "save" | "check" | "damage" | "heal" | "utility";
export const ROLL_KINDS: readonly RollKind[] = ["attack", "save", "check", "damage", "heal", "utility"];

/** Each type's own data, dropped when the activity becomes another type */
const TYPE_KEYS = ["attack", "save", "check", "damage", "healing", "roll", "profiles", "summon", "creatureSizes", "creatureTypes",
  "match", "bonuses", "spell", "restrictions", "enchant", "transform", "settings", "activity"];

/** The branches each roll has */
export function branchesOf(type: string): ActivityBranch[] {
  return type === "attack" ? ["hit", "missed"] : type === "save" ? ["saveFailed", "saveSucceeded"] : ["each"];
}

/** Where a branch's actions go when the roll changes: a failure is a hit, a success a miss; "each" the main one */
export function branchFor(from: ActivityBranch, to: string): ActivityBranch | undefined {
  const branches = branchesOf(to);
  if (branches.includes(from)) return from;
  const main = branches[0], other = branches[1];
  if (from === "hit" || from === "saveFailed" || from === "each") return main;
  return other;
}

/** An activity's data as another roll: what the types share kept, the new roll's defaults filled */
export function convertActivity(source: Record<string, unknown>, to: RollKind, options: { spell: boolean }): Record<string, unknown> {
  // Plain stored data: no Foundry needed (unit-tested)
  const clone = <T>(value: T): T => value === undefined ? value : structuredClone(value);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) if (!TYPE_KEYS.includes(key)) next[key] = clone(value);
  next.type = to;
  const damage = source.damage as { parts?: DamagePart[], onSave?: string, includeBase?: boolean } | undefined;
  const parts = clone(damage?.parts ?? (source.healing ? [source.healing as DamagePart] : []));
  const dc = { calculation: options.spell ? "spellcasting" : "", formula: options.spell ? "" : "10" };
  switch (to) {
    case "attack":
      next.attack = clone(source.attack) ?? { type: { value: "melee", classification: options.spell ? "spell" : "weapon" } };
      next.damage = { parts, includeBase: damage?.includeBase ?? false };
      break;
    case "save":
      next.save = clone(source.save) ?? { ability: ["dex"], dc };
      next.damage = { parts, onSave: damage?.onSave ?? "half" };
      break;
    case "check":
      next.check = clone(source.check) ?? { ability: "str", associated: [], dc };
      break;
    case "damage":
      next.damage = { parts };
      break;
    case "heal":
      next.healing = parts[0] ?? { number: 1, denomination: 8, bonus: "", types: ["healing"], custom: { enabled: false, formula: "" } };
      break;
    case "utility":
      next.roll = clone(source.roll) ?? { formula: "", name: "", prompt: false, visible: false };
      break;
  }
  // Actions added to a branch follow it to the matching branch
  const entries = next.midiEntries;
  if (Array.isArray(entries)) next.midiEntries = entries.map(e => moveBranchEntry(e as Entry, to));
  return next;
}

/** A branch's own entry, moved to the branch it matches in a roll of `to` (anything else unchanged) */
export function moveBranchEntry(entry: Entry, to: string): Entry {
  const branch = isBranchEntry(entry);
  const target = branch ? branchFor(branch, to) : undefined;
  if (!branch || !target || target === branch) return entry;
  return { ...entry, id: branchEntryId(target), on: BRANCH_EVENT[target] };
}

/* Targeting presets (the sentence view's "Targets" chip): one dropdown for dnd5e's target, template and range */

/** An activity's targeting as dnd5e resolves it (its own, else its item's) */
export interface Targeting {
  affectsType?: string;
  count?: string | number | null;
  templateType?: string;
  size?: string | number | null;
  width?: string | number | null;
  rangeUnits?: string;
  rangeValue?: string | number | null;
  /** Only creatures the user can see (midi's targetMustBeSeen; checked for single targets, not areas) */
  mustSee?: boolean;
}

/** The presets "a creature you can see" applies to (midi checks sight for chosen targets, not for areas) */
export const SEEN_PRESETS = ["one", "several", "touch"];
/** midi's presets, or a registered one's id (targetPresets service) */
export type TargetPreset = "self" | "touch" | "one" | "several" | "point" | "fromYou" | "emanation" | "custom" | (string & {});
export const TARGET_PRESETS: readonly TargetPreset[] = ["one", "several", "self", "touch", "point", "fromYou", "emanation"];
export const POINT_SHAPES = ["sphere", "cube", "cylinder"];
export const FROM_YOU_SHAPES = ["cone", "line"];
const EMANATION_SHAPES = ["radius", "emanationNoTemplate"];

/** The preset a targeting reads as; data no preset describes exactly is "custom" (never forced into one) */
/** midi's preset for the targeting, else the first registered one that recognises it, else custom */
export function targetPreset(t: Targeting, extra: readonly TargetPresetDef[] = []): TargetPreset {
  const own = builtInPreset(t);
  return own !== "custom" ? own : extra.find(def => { try { return def.matches(t); } catch { return false; } })?.id ?? "custom";
}

function builtInPreset(t: Targeting): TargetPreset {
  const shape = t.templateType || "";
  const distance = t.rangeUnits === "ft" || t.rangeUnits === "m";
  if (shape) {
    if (t.rangeUnits === "self") return FROM_YOU_SHAPES.includes(shape) ? "fromYou" : EMANATION_SHAPES.includes(shape) ? "emanation" : "custom";
    return POINT_SHAPES.includes(shape) && distance ? "point" : "custom";
  }
  if (t.affectsType === "self") return "self";
  const count = Number(t.count || 1);
  if (t.rangeUnits === "touch") return count <= 1 ? "touch" : "custom";
  if (distance) return count <= 1 ? "one" : "several";
  return t.rangeUnits === "self" && !t.affectsType ? "self" : "custom";
}

/** What the targeting says: "one creature within 60 ft", "a 20 ft sphere at a point within 150 ft" */
export function targetingText(tg: Targeting, t: CardText, extra: readonly TargetPresetDef[] = []): string {
  const preset = targetPreset(tg, extra);
  const registered = extra.find(def => def.id === preset);
  if (registered) return registered.text(tg, t.say);
  const plainWho = t.say(`Activity.Target.who.${["enemy", "ally"].includes(tg.affectsType ?? "") ? tg.affectsType : "creature"}${Number(tg.count || 1) > 1 ? "s" : ""}`);
  const who = tg.mustSee && SEEN_PRESETS.includes(preset) ? t.say("Activity.Target.youCanSee", { who: plainWho }) : plainWho;
  const range = `${tg.rangeValue ?? "?"} ${tg.rangeUnits ?? ""}`.trim();
  return t.say(`Activity.Target.${preset}`, { who, count: String(tg.count ?? ""), range, shape: t.say(`Activity.Shape.${tg.templateType || "sphere"}`), size: String(tg.size ?? "?"), width: String(tg.width ?? "") });
}

/** The edits the targeting chip makes */
export interface TargetEdits { preset?: TargetPreset, count?: number, range?: number, shape?: string, size?: number, width?: number, who?: string, see?: boolean }

/** The targeting after the chip's edits (a preset changed: its own defaults, kept from before where they fit) */
export function editedTargeting(current: Targeting, edits: TargetEdits | undefined, extra: readonly TargetPresetDef[] = []): Targeting {
  if (!edits?.preset && !edits) return current;
  // Whether targets must be seen goes with the targeting whatever the preset (kept unless changed)
  const edited = presetTargeting(current, edits, extra);
  const mustSee = edits.see ?? current.mustSee;
  return mustSee === undefined ? edited : { ...edited, mustSee };
}

function presetTargeting(current: Targeting, edits: TargetEdits, extra: readonly TargetPresetDef[]): Targeting {
  const preset = edits.preset ?? targetPreset(current, extra);
  if (preset === "custom") return current;
  const registered = extra.find(def => def.id === preset);
  if (registered) {
    // Its defaults when picked, then the fields it lets the chip edit
    const base = edits.preset && edits.preset !== targetPreset(current, extra) ? registered.defaults(current) : current;
    const fields = registered.fields ?? [];
    return {
      ...base,
      ...(fields.includes("count") && edits.count !== undefined ? { count: edits.count } : {}),
      ...(fields.includes("range") && edits.range !== undefined ? { rangeValue: edits.range } : {}),
      ...(fields.includes("size") && edits.size !== undefined ? { size: edits.size } : {}),
      ...(fields.includes("width") && edits.width !== undefined ? { width: edits.width } : {}),
      ...(fields.includes("who") && edits.who !== undefined ? { affectsType: edits.who } : {}),
      ...(fields.includes("shape") && edits.shape !== undefined && (registered.shapes ?? []).includes(edits.shape) ? { templateType: edits.shape } : {})
    };
  }
  const who = edits.who ?? (["enemy", "ally", "creature"].includes(current.affectsType ?? "") ? current.affectsType : "creature");
  const range = edits.range ?? (Number(current.rangeValue) || 30);
  const size = edits.size ?? (Number(current.size) || (preset === "fromYou" ? 15 : preset === "emanation" ? 10 : 20));
  switch (preset) {
    case "self": return { affectsType: "self", count: "", templateType: "", rangeUnits: "self", rangeValue: null };
    case "touch": return { affectsType: who, count: 1, templateType: "", rangeUnits: "touch", rangeValue: null };
    case "one": return { affectsType: who, count: 1, templateType: "", rangeUnits: "ft", rangeValue: range };
    case "several": return { affectsType: who, count: edits.count ?? Math.max(2, Number(current.count) || 2), templateType: "", rangeUnits: "ft", rangeValue: range };
    case "point": return { affectsType: who, count: "", templateType: POINT_SHAPES.includes(edits.shape ?? "") ? edits.shape : POINT_SHAPES.includes(current.templateType ?? "") ? current.templateType : "sphere", size, rangeUnits: "ft", rangeValue: edits.range ?? (Number(current.rangeValue) || 60) };
    case "fromYou": {
      const shape = FROM_YOU_SHAPES.includes(edits.shape ?? "") ? edits.shape! : FROM_YOU_SHAPES.includes(current.templateType ?? "") ? current.templateType! : "cone";
      return { affectsType: who, count: "", templateType: shape, size, width: shape === "line" ? edits.width ?? (Number(current.width) || 5) : null, rangeUnits: "self", rangeValue: null };
    }
    case "emanation": return { affectsType: who, count: "", templateType: "radius", size, rangeUnits: "self", rangeValue: null };
    default: return current;
  }
}

/** The update a targeting makes: on the item (a spell's activity that uses the spell's) or the activity (its own) */
export function targetingUpdate(tg: Targeting, onItem: boolean): Record<string, unknown> {
  const target = onItem ? "system.target" : "target";
  const range = onItem ? "system.range" : "range";
  return {
    ...(onItem ? {} : { "target.override": true, "range.override": true }),
    [`${target}.affects.type`]: tg.affectsType ?? "",
    [`${target}.affects.count`]: tg.count === "" || tg.count === null || tg.count === undefined ? "" : String(tg.count),
    [`${target}.template.type`]: tg.templateType ?? "",
    [`${target}.template.size`]: tg.templateType ? String(tg.size ?? "") : "",
    [`${target}.template.width`]: tg.templateType === "line" ? String(tg.width ?? "") : "",
    [`${target}.template.units`]: "ft",
    [`${range}.units`]: tg.rangeUnits ?? "",
    [`${range}.value`]: tg.rangeValue === null || tg.rangeValue === undefined ? "" : String(tg.rangeValue)
  };
}

/* Effects on outcomes (the sentence view's "+ effect") */

/** An effect added in the sentence view: a condition, an effect of the item, or a new one, for a branch */
export interface NewEffect {
  _id: string;
  /** The item's own effect it is (none: a new effect is made) */
  existing?: boolean;
  name: string;
  img?: string;
  statuses?: string[];
  /** Its changes (a common effect's) */
  changes?: readonly EffectChange[];
  duration?: { value: number, units: string };
  /** Ends when the creature succeeds on the applying save at the end of each of its turns */
  repeatSave?: boolean;
  branch: ActivityBranch;
}

/** The branch dnd5e applies an activity's own effects in: a failed save, a hit, each target */
export function mainBranch(type: string): ActivityBranch {
  return branchesOf(type)[0];
}

/** The activity's effects list after the card's edits: removed ones off, main-branch additions on, on-save switches */
export function activityEffects(data: ActivityData, edits: CardEdits): { _id: string, onSave?: boolean }[] {
  const removed = new Set(edits.removeEffects ?? []);
  const main = mainBranch(data.type);
  const list = (data.effects ?? []).filter(e => !removed.has(e._id)).map(e => ({ ...e }));
  for (const added of edits.newEffects ?? []) if (added.branch === main && !list.some(e => e._id === added._id)) list.push({ _id: added._id, onSave: false });
  for (const e of list) if (edits.effectsOnSave && e._id in edits.effectsOnSave) e.onSave = edits.effectsOnSave[e._id];
  return list;
}

/** The effect a new one is made as (an item effect, applied to the target, not to the item's owner) */
export function newEffectData(added: NewEffect): Record<string, unknown> {
  return {
    _id: added._id, name: added.name, img: added.img ?? "icons/svg/aura.svg", type: "base", transfer: false,
    statuses: added.statuses ?? [],
    ...(added.changes?.length ? { system: { changes: added.changes.map(c => ({ phase: "initial", ...c })) } } : {}),
    ...(added.duration ? { duration: { value: added.duration.value, units: added.duration.units } } : {}),
    flags: added.repeatSave ? { "midi-qol": { entries: [{ id: "repeatSave", on: "turnEnd", label: added.name, do: [{ save: "applying", then: [{ end: true }] }] }] } } : {}
  };
}

/** A branch other than the main one applies an effect by an entry action (dnd5e's onSave means "also", not "only") */
export function effectAction(added: NewEffect): EntryAction {
  return { effect: "apply", what: added._id, to: "target" };
}

/* Lingering areas (the sentence view's area line): midi's region rules read and written as groups */

export interface RegionRule { trigger: string, action: string, targetId: string }
/** "use": run an activity at these triggers; "whileIn": an effect applied on entering, removed on leaving */
export type AreaGroup = { kind: "use", targetId: string, triggers: string[] } | { kind: "whileIn", targetId: string };
export const AREA_TRIGGERS = ["entry", "turnStart", "turnEnd", "exit"];

/** The rules as groups; rules no group describes are kept as they are */
export function areaGroups(rules: readonly RegionRule[]): { groups: AreaGroup[], other: RegionRule[] } {
  const groups: AreaGroup[] = [];
  const other: RegionRule[] = [];
  const used = new Set<RegionRule>();
  for (const rule of rules) {
    if (used.has(rule)) continue;
    if (rule.action === "useActivity") {
      let group = groups.find((g): g is Extract<AreaGroup, { kind: "use" }> => g.kind === "use" && g.targetId === rule.targetId);
      if (!group) groups.push(group = { kind: "use", targetId: rule.targetId, triggers: [] });
      if (!group.triggers.includes(rule.trigger)) group.triggers.push(rule.trigger);
      used.add(rule);
    } else if (rule.action === "applyEffect" && rule.trigger === "entry") {
      const removal = rules.find(r => !used.has(r) && r !== rule && r.action === "removeEffect" && r.trigger === "exit" && r.targetId === rule.targetId);
      if (removal) { groups.push({ kind: "whileIn", targetId: rule.targetId }); used.add(rule); used.add(removal); }
      else { other.push(rule); used.add(rule); }
    } else { other.push(rule); used.add(rule); }
  }
  return { groups, other };
}

/** The groups (and the rules kept as they were) written back as rules */
export function areaRules(groups: readonly AreaGroup[], other: readonly RegionRule[] = []): RegionRule[] {
  const rules: RegionRule[] = [];
  for (const group of groups) {
    if (group.kind === "use") for (const trigger of AREA_TRIGGERS.filter(t => group.triggers.includes(t))) rules.push({ trigger, action: "useActivity", targetId: group.targetId });
    else rules.push({ trigger: "entry", action: "applyEffect", targetId: group.targetId }, { trigger: "exit", action: "removeEffect", targetId: group.targetId });
  }
  return [...rules, ...other];
}

/** A save activity the area runs, made for it: never offered on its own, never asking */
export function areaSaveActivity(id: string, name: string, spell: boolean): Record<string, unknown> {
  return {
    _id: id, type: "save", name,
    activation: { type: "", override: true },
    // The area decides who saves: no count of its own
    target: { override: true, affects: { type: "creature", count: "", choice: false }, template: { type: "", units: "ft" }, prompt: false },
    range: { override: true, units: "any" },
    save: { ability: ["dex"], dc: { calculation: spell ? "spellcasting" : "", formula: spell ? "" : "10" } },
    damage: { onSave: "half", parts: [] }, effects: [],
    midiProperties: { automationOnly: true, confirmTargets: "never", forceConsumeDialog: "never", otherActivityId: "none", otherActivityCompatible: false }
  };
}

/** The area chip's edits; groups as edited (a "new" target: a save activity made for the area when saved) */
export interface AreaEdits { enabled?: boolean, attach?: string, who?: number, oncePerTurn?: boolean, groups?: AreaGroup[], other?: RegionRule[] }

/** The activity's region behaviour after the area's edits */
export function editedRegion(rb: ActivityData["regionBehavior"], edits: AreaEdits | undefined): NonNullable<ActivityData["regionBehavior"]> {
  const current = { enabled: false, attachToken: "default", dispositionFilter: -1, oncePerTurn: true, rules: [] as RegionRule[], ...(rb ?? {}) };
  if (!edits) return current;
  const split = areaGroups(current.rules ?? []);
  return {
    ...current,
    ...(edits.enabled !== undefined ? { enabled: edits.enabled } : {}),
    ...(edits.attach !== undefined ? { attachToken: edits.attach } : {}),
    ...(edits.who !== undefined ? { dispositionFilter: edits.who } : {}),
    ...(edits.oncePerTurn !== undefined ? { oncePerTurn: edits.oncePerTurn } : {}),
    rules: areaRules(edits.groups ?? split.groups, edits.other ?? split.other)
  };
}

/* The basics (the sentence view's basics chip): activation, duration, concentration, limited uses */

export interface Basics {
  activation: string; activationValue: number | null;
  durationValue: string; durationUnits: string; concentration: boolean;
  /** "" no limit, "recharge", or a dnd5e use period (lr, sr, day...) */
  usesPeriod: string; usesMax: string; recharge: string;
}

/** Where each is kept: a spell's activity without its own reads the spell's; uses the item's when those are consumed */
export interface BasicsWhere {
  activationOnItem: boolean; durationOnItem: boolean; usesOnItem: boolean;
  /** The spell's properties (concentration is one) */
  itemProperties?: readonly string[];
  /** The activity's consumption targets (an activity given uses consumes them) */
  consumption?: readonly { type: string }[];
}

/** The updates for the edited basics, only the groups that changed: { activity paths, item paths } */
export function basicsUpdate(current: Basics, edited: Basics, where: BasicsWhere): { activity: Record<string, unknown>, item: Record<string, unknown> } {
  const activity: Record<string, unknown> = {};
  const item: Record<string, unknown> = {};
  const changed = (...keys: (keyof Basics)[]) => keys.some(k => current[k] !== edited[k]);
  if (changed("activation", "activationValue")) {
    if (where.activationOnItem) Object.assign(item, { "system.activation.type": edited.activation, "system.activation.value": edited.activationValue });
    else Object.assign(activity, { "activation.type": edited.activation, "activation.value": edited.activationValue, "activation.override": true });
  }
  if (changed("durationValue", "durationUnits")) {
    if (where.durationOnItem) Object.assign(item, { "system.duration.value": edited.durationValue, "system.duration.units": edited.durationUnits });
    else Object.assign(activity, { "duration.value": edited.durationValue, "duration.units": edited.durationUnits, "duration.override": true });
  }
  if (changed("concentration")) {
    if (where.durationOnItem) {
      const props = (where.itemProperties ?? []).filter(p => p !== "concentration");
      item["system.properties"] = edited.concentration ? [...props, "concentration"] : props;
    } else Object.assign(activity, { "duration.concentration": edited.concentration, "duration.override": true });
  }
  if (changed("usesPeriod", "usesMax", "recharge")) {
    const at = where.usesOnItem ? "system.uses." : "uses.";
    const target = where.usesOnItem ? item : activity;
    if (!edited.usesPeriod) Object.assign(target, { [`${at}max`]: "", [`${at}recovery`]: [] });
    else if (edited.usesPeriod === "recharge") Object.assign(target, { [`${at}max`]: "1", [`${at}recovery`]: [{ period: "recharge", type: "recoverAll", formula: edited.recharge || "6" }] });
    else Object.assign(target, { [`${at}max`]: edited.usesMax || "1", [`${at}recovery`]: [{ period: edited.usesPeriod, type: "recoverAll" }] });
    // Uses only count down when the activity consumes them
    const kind = where.usesOnItem ? "itemUses" : "activityUses";
    if (edited.usesPeriod && !(where.consumption ?? []).some(c => c.type === kind))
      activity["consumption.targets"] = [...(where.consumption ?? []), { type: kind, value: "1", target: "", scaling: { mode: "", formula: "" } }];
  }
  return { activity, item };
}

/* Starting from nothing (the sentence view's "+ add what it does"): an activity that already reads as a sentence */

export const NEW_KINDS = ["attack", "save", "damage", "healing", "self", "area"] as const;
export type NewKind = typeof NEW_KINDS[number];

/** The activity (and the effect it applies, for "an effect on yourself") a kind starts as; a spell's uses spell DC and attacks */
export function newActivityData(kind: NewKind, ids: { activity: string, effect: string, save: string }, item: { name: string, spell: boolean, img?: string }):
  { activities: Record<string, unknown>[], effects: Record<string, unknown>[] } {
  // Its own activation, targeting and range (on a spell, dnd5e otherwise reads the spell's)
  const base = { _id: ids.activity, activation: { type: "action", override: true }, consumption: { spellSlot: true, targets: [] } };
  const one = (range: string) => ({ target: { override: true, affects: { type: "creature", count: "1" }, template: { type: "" } }, range: { override: true, units: "ft", value: range } });
  const dc = item.spell ? { calculation: "spellcasting", formula: "" } : { calculation: "", formula: "13" };
  const die = (number: number, denomination: number, types: string[]) => ({ number, denomination, bonus: "", types, custom: { enabled: false, formula: "" }, scaling: { mode: "", number: null } });
  switch (kind) {
    case "attack": return { activities: [{ ...base, ...one(item.spell ? "120" : "5"), type: "attack",
      attack: { type: { value: item.spell ? "ranged" : "melee", classification: item.spell ? "spell" : "weapon" } },
      damage: { includeBase: !item.spell, parts: item.spell ? [die(1, 10, ["fire"])] : [] } }], effects: [] };
    case "save": return { activities: [{ ...base, ...one("60"), type: "save", save: { ability: ["dex"], dc }, damage: { onSave: "half", parts: [die(2, 6, ["fire"])] } }], effects: [] };
    case "damage": return { activities: [{ ...base, ...one("60"), type: "damage", damage: { parts: [die(1, 6, ["force"])] } }], effects: [] };
    case "healing": return { activities: [{ ...base, ...one("5"), type: "heal", target: { override: true, affects: { type: "ally", count: "1" }, template: { type: "" } }, healing: die(1, 8, ["healing"]) }], effects: [] };
    case "self": return {
      activities: [{ ...base, type: "utility", target: { override: true, affects: { type: "self" }, template: { type: "" } }, range: { override: true, units: "self" }, effects: [{ _id: ids.effect }] }],
      effects: [{ _id: ids.effect, name: item.name, img: item.img ?? "icons/svg/aura.svg", type: "base", transfer: false, statuses: [], duration: { value: 1, units: "minutes" } }]
    };
    case "area": return {
      activities: [
        { ...base, type: "utility", name: item.name, target: { override: true, affects: { type: "creature" }, template: { type: "sphere", size: "20", units: "ft" } }, range: { override: true, units: "ft", value: "60" },
          duration: { override: true, value: "1", units: "minute", concentration: item.spell }, regionBehavior: { enabled: true, attachToken: "default", dispositionFilter: -1, oncePerTurn: true,
            rules: areaRules([{ kind: "use", targetId: ids.save, triggers: ["entry", "turnEnd"] }]) } },
        { ...areaSaveActivity(ids.save, `${item.name}: Save`, item.spell), damage: { onSave: "half", parts: [die(2, 6, ["fire"])] } }],
      effects: []
    };
  }
}

/* midi's on-use macros (flags.midi-qol.onUseMacroName: "[postActiveEffects]ItemMacro,[preItemRoll]My Macro") */

export interface OnUseRow { macroName: string, option: string }

export function parseOnUse(value: unknown): OnUseRow[] {
  if (typeof value !== "string") return [];
  return value.split(",").map(s => s.trim()).filter(Boolean).map(s => {
    const m = /^(?:\[(.*?)\])?(.*)$/.exec(s)!;
    return { option: m[1]?.trim() || "postActiveEffects", macroName: m[2].trim() };
  });
}

export function onUseString(rows: readonly OnUseRow[]): string {
  return rows.filter(r => r.macroName.trim()).map(r => `[${r.option || "postActiveEffects"}]${r.macroName.trim()}`).join(",");
}
