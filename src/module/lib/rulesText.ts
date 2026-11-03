import { GameSystemConfig, MODULE_ID, i18n, i18nFormat } from "../../midi-qol.js";
import { configSettings } from "../settings.js";

/**
 * Rules text for midi's non-SRD sample items. Their description is midi's automation notes plus a "No rules text (not
 * SRD; <book>)" paragraph; the text is copied from the world's own content: official modules (PHB, DMG, Tasha's...),
 * then dnd5e's SRD, then a GM chosen compendium. A match is the same type and identifier in the same ruleset, then in
 * the other ruleset (noted), then the same type and name (noted).
 */

// The "No rules text (not SRD; <book>)..." sentence, alone in its paragraph or after midi's notes
const PLACEHOLDER = /No rules text \([\s\S]*?(?=<\/em>|<\/p>)/;


type Match = "exact" | "otherRules" | "name";
type IndexEntry = { _id: string; name: string; type: string; system?: { identifier?: string; source?: unknown } };

const indexes = new Map<string, IndexEntry[] | null>();

export function registerRulesTextSettings() {
  // Compendiums exist from setup on
  Hooks.once("setup", () => {
    const choices: Record<string, string> = { "": i18n("midi-qol.RulesText.Compendium.None") };
    for (const pack of game.packs ?? []) {
      if (pack.documentName === "Item") choices[pack.collection] = `${pack.title} (${pack.collection})`;
    }
    game.settings.register(MODULE_ID, "rulesTextCompendium", {
      name: i18n("midi-qol.RulesText.Compendium.Name"),
      hint: i18n("midi-qol.RulesText.Compendium.Hint"),
      scope: "world",
      config: true,
      type: String,
      choices,
      default: ""
    });
  });
  Hooks.on("createItem", (item: Item.Implementation, _options: unknown, userId: string) => {
    if (userId !== game.user?.id || !(item.parent instanceof Actor) || !lacksRulesText(item)) return;
    if (!configSettings.rulesTextFill) return;
    void fillRulesText(item);
  });
  //@ts-expect-error dnd5e hook
  Hooks.on("getHeaderControlsItemSheet5e", (app: foundry.applications.api.DocumentSheetV2<Item>, controls: foundry.applications.api.ApplicationV2.HeaderControlsEntry[]) => {
    const item = app.document;
    if (!item.isOwner || !lacksRulesText(item)) return;
    controls.push({
      label: "midi-qol.RulesText.Fill",
      icon: "fa-solid fa-book-open",
      // @ts-expect-error v13-ism
      onClick: () => fillRulesText(item, { notify: true })
    });
  });
}

/** A midi sample item whose description says it has no rules text. */
export function lacksRulesText(item: Item.Implementation | undefined | null): boolean {
  //@ts-expect-error no dnd5e types
  const description = item?.system?.description?.value;
  return typeof description === "string" && PLACEHOLDER.test(description);
}

/** Fill one item's rules text; returns the match found, or undefined (nothing changed). */
export async function fillRulesText(item: Item.Implementation, { notify = false } = {}): Promise<Match | undefined> {
  if (!lacksRulesText(item)) return;
  const found = await findRulesText(item);
  if (!found) {
    if (notify) ui.notifications?.warn(i18nFormat("midi-qol.RulesText.NotFound", { name: item.name }));
    return;
  }
  const { doc, match } = found;
  //@ts-expect-error no dnd5e types
  const source = doc.system.source;
  const bookCode = typeof source?.book === "string" ? source.book : "";
  const book = bookCode ? i18n(GameSystemConfig.sourceBooks?.[bookCode] ?? bookCode) : packageTitle(doc);
  const link = `@UUID[${doc.uuid}]{${doc.name}}`;
  const note = match === "exact" ? i18nFormat("midi-qol.RulesText.From", { book, link })
    : match === "otherRules" ? i18nFormat("midi-qol.RulesText.FromOtherRules", { book, link, rules: source?.rules ?? "" })
    : i18nFormat("midi-qol.RulesText.FromName", { book, link });
  //@ts-expect-error no dnd5e types
  const current: string = item.system.description.value;
  const midiNotes = current.replace(PLACEHOLDER, note);
  //@ts-expect-error no dnd5e types
  const text: string = doc.system.description.value;
  const update: Record<string, unknown> = {
    "system.description.value": `${text}\n${midiNotes}`,
    [`flags.${MODULE_ID}.rulesText`]: { uuid: doc.uuid, match }
  };
  //@ts-expect-error no dnd5e types
  if (!item.system.source?.book) update["system.source.book"] = bookCode || book;
  await item.update(update);
  if (notify) ui.notifications?.info(i18nFormat("midi-qol.RulesText.Filled", { name: item.name, book }));
  return match;
}

/** Every item in the world (actors, unlinked tokens, the Items directory) that lacks its rules text. */
export function itemsLackingRulesText(): Item.Implementation[] {
  const items = new Set<Item.Implementation>();
  const add = (actor: Actor.Implementation | null | undefined) => { for (const item of actor?.items ?? []) if (lacksRulesText(item)) items.add(item); };
  for (const actor of game.actors ?? []) add(actor);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens) if (!token.actorLink) add(token.actor);
  for (const item of game.items ?? []) if (lacksRulesText(item)) items.add(item);
  return [...items];
}

