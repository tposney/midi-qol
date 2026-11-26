import type { Workflow } from "../Workflow.js";
import { attackFlanked } from "../../rules/flanking/index.js";
import { getDistance } from "../services/distance/service.js";
import { findNearby } from "../utils.js";
import { outcomes } from "./outcomes.js";
import { chargeToward } from "./charge.js";
import { coverFor } from "../services/cover/service.js";

/*
 * Tags (M26; shapes ~/Documents/midi-next-waveB-shapes-2026-11-20.md): named facts about a use, and about a target where
 * they are about one, that conditions and entries read (`tags.target.size`). Each is a registered function; a module
 * adds its own and registering an existing name replaces what it means.
 * - derived: worked out from what the use keeps (its item, activity, rolls, results), the same whenever asked;
 * - snapshot: a point-in-time fact about the world no card keeps (the target was prone); fixed by the first read at or
 *   after the use's resolution (its attack roll, its saves, its damage) and stored on the card, so a rebuilt use and
 *   the use's later riders read what was true then.
 */

export type TagValue = boolean | number | string | ReadonlySet<string> | undefined;
export type TagGroup = "use" | "target" | "relation" | "result" | string;

export interface TagContext {
  workflow: Workflow;
  /** The target's TokenDocument, for a target, relation or result tag */
  target?: TokenDocument.Implementation;
}

export interface TagDefinition {
  group: TagGroup;
  label: string;
  kind: "snapshot" | "derived";
  /** Needs a target */
  perTarget?: boolean;
  compute: (context: TagContext) => TagValue;
}

interface RegisteredTag extends TagDefinition { name: string, source: string }

/** One stored snapshot (a list: tag names and uuids have dots, which an update reads as a path) */
export interface TagSnapshot { tag: string, target: string, value: boolean | number | string | string[] | null, set?: boolean }

const registry = new Map<string, RegisteredTag>();
const replaced: { name: string, source: string, by: string }[] = [];

export function registerTag(name: string, definition: TagDefinition, source = "midi-qol"): void {
  const previous = registry.get(name);
  if (previous && previous.source !== source) replaced.push({ name, source: previous.source, by: source });
  registry.set(name, { ...definition, name, source });
}

export function tagDefinition(name: string): Readonly<RegisteredTag> | undefined { return registry.get(name); }
export function tagNames(): string[] { return [...registry.keys()]; }
/** Tags a module replaced: midi's or another module's (for the TroubleShooter) */
export function replacedTags(): readonly { name: string, source: string, by: string }[] { return replaced; }

/** The use has reached the point its snapshot tags are fixed at: its attack roll, saves or damage roll */
export function useResolved(workflow: Workflow): boolean {
  return !!workflow.attackRoll || !!workflow.tokenSaves || !!workflow.damageRolls?.length;
}

function stored(value: TagValue): Pick<TagSnapshot, "value" | "set"> {
  if (value instanceof Set) return { value: [...value], set: true };
  return { value: value === undefined ? null : value as boolean | number | string };
}
function restored(snapshot: TagSnapshot): TagValue {
  if (snapshot.set && Array.isArray(snapshot.value)) return new Set(snapshot.value);
  return snapshot.value === null || Array.isArray(snapshot.value) ? undefined : snapshot.value;
}

/** A tag's value for a use (and target); undefined for an unknown tag or one that needs a target it wasn't given */
export function tagValue(workflow: Workflow, name: string, target?: TokenDocument.Implementation): TagValue {
  const tag = registry.get(name);
  if (!tag || (tag.perTarget && !target)) return undefined;
  const context: TagContext = { workflow, target };
  if (tag.kind === "derived") return tag.compute(context);
  const targetUuid = target?.uuid ?? "";
  const kept = workflow.tagSnapshots.find(snapshot => snapshot.tag === name && snapshot.target === targetUuid);
  if (kept) return restored(kept);
  const value = tag.compute(context);
  if (useResolved(workflow)) workflow.recordTagSnapshot({ tag: name, target: targetUuid, ...stored(value) });
  return value;
}

/**
 * The tags as condition data: `tags.target.size`, `tags.use.properties.has("hvy")`; each worked out when read.
 * Names are `group.name`; a deeper name (`my-module.marked.by`) nests.
 */
export function tagsView(workflow: Workflow, target?: TokenDocument.Implementation): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  for (const name of registry.keys()) {
    const parts = name.split(".");
    let node = view;
    for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as Record<string, unknown>;
    Object.defineProperty(node, parts.at(-1)!, { get: () => tagValue(workflow, name, target), enumerable: true, configurable: true });
  }
  return view;
}

/* midi's own tags */

