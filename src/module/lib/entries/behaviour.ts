import type { Entry, EntryAction, EntryWho } from "./types.js";

/*
 * What an item does, arranged by how each behaviour starts (the item view's model:
 * ~/Documents/midi-next-item-view-redesign-2026-11-27.md). Built from the item as stored, not from where each part is
 * kept:
 *   uses        activities a player chooses, each with what is added at its steps and the activities it launches
 *   reactions   reaction activities, and entries offered as a reaction
 *   triggers    what happens when something happens to or near the owner; options the owner may add to another use
 *   bonuses     what is added to, or offered on, the owner's rolls
 *   effects     each effect: its rows (bonuses, triggers, buttons, statements) and what it launches
 *   always      rules statements and buttons of the item itself
 *   anyUse      steps added to every use of the item (with one chosen activity they are that use's steps)
 *   unreached   activities no player can choose and nothing launches
 * A follow-on activity (one only automation uses) is nested in whatever launches it; one a player can also choose is
 * a link there. Nothing here words anything: rows name their entry, the view words them.
 *
 * Pure: no Foundry.
 */

/** An activity as the model reads it (from the stored item: `behaviourItem`) */
export interface BehaviourActivity {
  id: string;
  type: string;
  name?: string;
  identifier?: string;
  /** The identifier set on it (not one made from its name) */
  explicitIdentifier?: string;
  /** dnd5e's activation type: action, bonus, reaction, legendary, special... */
  activation?: string;
  /** What a reaction answers (its use condition) */
  condition?: string;
  automationOnly?: boolean;
  /** Then: the activity it triggers */
  then?: string;
  /** The other activity rolled with it */
  other?: string;
  /** forward: the activity it uses */
  forward?: string;
  /** Its area's rules that use an activity: on entering, a turn there... */
  areaRules?: { trigger: string, activity: string }[];
  /** A barrier's side: the activity used on those near it */
  side?: string;
  /** Ids of the item's effects it applies */
  applies?: string[];
  /** enchant: activities its enchantment gives the enchanted item (dnd5e's riders) */
  riders?: string[];
  /** Whether it may be rolled as another activity's other activity; `other` unset on an attack: midi pairs one by itself */
  otherCompatible?: boolean;
  otherUnset?: boolean;
  /** Its own macro's code */
  macro?: string;
  entries?: Entry[];
}

export interface BehaviourEffect {
  id: string;
  name: string;
  /** On the item's owner while they have the item */
  transfer?: boolean;
  type?: string;
  entries?: Entry[];
  /** Activities its over-time changes use (ActivityOverTime) */
  overTime?: string[];
  /** midi's optional bonuses among its changes (flags.midi-qol.optional.NAME.*), one per name */
  optionalBonuses?: OptionalBonus[];
  /** Whether it has OverTime changes of its own (a roll or damage each turn, not an activity) */
  hasOverTime?: boolean;
  /** Its changes run a macro (macro.*, an onUse macro) */
  runsMacro?: boolean;
}

/** One roll an optional bonus applies to: `attack.all`, `save.fail.dex`, `acOnHit`... */
export interface OptionalBonusRoll {
  selector: string;
  /** attack, damage, save, check, skill, ac, acOnHit, acOnAttack... */
  roll: string;
  /** Only after the roll failed or succeeded (`save.fail.all`) */
  outcome?: "fail" | "success";
  /** Which of them: all, an action type (mwak), an ability or a skill */
  which?: string;
  /** What it adds or does: a formula, `reroll`, `reroll-kh`, `success`... */
  value: string;
}
/** An effect's optional bonus (flags.midi-qol.optional.NAME.*): its changes read as one bonus */
export interface OptionalBonus {
  name: string;
  label?: string;
  /** How often: a number, `every`, `reaction`, `turn`, `ItemUses.<item>`, a resource path... */
  count?: string;
  countAlt?: string;
  /** Offered only if this holds */
  condition?: string;
  /** Taken without asking if this holds */
  force?: string;
  criticalDamage?: boolean;
  macro?: string;
  rolls: OptionalBonusRoll[];
}

