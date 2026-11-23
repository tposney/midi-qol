/*
 * M21: reading a monster's Multiattack description into a plan. Pure (no Foundry).
 *
 * The 2024 books and SRD 5.2 write every Multiattack in one house style (survey 2026-11-24: 307 MM, 187 SRD), and link
 * the attacks rather than naming them: `[[/item .mmBite0000000000]]` (item id), `[[/item Rend]]` (item name),
 * `[[/item .mmSpellcasting00.Activity.<id>]]` (an activity), spells as `@UUID[...spells.Item.<id>]{Name}` after
 * "to cast". The sentence families:
 *   makes three Rend attacks                                  a group
 *   makes one Bite attack and two Claw attacks                groups
 *   makes three attacks, using Scimitar or Shortbow in any combination
 *   makes two attacks                                         any attacks
 *   makes three A attacks or two B attacks / ..., or it makes options
 *   ... and uses Frightful Presence / and it can use X to cast Y (if available)   an extra use
 *   uses Eye Rays three times / twice                          a group of uses
 *   makes a number of attacks equal to half this spell's level (round down)   a formula count (summons; the roll is
 *     a `[[floor(...)]]` in the text)
 *   makes as many Bite attacks as it has heads                 no fixed count
 *   It can replace one / any / the Claw attack with a use of X / a Bite attack / Spellcasting to cast Y (level 3 version)
 * and a condition on an option ("if it used Hasten this turn"). English only: other languages are served by registered
 * plans keyed by identifiers (M21 plan, 21a), not by this parser.
 */

/** A reference in the text, before it is matched to the creature's items */
export type RawRef =
  | { kind: "item", id?: string, activity?: string, name?: string }
  | { kind: "spell", uuid?: string, name?: string }
  | { kind: "cast", via: RawRef, spell: RawRef, level?: number }
  | { kind: "attack" };

/** How many: a number, as many as allowed (replace any), a formula (summons), or a rule in words (the Hydra's heads) */
export type Count = number | "any" | { formula: string } | { text: string };

export interface ParsedGroup { n: Count, refs: RawRef[] }
export interface ParsedExtra { refs: RawRef[], ifAvailable?: boolean }
export interface ParsedOption { groups: ParsedGroup[], extra: ParsedExtra[], condition?: string }
export interface ParsedReplace { n: number | "any", refs: RawRef[], of?: RawRef[] }
export interface ParsedPlan {
  options: ParsedOption[];
  replace: ParsedReplace[];
  /** Sentences or parts of them that held references but weren't understood */
  unread: string[];
}

export interface ParseOptions {
  /** The creature's item names, to find attacks named without a link ("two Clockwork Blade attacks") */
  names?: string[];
}

const NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
};
const COUNT = `(?:${Object.keys(NUMBERS).join("|")}|\\d+)`;
const TOKEN = "⟦\\d+⟧";
/** A list of references: "A", "A or B", "A, B, or C", "either A or B", "A and B" */
const LIST = `${TOKEN}(?:\\s*(?:,\\s*)?(?:or|and|,)\\s*${TOKEN})*`;

const countOf = (word: string): number => NUMBERS[word.toLowerCase()] ?? Number(word);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** An `[[/item ...]]` argument: `.id`, `.id.Activity.id`, a name, a compendium uuid */
function itemRef(arg: string): RawRef | null {
  const text = arg.trim();
  if (!text) return null;
  const activity = text.match(/([A-Za-z0-9]{16})\.Activity\.([A-Za-z0-9]{16})$/);
  if (activity) return { kind: "item", id: activity[1], activity: activity[2] };
  const id = text.match(/(?:^\.|\.Item\.)([A-Za-z0-9]{16})$/) ?? text.match(/^([A-Za-z0-9]{16})$/);
  if (id) return { kind: "item", id: id[1] };
  return { kind: "item", name: text };
}

interface Tokenized { text: string, refs: RawRef[], rolls: string[] }