const SIZE_ORDER = ["tiny", "sm", "med", "lg", "huge", "grg"];
const ATTACK_TYPES = new Set(["mwak", "rwak", "msak", "rsak"]);

function actorOf(context: TagContext) { return context.target?.actor ?? undefined; }

/** The identifiers of the user's items whose effects the target has (an effect's origin: the item, or one of its activities) */
function effectsFromUser(context: TagContext): Set<string> {
  const user = context.workflow.actor;
  const out = new Set<string>();
  for (const effect of actorOf(context)?.appliedEffects ?? []) {
    if (!effect.origin) continue;
    const origin = fromUuidSync(effect.origin, { strict: false }) as { item?: Item.Implementation, actor?: Actor.Implementation | null, system?: { identifier?: string } } | null;
    const item = origin instanceof Item ? origin : origin?.item;
    if (!item || item.actor !== user) continue;
    const identifier = (item.system as { identifier?: string }).identifier;
    if (identifier) out.add(identifier);
  }
  return out;
}
function itemOf(context: TagContext) { return context.workflow.item ?? undefined; }
/** The used item's type (dnd5e's subtypes aren't in the types) */
function itemType(context: TagContext): string | undefined { return itemOf(context)?.type; }

const SCALING_EXCLUDED = ["magic-missile", "scorching-ray", "chromatic-orb"];
type TargetSource = { override?: boolean, affects?: { count?: unknown }, template?: { type?: string } };

/**
 * A spell that gains a target when cast at a higher level: its target count is written in terms of the cast level (read
 * from the source: the prepared count is evaluated), it has no area, and it isn't a spell of several projectiles.
 * `flags.midi-qol.twinnable` on a spell overrides either way.
 */
function targetsScale(item: Item.Implementation | undefined): boolean {
  if (!item || (item.type as string) !== "spell") return false;
  const ruling = (item.flags as Record<string, { twinnable?: unknown } | undefined>)["midi-qol"]?.twinnable;
  if (typeof ruling === "boolean") return ruling;
  const system = item.system as { level?: number, identifier?: string };
  if (!system.level || SCALING_EXCLUDED.includes(system.identifier ?? "")) return false;
  const source = (item as unknown as { _source: { system: { target?: TargetSource, activities?: Record<string, { target?: TargetSource }> } } })._source.system;
  const targets = [source.target, ...Object.values(source.activities ?? {}).map(a => a.target?.override ? a.target : undefined)].filter((t): t is TargetSource => !!t);
  if (targets.some(t => t.template?.type)) return false;
  return targets.some(t => /@item\.level|@scaling/.test(String(t.affects?.count ?? "")));
}

function rolledDamageTypes(workflow: Workflow): Set<string> {
  const types = new Set<string>();
  for (const roll of [...(workflow.damageRolls ?? []), ...(workflow.otherDamageRolls ?? []), ...(workflow.bonusDamageRolls ?? [])]) {
    const type: unknown = roll.options?.type;
    if (typeof type === "string" && type) types.add(type);
  }
  if (!types.size) {
    for (const part of workflow.activity?.damage?.parts ?? []) for (const type of part.types ?? []) types.add(type);
  }
  return types;
}