export interface BehaviourItem {
  name: string;
  type?: string;
  activities: BehaviourActivity[];
  effects: BehaviourEffect[];
  /** The item's own entries, and a rule's or overlay's for it */
  entries?: Entry[];
  /** The item's macro's code */
  macro?: string;
  /** It runs macros by name (onUse macros), or a module's code automates it: something unseen may use its activities */
  unseen?: boolean;
  /** Ammunition: the weapon firing it uses its activities */
  ammunition?: boolean;
}

export type RowKind = "step" | "reaction" | "trigger" | "option" | "bonus" | "statement" | "button";
export type Watch = "owner" | "bearer" | "origin" | "near" | "this";
export type LaunchVia = "then" | "other" | "forward" | "area" | "side" | "entry" | "overTime" | "rider" | "macro";

export interface RowSource { home: "item" | "activity" | "effect", homeId?: string, entryId: string }

/** One entry, placed */
export interface Row {
  source: RowSource;
  entry: Entry;
  kind: RowKind;
  /** A use's step it acts at (the first of its events that is one), in the order steps run */
  step?: string;
  /** Whom it watches: the owner's uses and what happens to them, an effect's bearer or caster, creatures near */
  watch: Watch;
  /** It replaces an outcome (damage changed or sent elsewhere, the attack retargeted, the use failed): "instead" */
  replaces: boolean;
  /** Activities its actions use */
  launches: Launch[];
}

/** An activity used by something: nested when only automation uses it, else a link to its own block */
export interface Launch {
  via: LaunchVia;
  activityId: string;
  /** Area rules: when (entry, turnEnd...) */
  when?: string;
  /** Its block, when nested here (absent: a link to a chosen activity's own block, or `repeat`: nested elsewhere already) */
  use?: UseNode;
  repeat?: boolean;
  /** No activity of the item matches the reference */
  missing?: boolean;
  /** Paired by midi itself (an attack with no other activity set, one candidate), by the world's default */
  auto?: boolean;
}

export interface UseNode {
  activityId: string;
  /** What is added at its steps, in step order */
  steps: Row[];
  /** What it launches itself: Then, the other activity, a forward, its area's rules, a barrier's side */
  launches: Launch[];
  /** Ids of the effects it applies */
  applies: string[];
}

export interface ReactionNode {
  /** A reaction activity: its trigger is its condition, its response its use */
  use?: UseNode;
  /** An entry offered as a reaction */
  row?: Row;
}

export interface EffectNode {
  effectId: string;
  /** Activities that apply it */
  appliedBy: string[];
  rows: Row[];
  /** Activities its over-time changes use */
  launches: Launch[];
}

export interface BehaviourModel {
  uses: UseNode[];
  reactions: ReactionNode[];
  triggers: Row[];
  bonuses: Row[];
  effects: EffectNode[];
  always: Row[];
  anyUse: Row[];
  unreached: UseNode[];
  /** Activities the item's own macro names (it may use them) */
  macro: Launch[];
  /** The item or one of its activities has a macro, or code elsewhere automates it: it may use what nothing here is seen to */
  hasMacro: boolean;
  /** Ammunition: the weapon firing it uses its activities */
  ammunition: boolean;
}

/** A use's steps, in the order they run */
export const USE_STEPS = ["use.configure", "use.targeted", "use.attack", "use.hit", "use.target.hit", "use.missed", "use.target.missed",
  "use.damageRoll", "use.damageRolled", "use.saves", "use.target.saveFailed", "use.target.saveSucceeded", "use.target.each",
  "use.effects", "use.end", "use.completed"] as const;

/** Activation types with a time of their own: never another activity's other activity (activityPrototype's OWN_TIME) */
const OWN_TIME = new Set(["bonus", "reaction", "minute", "hour", "day", "longRest", "shortRest", "encounter", "turnStart", "turnEnd", "legendary", "mythic", "lair"]);
const STATEMENTS = new Set(["cover", "perception"]);
/** Actions that replace an outcome rather than add to it */
const REPLACING = new Set(["damageChange", "retarget", "fails", "transfer"]);
const NOT_ACTION_KEYS = new Set(["if", "label", "for", "to", "then", "else", "rolls", "id", "type", "what"]);
const ACTIVITY_REF = "activity:";

