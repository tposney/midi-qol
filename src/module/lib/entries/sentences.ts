import { ACTIVITY_REF } from "./activityActions.js";
import { actionKeyOf, actionSchema } from "./engine.js";
import type { Entry, EntryAction, EntryHome, EntryWho } from "./types.js";
import { contributedActionText, contributedEventText, contributedTriggerGroups } from "./editorServices.js";

/*
 * An entry read as a sentence (the entry editor's sentence view): "When the bearer is hit, if the attacker is the
 * caster, deal 1d6 necrotic damage to the target". A reading of the stored entry only: nothing here changes it.
 * Each part names what it shows (`focus`: the form field that edits it), so a view can send the user there.
 */

export type PartKind = "when" | "who" | "what";
export interface SentencePart { text: string, kind?: PartKind, focus?: string, code?: boolean }
export interface SentenceLine { indent: number, parts: SentencePart[] }
export interface EntrySentence { lines: SentenceLine[], options: string }

/** What a sentence needs to know of where the entry lives */
export interface SentenceContext {
  home: EntryHome;
  /** The item's activities, to name one by its id */
  activities?: { id: string, name?: string }[];
}

const has = (key: string) => !!game.i18n?.has(`midi-qol.Sentence.${key}`);
const say = (key: string, data: Record<string, unknown> = {}) => game.i18n?.format(`midi-qol.Sentence.${key}`, data as Record<string, string>) ?? key;
const text = (t: string): SentencePart => ({ text: t });
const dnd5e = () => (CONFIG as unknown as { DND5E?: Record<string, Record<string, { label?: string }>> }).DND5E ?? {};
const labelOf = (table: string, id: unknown) => {
  const label = dnd5e()[table]?.[String(id)]?.label;
  return label ? game.i18n?.localize(label) ?? String(id) : String(id);
};
const list = (items: string[], joiner: string) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${joiner} ${items.at(-1)}`;
const or = (items: string[]) => list(items, say("Or"));
const and = (items: string[]) => list(items, say("And"));

/** Events about a use (their subject is the use, not a creature) */
const USE_EVENT = (id: string) => id.startsWith("use.") || id === "cover" || id === "perception";

/** Conditions midi's samples use, by their exact text */
const CONDITIONS: Record<string, string> = {
  "tags.use.kind === 'spell'": "Spell",
  "!!tags.use.attack": "Attack",
  "tags.target.sizeRank >= 3": "LargeTarget",
  "event.actor?.uuid === entry.origin.actor?.uuid": "AttackerIsCaster",
  "use.activity.damage?.onSave === 'half'": "HalfOnSave",
  "!tags.use.area": "NotArea",
  "!!tags.use.area": "Area",
  "!!tags.use.spellSlot": "SpellSlot",
  "use.activity.range.units === 'touch'": "Touch",
  "targets.some(t => t.attributes.hp.value < t.attributes.hp.max)": "TargetHurt",
  "tags.use.targetsScale": "TargetsScale",
  "tags.use.costlyMaterial": "CostlyMaterial",
  "!tags.use.costlyMaterial": "NoCostlyMaterial"
};

/** The conditions offered as ready-made (the form's "add a common condition") */
export function conditionPresets(): { value: string, label: string }[] {
  return Object.entries(CONDITIONS).map(([value, key]) => ({ value, label: say(`Condition.${key}`) }));
}

/** An expression split at a top-level operator (nothing inside brackets or quotes) */
function splitTop(expression: string, operator: "&&" | "||"): string[] {
  const pieces: string[] = [];
  let depth = 0, quote = "", start = 0;
  for (let i = 0; i < expression.length; i++) {
    const c = expression[i];
    if (quote) { if (c === quote && expression[i - 1] !== "\\") quote = ""; continue; }
    if (c === "'" || c === '"' || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (depth === 0 && expression.startsWith(operator, i)) { pieces.push(expression.slice(start, i)); start = i + 2; i++; }
  }
  pieces.push(expression.slice(start));
  return pieces.map(piece => piece.trim()).filter(Boolean);
}

/** Whether one pair of brackets wraps the whole expression */
function wrapped(expression: string): boolean {
  if (!expression.startsWith("(") || !expression.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < expression.length; i++) {
    if (expression[i] === "(") depth++;
    else if (expression[i] === ")" && --depth === 0 && i < expression.length - 1) return false;
  }
  return true;
}

const quoted = (csv: string) => csv.split(",").map(k => k.trim().replace(/^['"]|['"]$/g, ""));

/** One simple condition in words, where midi knows it */
function conditionWords(piece: string): string | undefined {
  const known = CONDITIONS[piece];
  if (known) return say(`Condition.${known}`);
  const kinds = /^\[([^\]]+)\]\.includes\(event\.kind\)$/.exec(piece);
  if (kinds) return say("Condition.RollKinds", { kinds: or(quoted(kinds[1])) });
  const cls = /^tags\.use\.class === '(\w+)'$/.exec(piece);
  if (cls) return say("Condition.Class", { name: cls[1] });
  const types = /^\[([^\]]+)\]\.some\(\w+ => tags\.use\.damageTypes\.has\(\w+\)\)$/.exec(piece);
  if (types) return say("Condition.DealsTypes", { types: or(quoted(types[1]).map(t => labelOf("damageTypes", t))) });
  const taken = /^\(event\.damage\?\.applied\?\.(\w+) \?\? 0\) > 0$/.exec(piece);
  if (taken) return say("Condition.TakesType", { type: labelOf("damageTypes", taken[1]) });
  if (piece === "!!event.use?.activity?.hasDamage") return say("Condition.DealsDamage");
  return undefined;
}

/**
 * A condition in words: its `&&` / `||` structure followed, each simple piece in words where midi knows it and as
 * written where it doesn't. `known`: whether any piece was put in words.
 */
function conditionText(expression: string, nested = false): { text: string, known: boolean } {
  let e = expression.trim();
  while (wrapped(e)) e = e.slice(1, -1).trim();
  for (const [operator, joiner] of [["||", say("Or")], ["&&", say("And")]] as const) {
    const pieces = splitTop(e, operator);
    if (pieces.length < 2) continue;
    const parts = pieces.map(piece => conditionText(piece, true));
    const joined = parts.map(p => p.text).join(` ${joiner} `);
    return { text: nested ? `(${joined})` : joined, known: parts.some(p => p.known) };
  }
  const words = conditionWords(e);
  return { text: words ?? e, known: !!words };
}

/** A condition as a part: in words where midi knows any of it, else as written */
function condition(expression: string, focus: string): SentencePart[] {
  const { text: words, known } = conditionText(expression);
  return [{ text: words, kind: "who", focus, ...(known ? {} : { code: true }) }];
}

/** A formula's midi references in words ("@entry.origin.dc" → "the caster's save DC") */
export function friendlyFormula(formula: unknown): string {
  return String(formula)
    .replace(/@entry\.origin\.dc\b/g, say("Ref.OriginDc"))
    .replace(/@entry\.origin\.spellLevel\b/g, say("Ref.OriginSpellLevel"))
    .replace(/@entry\.counts\.(\w+)/g, (_m, name) => say("Ref.Count", { name }))
    .replace(/@choices\.(\w+)/g, (_m, name) => choiceNames.has(name) ? `(${choiceText(name)})` : say("Ref.Choice", { name }))
    .replace(/@item\.level\b/g, say("Ref.ItemLevel"))
    // a reference already in brackets keeps one pair
    .replace(/\(\(([^()]*)\)\)/g, "($1)");
}

function subject(who: EntryWho | undefined, home: EntryHome, forUse: boolean): string {
  if (who && typeof who === "object" && !Array.isArray(who)) {
    const within = who.within === "reach" ? say("Subject.reach") : say("Subject.feet", { n: who.within });
    const of = say(`Subject.${who.of === "origin" ? "origin" : "bearer"}`);
    return say(forUse ? "Use.near" : "Subject.near", { within, of });
  }
  const role = typeof who === "string" ? who : home === "effect" ? "bearer" : "this";
  if (forUse) return say(role === "this" ? `Use.this.${home === "activity" ? "activity" : "item"}` : `Use.${role}`);
  // A creature's event on an item or activity is its owner's
  return say(`Subject.${role === "this" ? "owner" : role}`);
}

/** The trigger of one event for a who: "the bearer is hit", "this activity's use hits" */
export function triggerText(eventId: string, who: EntryWho | undefined, home: EntryHome): string {
  const s = subject(who, home, USE_EVENT(eventId));
  const contributed = contributedEventText(eventId, s, home);
  if (contributed) return contributed;
  if (!has(`Event.${eventId}`)) return eventId;
  return say(`Event.${eventId}`, { s });
}

function whoText(who: EntryWho | EntryWho[] | undefined, home: EntryHome): string {
  return or([who ?? []].flat().map(w => subject(w, home, false)));
}

/** Whose "self" a sentence is being written for (an effect's bearer, else the owner) */
let selfHome: EntryHome = "item";
/** Whether the entry runs at a use's events: its damage and healing go to the use's targets by default, else to self */
let atUse = false;
/** The entry's own choice of targets by its key (the entry's id), named from its label ("Careful Spell: protected creatures") */
let choiceNames = new Map<string, string>();

/** A choice's name for the sentence: its label after any "<feature>: " prefix */
export function choiceName(label: unknown): string | undefined {
  if (typeof label !== "string" || !label.trim()) return undefined;
  const at = label.lastIndexOf(": ");
  return (at >= 0 ? label.slice(at + 2) : label).trim() || undefined;
}
const choiceText = (id: string) => choiceNames.has(id) ? say("To.choiceNamed", { name: choiceNames.get(id) }) : say("To.choice", { name: id });
const target = (to: unknown, fallback: string) => {
  const id = typeof to === "string" && to ? to : fallback;
  if (id === "self") return say(selfHome === "effect" ? "Subject.bearer" : "Subject.owner");
  return has(`To.${id}`) ? say(`To.${id}`) : choiceText(id);
};
/** "DC 15", or a formula's words ("the caster's save DC") */
const dcText = (dc: unknown) => Number.isNumeric(dc) ? say("Dc", { dc }) : friendlyFormula(dc ?? "?");
const rolls = (value: unknown) => {
  const kinds = [value ?? []].flat().map(String);
  return kinds.length ? or(kinds.map(k => has(`Roll.${k}`) ? say(`Roll.${k}`) : k)) : say("Roll.any");
};

function activityName(ref: unknown, context: SentenceContext): string {
  const id = String(ref).startsWith(ACTIVITY_REF) ? String(ref).slice(ACTIVITY_REF.length) : String(ref);
  return context.activities?.find(a => a.id === id)?.name || id;
}

function rollSpec(spec: unknown, check: boolean, context: SentenceContext): string {
  if (typeof spec === "string" && spec.startsWith(ACTIVITY_REF)) return say(check ? "Action.checkActivity" : "Action.saveActivity", { activity: activityName(spec, context) });
  if (!spec || typeof spec !== "object") return say(check ? "Action.checkApplying" : "Action.saveApplying");
  const { ability, skill, dc } = spec as { ability?: string | string[], skill?: string | string[], dc?: unknown };
  const abilities = or([ability ?? []].flat().map(a => labelOf("abilities", a)));
  const skills = or([skill ?? []].flat().map(s => labelOf("skills", s)));
  return say(check ? "Action.check" : "Action.save", { ability: skills ? `${abilities} (${skills})` : abilities, dc: dcText(dc) });
}

/** What one action does, in words */
export function actionText(action: EntryAction, context: SentenceContext): string {
  const key = actionKeyOf(action);
  const a = action as Record<string, unknown>;
  const part = (value: unknown) => (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  // A module's wording first (entryWording)
  const contributed = contributedActionText(action, key, context);
  if (contributed) return contributed;
  switch (key) {
    case "damage":
      if (a.damage === "activity") return say("Action.damageActivity", { to: target(a.to, "target") });
      return say("Action.damage", { formula: friendlyFormula(a.damage), type: a.type ? labelOf("damageTypes", a.type) : "", to: target(a.to, atUse ? "target" : "self") }).replace(/\s+/g, " ");
    case "heal": return say("Action.heal", { formula: friendlyFormula(a.heal), to: target(a.to, atUse ? "target" : "self") });
    case "bonus": {
      const b = part(a.bonus);
      const kind = has(`Action.bonus.${b.kind}`) ? String(b.kind) : "other";
      return say(`Action.bonus.${kind}`, { formula: friendlyFormula(b.formula ?? ""), mode: b.mode ?? "", keep: b.keep ?? "", kind: b.kind ?? "", rolls: rolls(a.rolls) });
    }
    case "modifier": {
      const who = a.for ? ` ${say("For", { who: target(a.for, "self") })}` : "";
      return say(has(`Action.modifier.${a.modifier}`) ? `Action.modifier.${a.modifier}` : "Action.modifier.other", { modifier: a.modifier, value: a.value ?? "", rolls: rolls(a.rolls) }) + who;
    }
    case "damageChange": {
      const c = part(a.damageChange);
      const what = c.multiplier !== undefined ? say("Action.damageChange.multiplier", { n: friendlyFormula(c.multiplier) })
        : say(has(`Action.damageChange.${c.stage}`) ? `Action.damageChange.${c.stage}` : "Action.damageChange.other", { amount: friendlyFormula(c.amount ?? ""), stage: c.stage ?? "" });
      const types = Array.isArray(c.types) && c.types.length ? ` (${and(c.types.map(t => labelOf("damageTypes", t)))})` : "";
      return what + types + (a.for ? ` ${say("For", { who: target(a.for, "target") })}` : "");
    }
    case "transfer": {
      const t = part(a.transfer);
      const amount = t.amount === undefined || t.amount === "all" ? say("Action.transfer.all") : t.amount === "half" ? say("Action.transfer.half") : friendlyFormula(t.amount);
      return say(t.keep ? "Action.transfer.copy" : "Action.transfer.move", { amount, to: say(`Action.transfer.to.${has(`Action.transfer.to.${t.to}`) ? t.to : "origin"}`) });
    }
    case "retarget": {
      const r = typeof a.retarget === "string" ? { to: a.retarget } : part(a.retarget);
      return say(`Action.retarget.${has(`Action.retarget.${r.to}`) ? r.to : "choose"}`) + (r.orLose ? ` ${say("Action.retarget.orLose")}` : "");
    }
    case "effect": {
      const what = a.what && typeof a.what === "object" ? say("Action.effect.applied") : String(a.what ?? "?");
      return say(a.effect === "remove" ? "Action.effect.remove" : "Action.effect.apply", { what, to: target(a.to, "self") });
    }
    case "end": return say("Action.end");
    case "abort": return say("Action.abort", { reason: a.abort ? `: ${a.abort}` : "" });
    case "save": {
      const by = a.by ? `${target(a.by, "self")}: ` : "";
      const damage = a.damage ? ` ${say("Action.saveDamage", { formula: friendlyFormula(a.damage), type: a.type ? labelOf("damageTypes", a.type) : "" }).replace(/\s+/g, " ")}` : "";
      return by + rollSpec(a.save, false, context) + damage;
    }
    case "check": return (a.by ? `${target(a.by, "self")}: ` : "") + rollSpec(a.check, true, context);
    case "use": return say("Action.use", { activity: activityName(a.use, context) });
    case "move": {
      const m = part(a.move);
      const kind = m.pull !== undefined ? "pull" : m.slide !== undefined ? "slide" : "push";
      const from = say(`Action.move.from.${has(`Action.move.from.${m.from}`) ? m.from : "user"}`);
      return say(`Action.move.${kind}`, { who: target(a.to, "target"), n: friendlyFormula(m[kind] ?? "?"), from });
    }
    case "opportunityAttack": return say("Action.opportunityAttack");
    case "grantAttacks": {
      const g = part(a.grantAttacks);
      const filter = has(`Action.grantAttacks.filter.${g.filter}`) ? say(`Action.grantAttacks.filter.${g.filter}`) : String(g.filter ?? say("Action.grantAttacks.filter.weapon"));
      const kind = g.kind ? say(`Action.grantAttacks.kind.${g.kind}`) : say("Action.grantAttacks.kind.use");
      return say(g.spends ? "Action.grantAttacks.spends" : "Action.grantAttacks.free", { n: friendlyFormula(g.count ?? 1), filter, kind, spends: g.spends ? say(`Action.grantAttacks.kind.${g.spends}`) : "" });
    }
    case "cover":
      if (typeof a.cover === "string") return say("Action.cover.level", { level: say(`Cover.${a.cover}`) });
      return say("Action.cover.ignore", { levels: and([part(a.cover).ignore ?? []].flat().map(l => say(`Cover.${l}`))) });
    case "perception": return say(part(a.perception).invisible === false ? "Action.perception.noInvisible" : "Action.perception.other");
    case "state": return say("Action.state", { pairs: Object.entries(part(a.state)).map(([k, v]) => `${k} ${v}`).join(", ") });
    case "change": return say("Action.change", { what: Object.entries(part(a.change)).map(([k, v]) => {
      if (k === "damageDie") return say("Change.damageDieTo", { die: String(v) });
      if (k === "damageType") return say("Change.damageTypeTo", { from: or([part(v).from ?? []].flat().map(t => labelOf("damageTypes", t))), to: friendlyFormula(part(v).to ?? "?") });
      return `${has(`Change.${k}`) ? say(`Change.${k}`) : k} ${typeof v === "object" ? JSON.stringify(v) : friendlyFormula(v)}`;
    }).join(", ") });
    case "macro": {
      const name = typeof a.macro === "string" && a.macro.trim() ? a.macro.trim() : "ItemMacro";
      if (name === "ItemMacro") return say("Action.macroItem");
      if (name === "ActivityMacro") return say("Action.macroActivity");
      return say("Action.macro", { name: name.replace(/^Macro\./, "") });
    }
    case "table": {
      const found = part(part(a.table).find);
      if (typeof found.name === "string" && found.name) return say("Action.tableFind", { name: found.name });
      return say("Action.table", { formula: friendlyFormula(part(a.table).formula ?? "?") });
    }
    default: return key ? actionSchema(key).label : "?";
  }
}

function actionLines(actions: EntryAction[], indent: number, path: string | undefined, context: SentenceContext, lead?: string): SentenceLine[] {
  const lines: SentenceLine[] = [];
  actions.forEach((action, i) => {
    const at = path === undefined ? `${i}` : `${path}_${i}`;
    const parts: SentencePart[] = [];
    if (i === 0 && lead) parts.push(text(lead));
    else if (i > 0) parts.push(text(say("AndThen")));
    parts.push({ text: actionText(action, context), kind: "what", focus: `act.${at}.kind` });
    if (action.if) parts.push(text(say("If")), ...condition(action.if, `act.${at}.f.if`));
    lines.push({ indent, parts });
    const key = actionKeyOf(action);
    const rolled = key === "save" || key === "check";
    for (const branch of ["then", "else"] as const) {
      const nested = action[branch];
      if (Array.isArray(nested) && nested.length) lines.push(...actionLines(nested, indent + 1, `${at}_${branch}`, context, say(rolled ? `Branch.${branch}` : `Branch.other.${branch}`)));
    }
    const rows = key === "table" ? (action as { table?: { rows?: { range?: number[], label?: string, do?: EntryAction[] }[] } }).table?.rows : undefined;
    for (const row of rows ?? []) {
      const range = row.range ? (row.range[0] === row.range[1] ? `${row.range[0]}` : `${row.range[0]}–${row.range[1]}`) : "?";
      lines.push({ indent: indent + 1, parts: [text(say("TableRow", { range, label: row.label ?? "" }))] });
      (row.do ?? []).forEach((rowAction, n) => lines.push({ indent: indent + 2, parts: [{ text: actionText(rowAction, context), kind: "what", focus: `act.${at}_row${(rows ?? []).indexOf(row)}_${n}.kind` }] }));
    }
  });
  return lines;
}

/** An entry as a sentence */
export function entrySentence(entry: Entry, context: SentenceContext): EntrySentence {
  selfHome = context.home;
  const ownChoice = (entry as { choose?: { kind?: string, label?: unknown } }).choose;
  const ownName = entry.id ? choiceName(ownChoice?.label) : undefined;
  choiceNames = new Map(ownName && entry.id ? [[entry.id, ownName]] : []);
  const events = [entry.on ?? []].flat().filter(Boolean);
  atUse = events.length > 0 && events.every(id => USE_EVENT(id));
  const first: SentencePart[] = [];
  if (events.length === 1 && events[0] === "action") {
    first.push(text(say("Button")), { text: entry.label || entry.id, kind: "when", focus: "on" }, text(say("ForWho")), { text: whoText(entry.who, context.home), kind: "who", focus: "who" });
  } else {
    const who = Array.isArray(entry.who) ? entry.who[0] : entry.who;
    first.push(text(say("When")), { text: events.length ? or(events.map(id => triggerText(id, who, context.home))) : "?", kind: "when", focus: "on" });
  }
  if (entry.if) first.push(text(say("If")), ...condition(entry.if, "if"));
  const lines: SentenceLine[] = [{ indent: 0, parts: first }];
  if (entry.choose) {
    const choose = entry.choose as { kind?: string, max?: unknown, label?: string };
    lines.push({ indent: 0, parts: [text(say("Choose")), { text: say(has(`Choice.${choose.kind}`) ? `Choice.${choose.kind}` : "Choice.other", { max: friendlyFormula(choose.max ?? "?"), label: choose.label ?? "", kind: choose.kind ?? "" }), kind: "who", focus: "choose" }] });
  }
  lines.push(...actionLines(entry.do ?? [], 0, undefined, context));
  const options: string[] = [];
  if (entry.offer && has(`Offer.${entry.offer}`)) options.push(say(`Offer.${entry.offer}`));
  if (entry.activity) options.push(say("Cost", { activity: activityName(entry.activity, context) }));
  if (entry.cost) options.push(say("PoolCost", { n: String(entry.cost.amount), label: entry.cost.label ? (game.i18n?.localize(entry.cost.label) ?? entry.cost.label) : (entry.cost.from ?? []).join(", ") }));
  if (entry.limit?.per) options.push(say((entry.limit.max ?? 1) > 1 ? "LimitMany" : "LimitOnce", { n: entry.limit.max ?? 1, per: say(`Per.${entry.limit.per}`) }));
  if (entry.group) options.push(say(typeof entry.groupLimit === "number" ? "SomeOf" : entry.groupLimit ? "GroupByRule" : "OneOf", { group: entry.group, n: String(entry.groupLimit ?? 1) }));
  if (entry.stacks) options.push(say("Stacks"));
  return { lines, options: options.join(" · ") };
}

/** The triggers the picker offers where an entry lives: groups of (event, who) by what an author looks for */
export interface TriggerChoice { event: string, who?: string, label: string }
export interface TriggerGroup { label: string, choices: TriggerChoice[] }

const USE_EVENTS = ["use.configure", "use.targeted", "use.attack", "use.hit", "use.missed", "use.damageRoll", "use.damageRolled", "use.saves", "use.effects", "use.end"];
const ROLL_EVENTS = ["roll.preRoll", "roll.preResult", "roll.postResult"];
const HAPPENS = ["targeted", "attacked", "hit", "missed", "damaging", "damaged", "healing", "bloodied", "droppedToZero", "dies", "saveRequested", "saveFailed", "saveSucceeded"];
const DOES = ["attacks", "casts", "dealsDamage"];

export function triggerGroups(home: EntryHome, registered: readonly string[]): TriggerGroup[] {
  const known = new Set(registered);
  // A group that names the subject lists what happens to it ("is hit"); the others the whole trigger
  const short = (event: string, full: string) => {
    const template = game.i18n?.localize(`midi-qol.Sentence.Event.${event}`) ?? "";
    return template.startsWith("{s} ") ? template.slice(4) : full;
  };
  const group = (label: string, events: string[], who: string | undefined, keepWho = false, subjectNamed = true): TriggerGroup => ({
    label,
    choices: events.filter(id => known.has(id)).map(event => {
      const full = triggerText(event, who as EntryWho | undefined, home);
      return { event, ...(keepWho ? {} : { who: who ?? "" }), label: subjectNamed ? short(event, full) : full };
    })
  });
  const groups: TriggerGroup[] = [];
  if (home === "effect") {
    groups.push(group(say("Group.happens", { s: say("Subject.bearer") }), HAPPENS, undefined, true));
    groups.push(group(say("Group.does", { s: say("Subject.bearer") }), DOES, undefined, true));
    groups.push(group(say("Group.time"), ["turnStart", "turnEnd", "originTurnStart", "originTurnEnd", "roundStart", "ended"], undefined, true, false));
    groups.push(group(say("Group.use", { s: say("Use.bearer") }), USE_EVENTS, "bearer"));
    groups.push(group(say("Group.use", { s: say("Use.origin") }), USE_EVENTS, "origin"));
    groups.push(group(say("Group.rolls", { s: say("Subject.bearer") }), ROLL_EVENTS, undefined, true));
  } else {
    groups.push(group(say("Group.use", { s: subject("this", home, true) }), USE_EVENTS, "this"));
    if (home === "item") groups.push(group(say("Group.use", { s: say("Use.owner") }), USE_EVENTS, "owner"));
    groups.push(group(say("Group.rolls", { s: say("Subject.owner") }), ROLL_EVENTS, undefined, true));
    groups.push(group(say("Group.happens", { s: say("Subject.owner") }), HAPPENS, undefined, true));
    groups.push(group(say("Group.does", { s: say("Subject.owner") }), DOES, undefined, true));
    groups.push(group(say("Group.time"), ["turnStart", "turnEnd", "roundStart"], undefined, true, false));
  }
  groups.push(group(say("Group.other"), ["action", "cover", "perception"], undefined, true, false));
  // Modules' groups (entryTriggers): only events that are registered
  for (const added of contributedTriggerGroups(home, registered))
    groups.push({ label: added.label, choices: added.choices.filter(c => known.has(c.event)) });
  // Anything registered that no group names (a module's event)
  const grouped = new Set(groups.flatMap(g => g.choices.map(c => c.event)));
  const rest = registered.filter(id => !grouped.has(id) && (home === "effect" || !["ended", "originTurnStart", "originTurnEnd"].includes(id)));
  if (rest.length) groups.push(group(say("Group.more"), rest, undefined, true, false));
  return groups.filter(g => g.choices.length);
}