/** Links become tokens ⟦n⟧ (refs[n]), tags and entities go, paragraphs end sentences */
export function tokenize(html: string, { names = [] }: ParseOptions = {}): Tokenized {
  const refs: RawRef[] = [];
  const rolls: string[] = [];
  const token = (ref: RawRef) => { refs.push(ref); return ` ⟦${refs.length - 1}⟧ `; };
  let text = String(html ?? "")
    .replace(/<\/p>|<br\s*\/?>/gi, ". ")
    .replace(/@UUID\[([^\]]*)\](?:\{([^}]*)\})?/g, (_, uuid: string, label?: string) =>
      /\.spells\.|^Compendium\.[^.]+\.spells/i.test(uuid) ? token({ kind: "spell", uuid, ...(label ? { name: label } : {}) })
        : (itemRef(uuid) ? token(itemRef(uuid)!) : " "))
    .replace(/\[\[\/item\s*([^\]]*)\]\](?:\{[^}]*\})?/g, (_, arg: string) => { const ref = itemRef(arg); return ref ? token(ref) : " ⟦?⟧ "; })
    .replace(/\[\[lookup[^\]]*\]\](?:\{[^}]*\})?/g, " it ")
    .replace(/\[\[([^\]]*)\]\](?:\{[^}]*\})?/g, (_, formula: string) => { rolls.push(formula.trim()); return " "; })
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#0?39;|&apos;|[’‘]/g, "'").replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    // The books' slips: "makes makes", "makes on Bite", "The it makes"
    .replace(/\bmakes makes\b/gi, "makes").replace(/\bmakes on\b/gi, "makes one").replace(/\b[Tt]he it\b/g, "It");
  // Attacks named without a link: the creature's item names, longest first
  for (const name of [...names].filter(n => n && n.length > 2).sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(?<![\\w⟦])${escape(name)}(?![\\w⟧])`, "g");
    text = text.split(/(⟦[^⟧]*⟧)/).map(part => part.startsWith("⟦") ? part : part.replace(re, () => token({ kind: "item", name }))).join("");
  }
  // Without names: Title Case words before "attack(s)", and a spell named after "to cast"
  text = text.split(/(⟦[^⟧]*⟧)/).map(part => part.startsWith("⟦") ? part : part
    .replace(new RegExp(`(?<=\\b${COUNT} )((?:[A-Z][\\w'-]*)(?: [A-Z][\\w'-]*)*)(?= attacks?\\b)`, "g"), (name: string) => token({ kind: "item", name }))
    .replace(/(?<=\bto cast )((?:[A-Z][\w'-]*)(?: (?:of |the )?[A-Z][\w'-]*)*)/g, (name: string) => token({ kind: "spell", name }))
    .replace(/(?<=\bthe )((?:[A-Z][\w'-]*)(?: [A-Z][\w'-]*)*)(?= attacks?\b)/g, (name: string) => token({ kind: "item", name }))
    .replace(/(?<=\buses )((?:[A-Z][\w'-]*)(?: [A-Z][\w'-]*)*)/g, (name: string) => token({ kind: "item", name }))
    .replace(/\bSpellcasting(?= to cast\b)/g, () => token({ kind: "item", name: "Spellcasting" })))
    .join("");
  // A link with its name repeated in plain words after it (a slip: "[[/item .mmDreadScythe000]]Dread Scythe")
  text = text.replace(/(⟦\d+⟧) (?:[A-Z][\w'-]*)(?: [A-Z][\w'-]*)*(?= (?:or|and|in|attacks?)\b|,)/g, "$1");
  // "X to cast Y (level N version)": one cast reference
  text = text.replace(new RegExp(`⟦(\\d+)⟧\\s*to cast\\s*⟦(\\d+)⟧(?:\\s*\\(level (\\d+) version\\))?`, "g"), (_, via: string, spell: string, level?: string) =>
    token({ kind: "cast", via: refs[Number(via)], spell: refs[Number(spell)], ...(level ? { level: Number(level) } : {}) }).trim());
  text = text.replace(/\s+/g, " ").replace(/\s+([.,])/g, "$1").replace(/\.(?:\s*\.)+/g, ".").trim();
  return { text, refs, rolls };
}

/** The references in a span */
function refsIn(span: string, refs: RawRef[]): RawRef[] {
  return [...span.matchAll(/⟦(\d+)⟧/g)].map(m => refs[Number(m[1])]).filter(Boolean);
}

/** Splits text into sentences (". " or ".It", never inside a token) */
function sentencesOf(text: string): string[] {
  return text.split(/\.(?=\s|[A-Z⟦]|$)/).map(s => s.trim()).filter(Boolean);
}

/** One option's groups and extra uses, read left to right */
function readOption(body: string, refs: RawRef[], rolls: string[], unread: string[]): ParsedOption | null {
  let text = body.trim();
  let condition: string | undefined;
  const cond = text.match(/\s+(if (?!available\b).*)$/i);
  if (cond) { condition = cond[1]; text = text.slice(0, cond.index); }
  const groups: ParsedGroup[] = [];
  const extra: ParsedExtra[] = [];
  const patterns: [RegExp, (m: RegExpMatchArray) => void][] = [
    [new RegExp(`^(${COUNT})(?: other)? attacks?,? using (?:either )?(${LIST}) in any combination`, "i"),
      m => groups.push({ n: countOf(m[1]), refs: refsIn(m[2], refs) })],
    [new RegExp(`^a number of (?:(${LIST}) )?attacks? equal to ([^,]*?)(?=,|$)`, "i"),
      m => groups.push({ n: rolls.length ? { formula: rolls[0] } : { text: m[2].trim() }, refs: m[1] ? refsIn(m[1], refs) : [{ kind: "attack" }] })],
    [new RegExp(`^as many (${LIST}) attacks? as ([^,]*?)(?=,|$)`, "i"),
      m => groups.push({ n: { text: m[2].trim() }, refs: refsIn(m[1], refs) })],
    [new RegExp(`^uses? (?:either )?(${LIST}) (twice|thrice|(${COUNT}) times)`, "i"),
      m => groups.push({ n: m[3] ? countOf(m[3]) : (m[2].toLowerCase() === "twice" ? 2 : 3), refs: refsIn(m[1], refs) })],
    [new RegExp(`^(?:can )?uses? (?:its |either )?(${LIST})( if available)?`, "i"),
      m => extra.push({ refs: refsIn(m[1], refs), ...(m[2] ? { ifAvailable: true } : {}) })],
    [new RegExp(`^(${COUNT}) (${LIST}) attacks?`, "i"),
      m => groups.push({ n: countOf(m[1]), refs: refsIn(m[2], refs) })],
    [new RegExp(`^(${COUNT}) attacks?\\b`, "i"),
      m => groups.push({ n: countOf(m[1]), refs: [{ kind: "attack" }] })],
    // "makes three Rend." (the word "attacks" missing)
    [new RegExp(`^(${COUNT}) (${LIST})(?=\\s*(?:,|$))`, "i"),
      m => groups.push({ n: countOf(m[1]), refs: refsIn(m[2], refs) })]
  ];
  while (text.length) {
    const filler = text.match(/^(?:[\s,]|\b(?:and|then|it|also|makes?)\b(?! times\b))+/i);
    if (filler) { text = text.slice(filler[0].length); continue; }
    let matched = false;
    for (const [re, take] of patterns) {
      const m = text.match(re);
      if (!m) continue;
      take(m);
      text = text.slice(m[0].length);
      matched = true;
      break;
    }
    if (!matched) {
      if (/⟦|\b(?:attacks?|uses?)\b/.test(text)) unread.push(text);
      break;
    }
  }
  if (!groups.length && !extra.length) return null;
  return { groups, extra, ...(condition ? { condition } : {}) };
}

/** "It can replace one attack with a use of X", "... any attack ...", "... the Claw attack with a Bite attack" */
function readReplace(sentence: string, refs: RawRef[]): ParsedReplace | null {
  const m = sentence.match(new RegExp(`\\bcan replace (?:(${COUNT}|any)(?: of (?:its|those|these|the) attacks|(?: \\w+)? attacks?)?|the (${LIST}) attacks?) with (?:a use of |one use of |a |an )?(.*)$`, "i"));
  if (!m) return null;
  const with_ = m[3].replace(/\s*if available$/i, "").replace(/\s+attacks?$/i, "");
  const using = refsIn(with_, refs);
  if (!using.length) return null;
  if (m[2]) return { n: 1, refs: using, of: refsIn(m[2], refs) };
  return { n: m[1].toLowerCase() === "any" ? "any" : countOf(m[1]), refs: using };
}

/** The plan in a Multiattack description, or null when nothing in it reads as one */
export function parseMultiattack(html: string, options: ParseOptions = {}): ParsedPlan | null {
  const { text, refs, rolls } = tokenize(html, options);
  const plan: ParsedPlan = { options: [], replace: [], unread: [] };
  for (const sentence of sentencesOf(text)) {
    // The books' unfilled template sentence ("makes {count} [[/item]] attacks")
    if (/\{count\}|⟦\?⟧/.test(sentence)) continue;
    const replace = readReplace(sentence, refs);
    if (replace) { plan.replace.push(replace); continue; }
    if (/\bcan replace\b/i.test(sentence)) { plan.unread.push(sentence); continue; }
    if (plan.options.length) continue;
    const start = sentence.search(/\b(?:makes|uses|can use)\b/i);
    if (start < 0) continue;
    // Options: "three A attacks or two B attacks", "..., or it makes two C attacks", "... or uses Holy Burst twice"
    const body = sentence.slice(start);
    const parts = body.split(new RegExp(`,?\\s+or\\s+(?:it\\s+)?(?=(?:makes|uses)\\b|${COUNT}\\b)`, "i"));
    const read = parts.map(part => readOption(part, refs, rolls, plan.unread));
    if (read.every(Boolean)) plan.options = read as ParsedOption[];
    else plan.unread.push(sentence);
  }
  return plan.options.length || plan.replace.length ? plan : null;
}