const events = (entry: Entry): string[] => [entry.on ?? []].flat().filter(e => typeof e === "string");
const isUseEvent = (event: string) => event.startsWith("use.");
const isRollEvent = (event: string) => event.startsWith("roll.");

/** An action's kind: its first key that isn't a qualifier */
export function actionKind(action: EntryAction): string | undefined {
  return Object.keys(action).find(key => !NOT_ACTION_KEYS.has(key));
}

function walkActions(actions: EntryAction[] | undefined, visit: (action: EntryAction) => void): void {
  for (const action of actions ?? []) {
    if (!action || typeof action !== "object") continue;
    visit(action);
    walkActions(action.then, visit);
    walkActions(action.else, visit);
  }
}

const refOf = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !value) return undefined;
  if (value.startsWith(ACTIVITY_REF)) return value.slice(ACTIVITY_REF.length) || undefined;
  return value;
};

/** The activities an entry's actions use: `use`, a save or check of an activity, and the activity that is its cost */
export function entryActivityRefs(entry: Entry): string[] {
  const refs: string[] = [];
  walkActions(entry.do, action => {
    const use = action.use;
    if (typeof use === "string") refs.push(refOf(use) ?? "");
    else if (use && typeof use === "object" && typeof (use as { activity?: unknown }).activity === "string") refs.push(refOf((use as { activity: string }).activity) ?? "");
    for (const key of ["save", "check"]) {
      const value = action[key];
      if (typeof value === "string" && value.startsWith(ACTIVITY_REF)) refs.push(value.slice(ACTIVITY_REF.length));
    }
  });
  if (entry.activity) refs.push(entry.activity);
  return [...new Set(refs.filter(Boolean))];
}

