/*
 * Conditions as phrases. A condition is stored as it always was, an expression; a phrase is a known shape of
 * expression with places to fill ("the target is {type}" for `target.raceOrType.includes('{type}')`). An expression
 * is read into its `&&` / `||` pieces, each a phrase where one fits and code where none does, so the sentence view
 * words it and the condition builder edits it piece by piece; what no phrase fits is kept as written.
 *
 * A pattern is the expression with its places: '{name}' a quoted value, [{name}] a list of them, {name} a number (or,
 * for a slot that isn't a number, a bare word: a property's name).
 * Matching ignores spacing, the kind of quotes, `==` for `===`, optional chaining, a leading `!!` and what an arrow
 * function calls its parameter.
 *
 * Pure: no Foundry, no wording of its own (labels and the values' names are given).
 */

export type SlotValue = string | number | string[];
export interface PhraseOption { value: string, label: string }
export interface ConditionSlot {
  name: string;
  type: "select" | "multiselect" | "number" | "text";
  /** A named option list (the entry editor's lists: damageTypes, creatureTypes...) */
  list?: string;
  options?: readonly PhraseOption[];
  default?: SlotValue;
}
export interface ConditionPhraseDef {
  id: string;
  /** Where the builder lists it: use, target, subject, result, roll, or a module's own */
  group?: string;
  /** Its words, with {name} for each slot */
  label: string;
  /** Its words when negated (else "not (…)") */
  negatedLabel?: string;
  /** The expression written, with its slots' places */
  pattern: string;
  /** Other spellings read as this phrase */
  also?: readonly string[];
  slots?: readonly ConditionSlot[];
}

export type ConditionNode =
  | { kind: "all" | "any", parts: ConditionNode[] }
  | { kind: "phrase", id: string, values: Record<string, SlotValue>, negated: boolean }
  | { kind: "code", source: string };

/** The builder's model: pieces joined by one of and / or */
export interface ConditionRows { joiner: "all" | "any", rows: ConditionNode[] }

const QUOTED = "", LIST = "", NUMBER = "", END = "";

/** An expression split at a top-level operator (nothing inside brackets or quotes) */
export function splitTop(expression: string, operator: "&&" | "||"): string[] {
  const pieces: string[] = [];
  let depth = 0, quote = "", start = 0;
  for (let i = 0; i < expression.length; i++) {
    const c = expression[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; continue; }
    if (c === "'" || c === '"' || c === "`") quote = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (depth === 0 && expression.startsWith(operator, i)) { pieces.push(expression.slice(start, i)); start = i + 2; i++; }
  }
  pieces.push(expression.slice(start));
  return pieces.map(piece => piece.trim()).filter(Boolean);
}

/** Whether one pair of brackets wraps the whole expression */
export function wrapped(expression: string): boolean {
  if (!expression.startsWith("(") || !expression.endsWith(")")) return false;
  let depth = 0, quote = "";
  for (let i = 0; i < expression.length; i++) {
    const c = expression[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = ""; continue; }
    if (c === "'" || c === '"' || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0 && i < expression.length - 1) return false;
  }
  return true;
}

const unwrap = (expression: string) => {
  let e = expression.trim();
  while (wrapped(e)) e = e.slice(1, -1).trim();
  return e;
};

