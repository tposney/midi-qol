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
  /** `label`: the link's own text ("[[/item .id]]{beak}"), for notes shown to the GM */
  | { kind: "item", id?: string, activity?: string, name?: string, label?: string }
  | { kind: "spell", uuid?: string, name?: string }
  | { kind: "cast", via: RawRef, spell: RawRef, level?: number }
  /** Any attack, or any melee / ranged one ("two melee attacks or two ranged attacks") */
  | { kind: "attack", range?: "melee" | "ranged" };

/** How many: a number, as many as allowed (replace any), a formula (summons), or a rule in words (the Hydra's heads) */
export type Count = number | "any" | { formula: string } | { text: string };

export interface ParsedGroup { n: Count, refs: RawRef[] }
export interface ParsedExtra { refs: RawRef[], ifAvailable?: boolean }
/** At most `max` of an option's attacks may be these (2014: "two attacks, only one of which can be a bite attack") */
export interface ParsedLimit { refs: RawRef[], max: number }
export interface ParsedOption { groups: ParsedGroup[], extra: ParsedExtra[], condition?: string, limits?: ParsedLimit[] }
export interface ParsedReplace { n: number | "any", refs: RawRef[], of?: RawRef[] }
export interface ParsedPlan {
  options: ParsedOption[];
  replace: ParsedReplace[];
  /** Sentences or parts of them that held references but weren't understood */
  unread: string[];
  /** Rules the plan doesn't enforce, shown to the GM (2014: "It can't make both attacks against the same target") */
  notes?: string[];
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

interface Tokenized { text: string, refs: RawRef[], rolls: string[], notes: string[], limits: ParsedLimit[] }

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
    .replace(/\[\[\/item\s*([^\]]*)\]\](?:\{([^}]*)\})?/g, (_, arg: string, label?: string) => {
      const ref = itemRef(arg);
      return ref ? token(label && ref.kind === "item" ? { ...ref, label } : ref) : " ⟦?⟧ ";
    })
    .replace(/\[\[lookup[^\]]*\]\](?:\{[^}]*\})?/g, " it ")
    .replace(/\[\[([^\]]*)\]\](?:\{[^}]*\})?/g, (_, formula: string) => { rolls.push(formula.trim()); return " "; })
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#0?39;|&apos;|[’‘]/g, "'").replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    // The books' slips: "makes makes", "makes on Bite", "The it makes"
    .replace(/\bmakes makes\b/gi, "makes").replace(/\bmakes on\b/gi, "makes one").replace(/\b[Tt]he it\b/g, "It");
  // Attacks named without a link: the creature's item names, longest first
  const linked = refs.length;
  // A qualifier dropped ("Claw (Oni Form Only)" is "claw", the reference keeps the item's name); never a generic word
  // (a legendary action named "Attack")
  const generic = (n: string) => /^(?:attacks?|actions?|legendary actions?|lair actions?|multiattack)$/i.test(n.trim());
  const named = names.flatMap(item => [{ text: item, item }, { text: item.replace(/\s*\([^)]*\)\s*$/, ""), item }])
    .filter((n, i, all) => n.text.length > 2 && !generic(n.text) && all.findIndex(o => o.text.toLowerCase() === n.text.toLowerCase()) === i);
  for (const { text: name, item } of named.sort((a, b) => b.text.length - a.text.length)) {
    // Singular or plural ("claws" for a Claw item, "longswords" for Longsword)
    const stem = name.length > 4 ? name.replace(/(?:es|s)$/i, "") : name;
    const re = new RegExp(`(?<![\\w⟦])${escape(stem)}(?:es|s)?(?![\\w⟧])`, "gi");
    text = text.split(/(⟦[^⟧]*⟧)/).map(part => part.startsWith("⟦") ? part : part.replace(re, () => token({ kind: "item", name: item }))).join("");
  }
  // Without names: Title Case words before "attack(s)", and a spell named after "to cast"
  text = text.split(/(⟦[^⟧]*⟧)/).map(part => part.startsWith("⟦") ? part : part
    .replace(new RegExp(`(?<=\\b${COUNT} )((?:[A-Z][\\w'-]*)(?: [A-Z][\\w'-]*)*)(?= attacks?\\b)`, "g"), (name: string) => token({ kind: "item", name }))
    .replace(/(?<=\bto cast )((?:[A-Z][\w'-]*)(?: (?:of |the )?[A-Z][\w'-]*)*)/g, (name: string) => token({ kind: "spell", name }))
    .replace(/(?<=\bthe )((?:[A-Z][\w'-]*)(?: [A-Z][\w'-]*)*)(?= attacks?\b)/g, (name: string) => token({ kind: "item", name }))
    .replace(/(?<=\buses )((?:[A-Z][\w'-]*)(?: [A-Z][\w'-]*)*)/g, (name: string) => token({ kind: "item", name }))
    .replace(/\bSpellcasting(?= to cast\b)/g, () => token({ kind: "item", name: "Spellcasting" })))
    .join("");
  // A link with its name repeated in plain words after it (a slip: "[[/item .mmDreadScythe000]]Dread Scythe"): a
  // name-matched reference right after a link is that repetition
  text = text.replace(/(⟦(\d+)⟧)\s+⟦(\d+)⟧/g, (all: string, first: string, a: string, b: string) => Number(a) < linked && Number(b) >= linked ? first : all);
  text = text.replace(/(⟦\d+⟧) (?:[A-Z][\w'-]*)(?: [A-Z][\w'-]*)*(?= (?:or|and|in|attacks?)\b|,)/g, "$1");
  // "X to cast Y (level N version)": one cast reference
  text = text.replace(new RegExp(`⟦(\\d+)⟧\\s*to cast\\s*⟦(\\d+)⟧(?:\\s*\\(level (\\d+) version\\))?`, "g"), (_, via: string, spell: string, level?: string) =>
    token({ kind: "cast", via: refs[Number(via)], spell: refs[Number(spell)], ...(level ? { level: Number(level) } : {}) }).trim());
  text = text.replace(/\s+/g, " ").replace(/\s+([.,])/g, "$1").replace(/\.(?:\s*\.)+/g, ".").trim();
  const notes: string[] = [];
  const limits: ParsedLimit[] = [];
  text = legacyForms(text, { refs, notes, limits, token });
  return { text, refs, rolls, notes, limits };
}