/** `use.activity.id === 'X'` as a whole condition, or one `&&` piece of it: the activity, and the rest */
const NAMES_ACTIVITY = /^\s*use\.activity\??\.id\s*===?\s*(['"])([^'"]+)\1\s*(?:&&\s*([\s\S]+))?$/;
export function namedActivity(condition: string | undefined): { activity: string, rest?: string } | undefined {
  const found = NAMES_ACTIVITY.exec(condition ?? "");
  return found ? { activity: found[2], ...(found[3]?.trim() ? { rest: found[3].trim() } : {}) } : undefined;
}

function watchOf(who: EntryWho | EntryWho[] | undefined, home: RowSource["home"]): Watch {
  const first = Array.isArray(who) ? who[0] : who;
  if (first && typeof first === "object") return "near";
  if (first === "owner" || first === "bearer" || first === "origin" || first === "this") return first;
  return home === "effect" ? "bearer" : "this";
}

/** What kind of row an entry is, and the step it acts at when it is a step of a use */
export function classify(entry: Entry, home: RowSource["home"]): { kind: RowKind, step?: string } {
  const on = events(entry);
  const step = USE_STEPS.find(s => on.includes(s));
  if (on.includes("action")) return { kind: "button" };
  if (on.some(e => STATEMENTS.has(e))) return { kind: "statement" };
  if (entry.offer === "reaction") return { kind: "reaction" };
  if (entry.offer === "casting") return { kind: "option", ...(step ? { step } : {}) };
  if (on.length && on.every(isRollEvent)) return { kind: "bonus" };
  const watch = watchOf(entry.who, home);
  if (on.some(isUseEvent)) {
    // The owner's uses of other things: chosen as one starts, an option; else something that happens when they act
    if (watch === "owner") return step === "use.configure" && entry.offer === "ask" ? { kind: "option", step } : { kind: "trigger", ...(step ? { step } : {}) };
    if (home !== "effect" && watch === "this") return { kind: "step", ...(step ? { step } : {}) };
  }
  return { kind: "trigger", ...(step ? { step } : {}) };
}

class Builder {
  readonly byRef = new Map<string, BehaviourActivity>();
  /** Activities something launches */
  readonly launched = new Set<string>();
  /** Follow-ons already drawn: each is nested once, where it is first launched; a later launch refers to it */
  readonly nested = new Set<string>();

  constructor(readonly item: BehaviourItem) {
    // By id first, then identifier, then name (as midi resolves a reference: entryActivity)
    for (const key of ["id", "identifier", "name"] as const)
      for (const activity of item.activities) {
        const ref = activity[key];
        if (ref && !this.byRef.has(ref)) this.byRef.set(ref, activity);
      }
  }

  /** Chosen by a player: not automation only (a reaction is chosen when its trigger comes) */
  chosen(activity: BehaviourActivity): boolean {
    return !activity.automationOnly;
  }

  /** The other activity midi pairs with an attack that names none: a sole automation-only candidate, else a sole candidate */
  autoOther(activity: BehaviourActivity): BehaviourActivity | undefined {
    if (activity.type !== "attack" || !activity.otherUnset) return undefined;
    const sole = (filter: (a: BehaviourActivity) => boolean) => {
      const options = this.item.activities.filter(a => a !== activity && filter(a) && a.otherCompatible !== false && a.type !== "check" && !OWN_TIME.has(a.activation ?? ""));
      return options.length === 1 ? options[0] : undefined;
    };
    return sole(a => !!a.automationOnly) ?? sole(() => true);
  }

  /** Activities a macro's code names, by id, by their own identifier or by name in quotes */
  macroLaunches(code: string | undefined, above: ReadonlySet<string>, except?: string): Launch[] {
    if (!code) return [];
    const named = this.item.activities.filter(a => a.id !== except
      && [a.id, a.explicitIdentifier, a.name].some(ref => !!ref && new RegExp(`["'\`]${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`).test(code)));
    return named.map(a => this.launch("macro", a.id, above));
  }

  launch(via: LaunchVia, ref: string, above: ReadonlySet<string>, when?: string): Launch {
    const activity = this.byRef.get(ref);
    if (!activity) return { via, activityId: ref, missing: true, ...(when ? { when } : {}) };
    this.launched.add(activity.id);
    const launch: Launch = { via, activityId: activity.id, ...(when ? { when } : {}) };
    if (this.chosen(activity)) return launch;
    if (above.has(activity.id) || this.nested.has(activity.id)) return { ...launch, repeat: true };
    this.nested.add(activity.id);
    return { ...launch, use: this.use(activity, above) };
  }

  /** `own`: the activity "this" means in the entry's actions (the entry's activity, or the one its condition names) */
  row(entry: Entry, source: RowSource, above: ReadonlySet<string>, own?: string): Row {
    const { kind, step } = classify(entry, source.home);
    let replaces = false;
    walkActions(entry.do, action => { if (REPLACING.has(actionKind(action) ?? "")) replaces = true; });
    return {
      source, entry, kind, ...(step ? { step } : {}), watch: watchOf(entry.who, source.home), replaces,
      launches: entryActivityRefs(entry).map(ref => this.launch("entry", ref === "this" && own ? own : ref, above))
    };
  }

  use(activity: BehaviourActivity, above: ReadonlySet<string> = new Set()): UseNode {
    const within = new Set([...above, activity.id]);
    const steps = (activity.entries ?? []).map(entry => this.row(entry, { home: "activity", homeId: activity.id, entryId: entry.id }, within, activity.id));
    const launches: Launch[] = [];
    if (activity.other) launches.push(this.launch("other", activity.other, within));
    else {
      const paired = this.autoOther(activity);
      if (paired) launches.push({ ...this.launch("other", paired.id, within), auto: true });
    }
    for (const rider of activity.riders ?? []) launches.push(this.launch("rider", rider, within));
    for (const rule of activity.areaRules ?? []) launches.push(this.launch("area", rule.activity, within, rule.trigger));
    if (activity.side) launches.push(this.launch("side", activity.side, within));
    if (activity.forward) launches.push(this.launch("forward", activity.forward, within));
    if (activity.then) launches.push(this.launch("then", activity.then, within));
    launches.push(...this.macroLaunches(activity.macro, within, activity.id));
    return { activityId: activity.id, steps, launches, applies: [...(activity.applies ?? [])] };
  }
}

const stepOrder = (row: Row) => { const at = USE_STEPS.indexOf(row.step as typeof USE_STEPS[number]); return at < 0 ? USE_STEPS.length : at; };
const inStepOrder = (rows: Row[]) => rows.map((row, at) => ({ row, at })).sort((a, b) => stepOrder(a.row) - stepOrder(b.row) || a.at - b.at).map(r => r.row);

export function buildBehaviour(item: BehaviourItem): BehaviourModel {
  const b = new Builder(item);
  const model: BehaviourModel = { uses: [], reactions: [], triggers: [], bonuses: [], effects: [], always: [], anyUse: [], unreached: [], macro: [],
    hasMacro: !!item.macro || !!item.unseen || item.activities.some(a => !!a.macro), ammunition: !!item.ammunition };
  const nodes = new Map<string, UseNode>();
  for (const activity of item.activities) {
    if (!b.chosen(activity)) continue;
    const node = b.use(activity);
    nodes.set(activity.id, node);
    if (activity.activation === "reaction") model.reactions.push({ use: node });
    else model.uses.push(node);
  }
  const none: ReadonlySet<string> = new Set();
  const place = (row: Row) => {
    switch (row.kind) {
      case "reaction": model.reactions.push({ row }); break;
      case "bonus": model.bonuses.push(row); break;
      case "statement": case "button": model.always.push(row); break;
      case "trigger": case "option": model.triggers.push(row); break;
      case "step": model.anyUse.push(row); break;
    }
  };
  // The item's own entries (and a rule's): one naming an activity is a step of that activity's use
  const itemSteps = new Map<string, Row[]>();
  for (const entry of item.entries ?? []) {
    const named = namedActivity(entry.if);
    const target = named ? b.byRef.get(named.activity) : undefined;
    const row = b.row(entry, { home: "item", entryId: entry.id }, target ? new Set([target.id]) : none, target?.id);
    if (target && (row.kind === "step" || (row.kind === "trigger" && row.watch === "this"))) {
      itemSteps.set(target.id, [...(itemSteps.get(target.id) ?? []), { ...row, kind: "step" }]);
    } else place(row);
  }
  for (const effect of item.effects) {
    const rows = (effect.entries ?? []).map(entry => b.row(entry, { home: "effect", homeId: effect.id, entryId: entry.id }, none));
    model.effects.push({
      effectId: effect.id,
      appliedBy: item.activities.filter(a => a.applies?.includes(effect.id)).map(a => a.id),
      rows,
      launches: (effect.overTime ?? []).map(ref => b.launch("overTime", ref, none))
    });
  }
  // An item with one activity a player chooses: a step on "every use" of the item is a step of that use
  if (nodes.size === 1 && model.anyUse.length) {
    const [only] = nodes.values();
    only.steps.push(...model.anyUse);
    model.anyUse = [];
  }
  // Steps a nested follow-on gets from the item's entries, then every node's steps in the order they run
  const visit = (node: UseNode) => {
    const extra = itemSteps.get(node.activityId);
    if (extra) { node.steps.push(...extra); itemSteps.delete(node.activityId); }
    node.steps = inStepOrder(node.steps);
    for (const launch of [...node.launches, ...node.steps.flatMap(row => row.launches)]) if (launch.use) visit(launch.use);
  };
  const rowsOf = (m: BehaviourModel) => [...m.triggers, ...m.bonuses, ...m.always, ...m.anyUse, ...m.reactions.flatMap(r => r.row ? [r.row] : []), ...m.effects.flatMap(e => e.rows)];
  model.macro = b.macroLaunches(item.macro, none);
  for (const node of nodes.values()) visit(node);
  for (const launch of [...rowsOf(model).flatMap(row => row.launches), ...model.effects.flatMap(e => e.launches), ...model.macro]) if (launch.use) visit(launch.use);
  for (const activity of item.activities) {
    if (b.chosen(activity) || b.launched.has(activity.id)) continue;
    const node = b.use(activity);
    visit(node);
    model.unreached.push(node);
  }
  model.anyUse = inStepOrder(model.anyUse);
  return model;
}

/* Reading the stored item */

/** A name as Foundry's `slugify` makes it */
const slug = (name: string) => name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

type Stored = Record<string, unknown>;
const record = (value: unknown): Stored => value && typeof value === "object" && !Array.isArray(value) ? value as Stored : {};
const text = (value: unknown): string | undefined => typeof value === "string" && value && value !== "none" ? value : undefined;
const entriesOf = (value: unknown): Entry[] => Array.isArray(value) ? value.filter(e => e && typeof e === "object" && typeof (e as Entry).id === "string") as Entry[] : [];

const OPTIONAL = /^flags\.midi-qol\.optional\.([^.]+)\.(.+)$/;
const OPTIONAL_META = new Set(["label", "count", "countAlt", "activation", "force", "criticalDamage", "macroToCall"]);

/** An effect's optional bonuses from its changes, one per name, in the order first met */
export function optionalBonuses(changes: readonly { key?: string, value?: unknown }[]): OptionalBonus[] {
  const byName = new Map<string, OptionalBonus>();
  for (const change of changes) {
    const found = OPTIONAL.exec(change.key ?? "");
    if (!found) continue;
    const [, name, rest] = found;
    const bonus = byName.get(name) ?? { name, rolls: [] };
    byName.set(name, bonus);
    const value = String(change.value ?? "");
    if (rest === "label") bonus.label = value;
    else if (rest === "count") bonus.count = value;
    else if (rest === "countAlt") bonus.countAlt = value;
    else if (rest === "activation") bonus.condition = value;
    else if (rest === "force") bonus.force = value;
    else if (rest === "criticalDamage") bonus.criticalDamage = !["", "0", "false"].includes(value);
    else if (rest === "macroToCall") bonus.macro = value;
    else if (!OPTIONAL_META.has(rest)) {
      const [roll, ...more] = rest.split(".");
      const outcome = more[0] === "fail" || more[0] === "success" ? more.shift() as "fail" | "success" : undefined;
      bonus.rolls.push({ selector: rest, roll, ...(outcome ? { outcome } : {}), ...(more.length ? { which: more.join(".") } : {}), value });
    }
  }
  return [...byName.values()];
}

/** The model's item from an item as stored (`item.toObject()`, or a pack's source); `extra`: a rule's or overlay's entries for the item */
export function behaviourItem(source: Stored, extra: Entry[] = []): BehaviourItem {
  const system = record(source.system);
  const midi = record(record(source.flags)["midi-qol"]);
  const activities = Object.entries(record(system.activities)).map(([key, raw]): BehaviourActivity => {
    const a = record(raw);
    const props = record(a.midiProperties);
    const region = record(a.regionBehavior);
    const barrier = record(a.regionBarrier);
    const rules = region.enabled && Array.isArray(region.rules) ? region.rules as { trigger?: string, action?: string, targetId?: string }[] : [];
    const name = text(a.name);
    // As midi identifies an activity: its own identifier, else its name as a slug, else its type's title (the type, near enough)
    const explicitIdentifier = text(props.identifier);
    const identifier = explicitIdentifier ?? slug(name ?? String(a.type ?? ""));
    const then = text(props.triggeredActivityId);
    const other = text(a.otherActivityId);
    const forward = text(record(a.activity).id);
    const side = barrier.enabled ? text(barrier.sideActivity) : undefined;
    const condition = text(a.useConditionText);
    const applies = Array.isArray(a.effects) ? (a.effects as { _id?: string }[]).flatMap(e => e?._id ? [e._id] : []) : [];
    const areaRules = rules.flatMap(rule => rule.action === "useActivity" && rule.targetId ? [{ trigger: rule.trigger ?? "", activity: rule.targetId }] : []);
    // CAT's placed area: the activities it uses on a creature entering or on its turn
    const placed = record(record(record(record(a.flags).cat).placed).region).activities;
    for (const p of Array.isArray(placed) ? placed as { id?: string, triggers?: string[] }[] : [])
      for (const trigger of p?.id ? (p.triggers?.length ? p.triggers : [""]) : []) areaRules.push({ trigger, activity: p.id! });
    const riders = a.type === "enchant" && Array.isArray(a.effects)
      ? (a.effects as { riders?: { activity?: string[] } }[]).flatMap(e => e?.riders?.activity ?? []) : [];
    const macro = text(record(a.macroData).command);
    return {
      id: text(a._id) ?? key, type: String(a.type ?? ""), ...(name ? { name } : {}), ...(identifier ? { identifier } : {}),
      ...(text(record(a.activation).type) ? { activation: text(record(a.activation).type) } : {}),
      ...(condition ? { condition } : {}), ...(props.automationOnly ? { automationOnly: true } : {}),
      ...(then ? { then } : {}), ...(other ? { other } : {}), ...(forward ? { forward } : {}), ...(side ? { side } : {}),
      ...(areaRules.length ? { areaRules } : {}), ...(applies.length ? { applies } : {}),
      ...(explicitIdentifier ? { explicitIdentifier } : {}), ...(riders.length ? { riders } : {}), ...(macro ? { macro } : {}),
      ...(props.otherActivityCompatible === false ? { otherCompatible: false } : {}),
      ...(a.type === "attack" && (a.otherActivityId === undefined || a.otherActivityId === null || a.otherActivityId === "") ? { otherUnset: true } : {}),
      ...(entriesOf(a.midiEntries).length ? { entries: entriesOf(a.midiEntries) } : {})
    };
  });
  const effects = (Array.isArray(source.effects) ? source.effects as Stored[] : []).map((e): BehaviourEffect => {
    const changes = [record(e.system).changes, e.changes].find(Array.isArray) as { key?: string, value?: unknown }[] | undefined ?? [];
    const overTime = changes.flatMap(c => c.key === "flags.midi-qol.ActivityOverTime" && typeof c.value === "string" ? [c.value.split(",")[0].trim()] : []).filter(Boolean);
    const optional = optionalBonuses(changes);
    const entries = entriesOf(record(record(e.flags)["midi-qol"]).entries);
    return {
      id: String(e._id ?? ""), name: String(e.name ?? ""), ...(e.transfer ? { transfer: true } : {}), ...(text(e.type) && e.type !== "base" ? { type: String(e.type) } : {}),
      ...(entries.length ? { entries } : {}), ...(overTime.length ? { overTime } : {}), ...(optional.length ? { optionalBonuses: optional } : {}),
      ...(changes.some(c => c.key === "flags.midi-qol.OverTime") ? { hasOverTime: true } : {}),
      ...(changes.some(c => /^macro\.|^flags\.midi-qol\.onUseMacroName$|^flags\.dnd5e\.DamageBonusMacro$/.test(c.key ?? "")) ? { runsMacro: true } : {})
    };
  });
  const flags = record(source.flags);
  const macro = text(record(record(flags.dae).macro).command) ?? text(record(record(flags.itemacro).macro).command);
  // onUse macros by name, CAT's or CPR's code: none of it is the item's own text to read
  const unseen = !!text(midi.onUseMacroName) || !!record(flags.cat).macros || !!record(flags["chris-premades"]).info
    || effects.some(e => e.runsMacro);
  const ammunition = source.type === "consumable" && record(system.type).value === "ammo";
  return {
    name: String(source.name ?? ""), ...(text(source.type) ? { type: String(source.type) } : {}), activities, effects, entries: [...entriesOf(midi.entries), ...extra],
    ...(macro ? { macro } : {}), ...(unseen ? { unseen: true } : {}), ...(ammunition ? { ammunition: true } : {})
  };
}