/** An expression as compared: no spacing outside strings, double quotes, `===`, no optional chaining */
export function canonical(expression: string): string {
  const strings: string[] = [];
  let out = "";
  for (let i = 0; i < expression.length; i++) {
    const c = expression[i];
    if (c === "'" || c === '"') {
      let value = "";
      for (i++; i < expression.length && expression[i] !== c; i++) {
        if (expression[i] === "\\" && i + 1 < expression.length) value += expression[++i];
        else value += expression[i];
      }
      strings.push(value);
      out += `${strings.length - 1}`;
    } else if (!/\s/.test(c)) out += c;
    // A space between words matters (`a instanceof B`)
    else if (/\w/.test(out.at(-1) ?? "") && /\w/.test(expression.slice(i).trimStart()[0] ?? "")) out += " ";
  }
  out = out.replace(/\?\.(?=[[(])/g, "").replace(/\?\./g, ".")
    .replace(/(?<![=!<>])==(?!=)/g, "===").replace(/!=(?!=)/g, "!==");
  // `t => …` and `x => …` are the same: single parameters named in order
  const parameters = [...new Set([...out.matchAll(/(?<![\w.$])([A-Za-z_]\w*)=>/g)].map(m => m[1]))];
  parameters.forEach((name, i) => { out = out.replace(new RegExp(`(?<![\\w.$])${name}(?![\\w$])`, "g"), `$${i}`); });
  return out.replace(/(\d+)/g, (_m, n) => JSON.stringify(strings[Number(n)]));
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STRING = '"((?:[^"\\\\]|\\\\.)*)"';

interface Compiled { def: ConditionPhraseDef, regex: RegExp, slots: { name: string, kind: string }[], negated: boolean }

/** A pattern as a regular expression over canonical expressions, and the slots its groups fill */
function compile(def: ConditionPhraseDef, pattern: string, negated: boolean): Compiled {
  const slots: { name: string, kind: string }[] = [];
  const marked = pattern
    .replace(/(['"])\{(\w+)\}\1/g, (_m, _q, name) => `${QUOTED}${name}${END}`)
    .replace(/\[\{(\w+)\}\]/g, (_m, name) => `${LIST}${name}${END}`)
    .replace(/\{(\w+)\}/g, (_m, name) => `${NUMBER}${name}${END}`);
  const source = escapeRegExp(canonical(marked)).replace(/([-])(\w+)/g, (_m, kind, name) => {
    slots.push({ name, kind });
    if (kind === QUOTED) return STRING;
    if (kind === LIST) return `\\[((?:${STRING.replace("(", "(?:")},?)*)\\]`;
    return def.slots?.find(s => s.name === name)?.type === "number" ? "(-?\\d+(?:\\.\\d+)?)" : "(\\w+)";
  });
  return { def, regex: new RegExp(`^${source}$`), slots, negated };
}

const compiledFor = new WeakMap<readonly ConditionPhraseDef[], Compiled[]>();
function compiled(defs: readonly ConditionPhraseDef[]): Compiled[] {
  let list = compiledFor.get(defs);
  if (!list) {
    list = [];
    for (const def of defs) {
      for (const pattern of [def.pattern, ...(def.also ?? [])]) {
        list.push(compile(def, pattern, false));
        // `a === b` negated is also written `a !== b`
        if (/===/.test(pattern)) list.push(compile(def, pattern.replace("===", "!=="), true));
      }
    }
    compiledFor.set(defs, list);
  }
  return list;
}

const listValues = (text: string): string[] => text ? JSON.parse(`[${text.replace(/,$/, "")}]`) as string[] : [];

function matchPhrase(piece: string, defs: readonly ConditionPhraseDef[]): Extract<ConditionNode, { kind: "phrase" }> | undefined {
  let e = canonical(unwrap(piece));
  let negated = false;
  for (;;) {
    while (e.startsWith("!!")) e = e.slice(2);
    for (const { def, regex, slots, negated: byPattern } of compiled(defs)) {
      const found = regex.exec(e);
      if (!found) continue;
      const values: Record<string, SlotValue> = {};
      slots.forEach(({ name, kind }, i) => {
        const slot = def.slots?.find(s => s.name === name);
        const raw = found[i + 1] ?? "";
        const one = kind === QUOTED ? raw.replace(/\\(.)/g, "$1") : raw;
        values[name] = kind === LIST ? listValues(raw) : slot?.type === "multiselect" ? [one] : slot?.type === "number" ? Number(one) : one;
      });
      return { kind: "phrase", id: def.id, values, negated: negated !== byPattern };
    }
    if (!e.startsWith("!")) return undefined;
    negated = !negated;
    e = canonical(unwrap(e.slice(1)));
  }
}

/** An expression read into pieces: phrases where one fits, code where none does */
export function parseCondition(expression: string, defs: readonly ConditionPhraseDef[]): ConditionNode {
  const e = unwrap(expression);
  const whole = matchPhrase(e, defs);
  if (whole) return whole;
  for (const [operator, kind] of [["||", "any"], ["&&", "all"]] as const) {
    const pieces = splitTop(e, operator);
    if (pieces.length > 1) return { kind, parts: pieces.map(piece => parseCondition(piece, defs)) };
  }
  return { kind: "code", source: e };
}

const quote = (value: unknown) => `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const SIMPLE = /^[\w.?]+(\[[^\]]*\]|\([^()]*\))*$/;

/** A slot's value to begin with */
export function slotDefault(slot: ConditionSlot, options: readonly PhraseOption[] = slot.options ?? []): SlotValue {
  if (slot.default !== undefined) return slot.default;
  if (slot.type === "multiselect") return [];
  if (slot.type === "number") return 0;
  return options[0]?.value ?? "";
}

function phraseExpression(node: Extract<ConditionNode, { kind: "phrase" }>, def: ConditionPhraseDef): string {
  const value = (name: string) => node.values[name] ?? slotDefault(def.slots?.find(s => s.name === name) ?? { name, type: "text" });
  let equality = false;
  let expression = def.pattern
    .replace(/(['"])\{(\w+)\}\1/g, (_m, _q, name) => quote(value(name)))
    .replace(/\[\{(\w+)\}\]/g, (_m, name) => `[${[value(name)].flat().map(quote).join(", ")}]`)
    .replace(/\{(\w+)\}/g, (_m, name) => def.slots?.find(s => s.name === name)?.type === "number" ? String(Number(value(name)) || 0) : String(value(name)).replace(/\W/g, ""));
  if (!node.negated) return expression;
  expression = expression.replace("===", () => { equality = true; return "!=="; });
  if (equality) return expression;
  return SIMPLE.test(expression) ? `!${expression}` : `!(${expression})`;
}

/** Code among other pieces: bracketed when it has a looser operator of its own (`||`, `? :`, `??`) */
const needsBrackets = (source: string) => splitTop(source, "||").length > 1 || /\?(?!\.)/.test(source);

/** The expression a tree stands for */
export function buildCondition(node: ConditionNode, defs: readonly ConditionPhraseDef[], nested = false): string {
  if (node.kind === "code") return node.source.trim();
  if (node.kind === "phrase") {
    const def = defs.find(d => d.id === node.id);
    return def ? phraseExpression(node, def) : "";
  }
  const parts = node.parts.map(part => {
    const text = buildCondition(part, defs, true);
    return part.kind === "code" && node.parts.length > 1 && needsBrackets(text) && !wrapped(text) ? `(${text})` : text;
  }).filter(Boolean);
  const joined = parts.join(node.kind === "all" ? " && " : " || ");
  return nested && parts.length > 1 ? `(${joined})` : joined;
}

/** A tree as the builder edits it: pieces under one joiner; a group inside is one piece of code */
export function toRows(node: ConditionNode, defs: readonly ConditionPhraseDef[]): ConditionRows {
  if (node.kind === "code" && !node.source) return { joiner: "all", rows: [] };
  if (node.kind !== "all" && node.kind !== "any") return { joiner: "all", rows: [node] };
  return {
    joiner: node.kind,
    rows: node.parts.map(part => part.kind === "all" || part.kind === "any" ? { kind: "code", source: buildCondition(part, defs) } : part)
  };
}

export function fromRows(rows: ConditionRows, defs: readonly ConditionPhraseDef[]): string {
  const kept = rows.rows.filter(row => row.kind !== "code" || row.source.trim());
  if (kept.length === 1) return buildCondition(kept[0], defs);
  return buildCondition({ kind: rows.joiner, parts: kept }, defs);
}

export interface ConditionWording {
  and: string;
  or: string;
  /** "not ({condition})" */
  not(words: string): string;
  /** A slot's value in words (an option's label) */
  value(slot: ConditionSlot | undefined, value: string | number): string;
}

function phraseWords(node: Extract<ConditionNode, { kind: "phrase" }>, def: ConditionPhraseDef, wording: ConditionWording): string {
  const label = node.negated && def.negatedLabel ? def.negatedLabel : def.label;
  const words = label.replace(/\{(\w+)\}/g, (_m, name) => {
    const slot = def.slots?.find(s => s.name === name);
    const names = [node.values[name] ?? ""].flat().map(v => wording.value(slot, v));
    return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${wording.or} ${names.at(-1)}`;
  });
  return node.negated && !def.negatedLabel ? wording.not(words) : words;
}

/** A tree in words; code as written. `known`: whether any piece was put in words */
export function conditionWords(node: ConditionNode, defs: readonly ConditionPhraseDef[], wording: ConditionWording, nested = false): { text: string, known: boolean } {
  if (node.kind === "code") return { text: node.source, known: false };
  if (node.kind === "phrase") {
    const def = defs.find(d => d.id === node.id);
    return def ? { text: phraseWords(node, def, wording), known: true } : { text: "", known: false };
  }
  const parts = node.parts.map(part => conditionWords(part, defs, wording, true));
  const joined = parts.map(p => p.text).join(` ${node.kind === "all" ? wording.and : wording.or} `);
  return { text: nested ? `(${joined})` : joined, known: parts.some(p => p.known) };
}

/** Whether an expression is one JavaScript can read (`await` allowed): its problem, or undefined */
export function conditionProblem(expression: string): string | undefined {
  if (!expression.trim()) return undefined;
  try {
    new Function(`return (async () => (${expression}))`);
    return undefined;
  } catch (err) { return err instanceof Error ? err.message : String(err); }
}