export function registerMidiTags(): void {
  const target = (label: string, compute: TagDefinition["compute"]): TagDefinition => ({ group: "target", label, kind: "snapshot", perTarget: true, compute });
  const use = (label: string, compute: TagDefinition["compute"]): TagDefinition => ({ group: "use", label, kind: "derived", compute });
  const result = (label: string, compute: TagDefinition["compute"]): TagDefinition => ({ group: "result", label, kind: "derived", perTarget: true, compute });

  // @ts-expect-error no dnd5e-types
  const hp = (context: TagContext) => actorOf(context)?.system.attributes?.hp;
  registerTag("target.type", target("Creature type", context => {
    // @ts-expect-error no dnd5e-types
    const type = actorOf(context)?.system.details?.type?.value;
    return typeof type === "string" && type ? type : undefined;
  }));
  // @ts-expect-error no dnd5e-types
  registerTag("target.size", target("Size", context => actorOf(context)?.system.traits?.size));
  registerTag("target.sizeRank", target("Size rank (tiny 0 to gargantuan 5)", context => {
    // @ts-expect-error no dnd5e-types
    const rank = SIZE_ORDER.indexOf(actorOf(context)?.system.traits?.size ?? "");
    return rank < 0 ? undefined : rank;
  }));
  // Ram, Trampling Charge: the attacker's last straight run toward the target this turn (combat records the moves)
  registerTag("target.charge", target("Feet the user moved straight toward it just before", context =>
    chargeToward(context.workflow.token?.document as TokenDocument.Implementation | undefined, context.target)));
  registerTag("target.conditions", target("Conditions", context => new Set(actorOf(context)?.statuses ?? [])));
  // Superior Hunter's Prey: the target is marked by the user's Hunter's Mark (by the applying item's identifier)
  registerTag("target.fromUser", target("Identifiers of the user's items whose effects are on it", context => effectsFromUser(context)));
  registerTag("target.bloodied", target("Bloodied", context => {
    const points = hp(context);
    return points ? points.value <= points.max / 2 : undefined;
  }));
  registerTag("target.hpPercent", target("Hit points (percent)", context => {
    const points = hp(context);
    return points?.max ? Math.round(100 * points.value / points.max) : undefined;
  }));
  registerTag("target.armor", target("Armour worn", context => {
    // @ts-expect-error no dnd5e-types
    const armor = actorOf(context)?.system.attributes?.ac?.equippedArmor;
    return armor?.system?.type?.value ?? "none";
  }));
  // @ts-expect-error no dnd5e-types
  registerTag("target.shield", target("Shield", context => !!actorOf(context)?.system.attributes?.ac?.equippedShield));
  registerTag("target.concentrating", target("Concentrating", context => !!actorOf(context)?.statuses.has("concentrating")));

  registerTag("use.kind", use("Kind of use", context => {
    const type = itemType(context);
    return type === "weapon" ? "weapon" : type === "spell" ? "spell" : type === "feat" ? "feature" : type ? "item" : undefined;
  }));
  registerTag("use.attack", use("Attack (mwak, rwak, msak, rsak)", ({ workflow }) => {
    const type = workflow.activity?.actionType;
    return typeof type === "string" && ATTACK_TYPES.has(type) ? type : undefined;
  }));
  // @ts-expect-error no dnd5e-types
  registerTag("use.properties", use("Item properties", context => new Set(itemOf(context)?.system.properties ?? [])));
  // @ts-expect-error no dnd5e-types
  registerTag("use.mastery", use("Weapon mastery", context => itemOf(context)?.system.mastery || undefined));
  registerTag("use.damageTypes", use("Damage types", ({ workflow }) => rolledDamageTypes(workflow)));
  // @ts-expect-error no dnd5e-types
  registerTag("use.school", use("Spell school", context => itemOf(context)?.system.school || undefined));
  registerTag("use.spellLevel", use("Spell level as cast", context => itemType(context) === "spell" ? context.workflow.spellLevel : undefined));
  // @ts-expect-error no dnd5e-types
  registerTag("use.cantrip", use("Cantrip", context => itemType(context) === "spell" && itemOf(context)?.system.level === 0));
  registerTag("use.magical", use("Magical", context => {
    const item = itemOf(context);
    // @ts-expect-error no dnd5e-types
    return itemType(context) === "spell" || !!item?.system.properties?.has?.("mgc");
  }));
  // dnd5e 6 keeps the class as sourceItem ("class:wizard"; sourceClass migrated): its classIdentifier, which needs the
  // class on the actor, else the class the sourceItem names
  registerTag("use.class", use("Spellcasting class", context => {
    const system = itemOf(context)?.system as { classIdentifier?: string, sourceItem?: string, sourceClass?: string } | undefined;
    const named = system?.sourceItem?.startsWith("class:") ? system.sourceItem.slice("class:".length) : undefined;
    return system?.classIdentifier || named || system?.sourceClass || undefined;
  }));
  registerTag("use.activation", use("Activation (action, bonus, reaction...)", ({ workflow }) => {
    const type: unknown = workflow.activity?.activation?.type;
    return typeof type === "string" && type ? type : undefined;
  }));
  registerTag("use.statuses", use("Statuses the use's effects apply", ({ workflow }) => {
    const statuses = new Set<string>();
    const activity = workflow.activity;
    activity?.applicableEffects?.forEach(profile => {
      const effect = profile.uuid ? fromUuidSync(profile.uuid) : activity.item?.effects.get(profile._id ?? "");
      if (effect instanceof ActiveEffect) effect.statuses.forEach(status => statuses.add(status));
    });
    return statuses;
  }));
  registerTag("use.spellSlot", use("Spell slot level spent (0: none)", context => {
    const item = itemOf(context);
    if (itemType(context) !== "spell") return 0;
    // @ts-expect-error no dnd5e-types
    const { level, method } = item.system;
    const spendsSlot = context.workflow.activity?.consumption?.spellSlot !== false && ["spell", "pact"].includes(method);
    return level > 0 && spendsSlot ? context.workflow.spellLevel : 0;
  }));
  registerTag("use.healedOthers", use("Creatures other than the user the use restored hit points to", ({ workflow }) => {
    const own = workflow.tokenUuid;
    return [...outcomes(workflow).values()].filter(outcome => outcome.target !== own && (outcome.damage?.healed ?? 0) > 0).length;
  }));
  registerTag("use.area", use("Has an area", ({ workflow }) => !!workflow.activity?.target?.template?.type));
  // A reaction's use: the trigger it answers (isOpportunity, isCast, isHit...: doReactions sets it), else ""
  registerTag("use.reaction", use("The reaction trigger it answers (isOpportunity, isCast, isHit...)", ({ workflow }) => (workflow.workflowOptions as { reactionTrigger?: string } | undefined)?.reactionTrigger ?? ""));
  registerTag("use.targetsScale", use("A spell whose number of targets rises with the level cast", context => targetsScale(itemOf(context))));
  registerTag("use.costlyMaterial", use("A spell with a material component that has a cost or is consumed", context => {
    const materials = (itemOf(context)?.system as { materials?: { consumed?: boolean, cost?: number | string } } | undefined)?.materials ?? {};
    return itemType(context) === "spell" && (!!materials.consumed || Number(materials.cost) > 0);
  }));
  // M11 (the viability items' tags)
  registerTag("use.flanking", use("The attack is flanking (the flanking rule)", ({ workflow }) => attackFlanked(workflow)));
  registerTag("use.ammunition", use("The ammunition's identifier", ({ workflow }) => {
    // @ts-expect-error no dnd5e-types
    const identifier: unknown = workflow.ammunition?.system?.identifier;
    return typeof identifier === "string" && identifier ? identifier : undefined;
  }));
  registerTag("target.cover", target("Cover from the use (none, half, threeQuarters, total)", ({ workflow, target: targetDocument }) =>
    targetDocument && workflow.token ? coverFor(workflow.token, targetDocument, { activity: workflow.activity }).level : undefined));
  registerTag("target.flying", target("Flying (the fly status, or a hover/fly speed while not prone)", context => {
    const actor = actorOf(context);
    if (!actor) return undefined;
    if (actor.statuses.has("fly") || actor.statuses.has("flying")) return true;
    // @ts-expect-error no dnd5e-types
    const movement = actor.system.attributes?.movement as { fly?: number, hover?: boolean } | undefined;
    return !!movement?.hover && !!movement.fly && !actor.statuses.has("prone");
  }));

  registerTag("relation.distance", { group: "relation", label: "Distance to the target", kind: "derived", perTarget: true,
    compute: ({ workflow, target }) => workflow.token && target ? getDistance(workflow.token, target) : undefined });
  registerTag("relation.canSee", { group: "relation", label: "The actor sees the target", kind: "derived", perTarget: true,
    compute: ({ workflow, target }) => !!target?.object && workflow.tokenCanSee.has(target.object) });
  registerTag("relation.targetCanSee", { group: "relation", label: "The target sees the actor", kind: "derived", perTarget: true,
    compute: ({ workflow, target }) => !!target?.object && workflow.targetsCanSee.has(target.object) });
  registerTag("relation.alliesAdjacent", { group: "relation", label: "The actor's allies within 5 ft of the target (the actor excepted)", kind: "snapshot", perTarget: true,
    compute: ({ workflow, target }) => {
      const drawn = target?.object;
      const disposition = workflow.token?.document?.disposition;
      if (!drawn || disposition === undefined) return undefined;
      return findNearby(disposition, drawn, 5, { relative: false, includeIncapacitated: false })
        .filter(token => token.document !== workflow.token?.document && token.document !== target).length;
    } });
  registerTag("relation.sizeDifference", { group: "relation", label: "Target's size rank minus the actor's", kind: "snapshot", perTarget: true,
    compute: ({ workflow, target }) => {
      // @ts-expect-error no dnd5e-types
      const of = (actor: Actor.Implementation | null | undefined) => SIZE_ORDER.indexOf(actor?.system.traits?.size ?? "");
      const a = of(workflow.actor), t = of(target?.actor);
      return a < 0 || t < 0 ? undefined : t - a;
    } });

  const outcome = (context: TagContext) => context.target?.uuid ? outcomes(context.workflow).get(context.target.uuid) : undefined;
  registerTag("result.hit", result("Hit", context => outcome(context)?.attack?.hit));
  registerTag("result.critical", result("Critical", context => outcome(context)?.attack?.critical));
  registerTag("result.fumble", result("Fumble", context => outcome(context)?.attack?.fumble));
  registerTag("result.saved", result("Saved", context => outcome(context)?.save?.success));
  registerTag("result.damaged", result("Took damage", context => (outcome(context)?.damage?.hp ?? 0) > 0));
  registerTag("result.droppedToZero", result("Dropped to 0 hit points", context => outcome(context)?.damage?.droppedToZero));
}