/** Fill every item in the world that lacks its rules text (GM only). */
export async function fillAllRulesText(): Promise<{ filled: number; notFound: string[] }> {
  let filled = 0;
  const notFound: string[] = [];
  for (const item of itemsLackingRulesText()) {
    if (await fillRulesText(item)) filled++;
    else notFound.push(item.parent ? `${item.parent.name}: ${item.name}` : item.name);
  }
  return { filled, notFound };
}

function sourcePacks(): CompendiumCollection<"Item">[] {
  const items = [...(game.packs ?? [])].filter(pack => pack.documentName === "Item") as CompendiumCollection<"Item">[];
  const official = items.filter(pack => pack.metadata.packageType === "module" && pack.metadata.packageName.startsWith("dnd-"));
  const system = items.filter(pack => pack.metadata.packageType === "system");
  const chosen = game.settings.settings.has(`${MODULE_ID}.rulesTextCompendium`) ? game.settings.get(MODULE_ID, "rulesTextCompendium") : "";
  const gm = items.filter(pack => chosen && pack.collection === chosen);
  return [...official, ...system, ...gm];
}

async function packIndex(pack: CompendiumCollection<"Item">): Promise<IndexEntry[] | null> {
  if (indexes.has(pack.collection)) return indexes.get(pack.collection)!;
  let entries: IndexEntry[] | null;
  try {
    // system.source as a whole: a few packs store it as a number, which fails a system.source.rules index
    // @ts-expect-error no dnd5e-types
    const index = await pack.getIndex({ fields: ["system.identifier", "system.source"] });
    entries = [...index.values()] as unknown as IndexEntry[];
  } catch (err) {
    console.warn(`midi-qol | rules text: could not index ${pack.collection}`, err);
    entries = null;
  }
  indexes.set(pack.collection, entries);
  return entries;
}

async function findRulesText(item: Item.Implementation): Promise<{ doc: Item.Implementation; match: Match } | undefined> {
  //@ts-expect-error no dnd5e types
  const identifier: string | undefined = item.system.identifier;
  //@ts-expect-error no dnd5e types
  const rules: string | undefined = item.system.source?.rules;
  const name = item.name.toLowerCase();
  const candidates: Record<Match, [CompendiumCollection<"Item">, IndexEntry][]> = { exact: [], otherRules: [], name: [] };
  for (const pack of sourcePacks()) {
    for (const entry of await packIndex(pack) ?? []) {
      if (entry.type !== item.type) continue;
      if (identifier && entry.system?.identifier === identifier) {
        const source = entry.system.source;
        const entryRules = typeof source === "object" && source ? (source as { rules?: string }).rules : undefined;
        candidates[!rules || !entryRules || entryRules === rules ? "exact" : "otherRules"].push([pack, entry]);
      } else if (entry.name.toLowerCase() === name) candidates.name.push([pack, entry]);
    }
  }
  for (const match of ["exact", "otherRules", "name"] as Match[]) {
    for (const [pack, entry] of candidates[match]) {
      const doc = await pack.getDocument(entry._id) as Item.Implementation | undefined | null;
      if (doc && hasRulesText(doc)) return { doc, match };
    }
  }
}

/** A document with rules text of its own (not another midi placeholder). */
function hasRulesText(doc: Item.Implementation): boolean {
  //@ts-expect-error no dnd5e types
  const text = doc.system.description?.value;
  return typeof text === "string" && text.trim() !== "" && !PLACEHOLDER.test(text);
}

function packageTitle(doc: Item.Implementation): string {
  const pack = doc.pack ? game.packs?.get(doc.pack) : undefined;
  if (!pack) return "";
  const { packageType, packageName } = pack.metadata;
  return (packageType === "module" ? game.modules?.get(packageName)?.title : packageType === "system" ? game.system?.title : undefined) ?? pack.title;
}