/*
 * The 2014 books' prose (SRD 5.1, Tasha's...), rewritten into the 2024 shapes above. Each rewrite fires only on a
 * phrase the 2024 books don't use, so 2024 descriptions pass through unchanged (their plans are snapshot-tested).
 *   makes three attacks: one with its bite and two with its claws   -> makes one bite attack and two claws attacks
 *   makes two attacks with its scimitar                              -> makes two scimitar attacks
 *   makes two attacks, either with its claws or its tail             -> two attacks, using claws or tail in any combination
 *   ... Alternatively, it can use Hurl Flame twice / Or the captain makes ...   -> ..., or uses / or makes ...
 *   can use its Frightful Presence. It then makes                    -> can use its Frightful Presence and makes
 *   It can use its Swallow instead of its bite / in place of any attack / each of which it can replace with -> replacements
 *   only one of which can be a bite attack                           -> a limit
 *   It can't make both attacks against the same target, The second attack has disadvantage, If that attack hits ...,
 *   each one with a different weapon, While flying ...               -> notes for the GM
 */
function legacyForms(input: string, { refs, notes, limits, token }: { refs: RawRef[], notes: string[], limits: ParsedLimit[], token: (ref: RawRef) => string }): string {
  let text = input;
  const note = (s: string) => { const t = s.replace(/⟦(\d+)⟧/g, (_, n: string) => { const r = refs[Number(n)]; return r && "label" in r && r.label ? r.label : r && "name" in r && r.name ? r.name : "it"; }).trim(); if (t) notes.push(t); };
  // Rules for the GM
  text = text.replace(/(?:^|(?<=\.\s))[^.]*?(?:can't make both attacks against the same target|The second attack has disadvantage|If that attack hits)[^.]*(?:\.|$)/gi, m => { note(m.replace(/\.$/, "")); return ""; });
  text = text.replace(/,?\s*each (?:one )?with a different weapon/gi, m => { note("each attack with a different weapon"); return ""; });
  text = text.replace(/\b((?:While|When) [^,.]*), (?=it can (?:use|make)\b)/g, (_, cond: string) => {
    // "When its Fire Breath is available, it can use the breath in place of ...": the breath named before
    const breath = cond.match(/^When its (⟦\d+⟧) is available$/);
    if (breath) return `${breath[1]}§`;
    note(cond); return "";
  });
  text = text.replace(/(⟦\d+⟧)§it can use (?:the|its) \w+/g, "It can use $1");
  // Verbs and punctuation
  text = text.replace(new RegExp(`\\band,? if it can, uses (?:its )?(${LIST})`, "gi"), "and uses $1 if available");
  text = text.replace(/\bcan make\b(?! both)/gi, "makes").replace(/\bmakes either\b/gi, "makes").replace(/ - (?=or\b)/g, " ").replace(/ - /g, ": ");
  text = text.replace(new RegExp(`can use its (${TOKEN})\\.\\s*It then makes`, "g"), "can use its $1 and makes");
  text = text.replace(/\.\s*(?:Alternatively,\s*(?:it\s+)?|Or (?:the [\w -]+? |it )?)(?:can )?(use|uses|make|makes|cast|casts)\b/g,
    (_, verb: string) => `, or ${verb.replace(/^(use|make|cast)$/i, "$1s")}`);
  text = text.replace(/\bcasts (?:one|a) spell\b/gi, () => `uses${token({ kind: "spell" })}`);
  // Colon lists: "three attacks: one with its bite and two with its claws"
  text = text.replace(new RegExp(`(${COUNT})(?: (?:melee|ranged))? attacks?: ([^.]*?)(?=\\.|,? or (?:it )?makes\\b|$)`, "gi"), (_, _total: string, list: string) =>
    list.replace(new RegExp(`(${COUNT}) (?:with (?:its|his|her)|to) (${LIST})`, "gi"), "$1 $2 attacks"));
  text = text.replace(new RegExp(`(${COUNT}) attacks?,? either with (?:its|his|her) (${TOKEN}) or (?:with )?(?:its|his|her) (${TOKEN})`, "gi"), "$1 attacks, using $2 or $3 in any combination");
  text = text.replace(new RegExp(`(${COUNT})(?: (?:melee|ranged))? attacks? with (?:its|his|her) (${LIST})`, "gi"), "$1 $2 attacks");
  // "two attacks, only one of which can be a bite attack"
  text = text.replace(new RegExp(`,? only (${COUNT}) of which can be (?:with (?:its|his|her) |a |an |its )?(${LIST})(?: attacks?)?`, "gi"), (_, max: string, list: string) => {
    limits.push({ refs: refsIn(list, refs), max: countOf(max) }); return "";
  });
  // Replacements
  text = text.replace(new RegExp(`,? each of which it can replace with (?:one |a |an )?(?:use of )?(${LIST})`, "gi"), ". It can replace any attack with a use of $1");
  text = text.replace(new RegExp(`It can (?:use|make) (?:its |one |a |an )?(${LIST})(?: attacks?)? (?:in place of|instead of) (any|one|an?)(?: other)?(?: (?:melee|ranged))? attacks?`, "gi"),
    (_, what: string, n: string) => `It can replace ${/any/i.test(n) ? "any" : "one"} attack with a use of ${what}`);
  text = text.replace(new RegExp(`It can (?:use|make) (?:its |one |a |an )?(${LIST})(?: attacks?)? (?:in place of|instead of) (?:its |the )?(?:(${COUNT}) )?(${LIST})(?: attacks?)?`, "gi"),
    (_, what: string, n: string | undefined, of: string) => `It can replace ${n && countOf(n) > 1 ? `${n} of ` : ""}the ${of} attack with a use of ${what}`);
  return text.replace(/\s+/g, " ").replace(/\s+([.,])/g, "$1").replace(/^[.,\s]+/, "").trim();
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
    [new RegExp(`^(\\d+d\\d+) (${LIST}) attacks?`, "i"),
      m => groups.push({ n: { formula: m[1] }, refs: refsIn(m[2], refs) })],
    [new RegExp(`^(${COUNT}) (melee|ranged) attacks?\\b`, "i"),
      m => groups.push({ n: countOf(m[1]), refs: [{ kind: "attack", range: m[2].toLowerCase() as "melee" | "ranged" }] })],
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
  const m = sentence.match(new RegExp(`\\bcan replace (?:(${COUNT}|any)(?: of (?:its|those|these|the) attacks|(?: \\w+)? attacks?)?|(?:(${COUNT}) of )?the (${LIST}) attacks?) with (?:a use of |one use of |a |an )?(.*)$`, "i"));
  if (!m) return null;
  const [, count, ofCount, ofList, rest] = m;
  const using = refsIn(rest.replace(/\s*if available$/i, "").replace(/\s+attacks?$/i, ""), refs);
  if (!using.length) return null;
  if (ofList) return { n: ofCount ? countOf(ofCount) : 1, refs: using, of: refsIn(ofList, refs) };
  return { n: count.toLowerCase() === "any" ? "any" : countOf(count), refs: using };
}

/** The plan in a Multiattack description, or null when nothing in it reads as one */
export function parseMultiattack(html: string, options: ParseOptions = {}): ParsedPlan | null {
  const { text, refs, rolls, notes, limits } = tokenize(html, options);
  const plan: ParsedPlan = { options: [], replace: [], unread: [], ...(notes.length ? { notes } : {}) };
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
  if (limits.length) for (const option of plan.options) option.limits = limits;
  return plan.options.length || plan.replace.length ? plan : null;
}
