import type { Entry, EntryHome } from "./types.js";

/*
 * Entry recipes (the entry editor's "Add from a recipe"): the patterns midi's own sample items use, each a starting
 * entry for where it is added. Data only: the editor gives the entry a free id and opens it for the blanks.
 * Labels: `midi-qol.Recipe.<id>.Label` / `.Hint`.
 */

export interface Recipe {
  id: string;
  /** Where it makes sense */
  homes: readonly EntryHome[];
  entry: (home: EntryHome) => Omit<Entry, "id">;
}

const SPELL = "tags.use.kind === 'spell'";

const recipes: Recipe[] = [
  {
    id: "extraDamage", homes: ["item", "activity", "effect"],
    entry: home => ({ on: "use.hit", ...(home === "item" ? { who: "owner" as const } : home === "effect" ? { who: "bearer" as const } : {}), if: "!!tags.use.attack", do: [{ damage: "1d6", to: "target" }] })
  },
  {
    id: "damageWhenHit", homes: ["effect"],
    entry: () => ({ on: "hit", if: "event.actor?.uuid === entry.origin.actor?.uuid", do: [{ damage: "1d6", to: "target" }] })
  },
  {
    id: "rollBonus", homes: ["item", "activity"],
    entry: () => ({ on: "roll.preResult", who: "owner", offer: "ask", do: [{ bonus: { kind: "add", formula: "1d4" }, rolls: ["attack", "save", "check"] }] })
  },
  {
    id: "saveEachTurn", homes: ["effect"],
    entry: () => ({ on: "turnEnd", do: [{ save: "applying", then: [{ end: true }] }] })
  },
  {
    id: "damageEachTurn", homes: ["effect"],
    entry: () => ({ on: "turnStart", do: [{ damage: "1d6", type: "fire" }] })
  },
  {
    id: "reduceDamage", homes: ["item", "effect"],
    entry: () => ({ on: "damaging", do: [{ damageChange: { stage: "flatReduction", amount: "5" } }] })
  },
  {
    id: "shareDamage", homes: ["effect"],
    entry: () => ({ on: "damaging", do: [{ transfer: { to: "origin", amount: "half" } }] })
  },
  {
    id: "changeSpell", homes: ["item"],
    entry: () => ({ on: "use.configure", who: "owner", if: SPELL, offer: "ask", group: "metamagic", do: [{ change: { range: "@value * 2" } }] })
  },
  {
    id: "breakFree", homes: ["effect"],
    entry: () => ({ on: "action", label: "Break free", who: ["bearer", { within: "reach", of: "bearer" }], do: [{ check: { ability: "str", skill: "ath", dc: "@entry.origin.dc" }, then: [{ end: true }] }] })
  },
  {
    id: "table", homes: ["item", "activity", "effect"],
    entry: home => ({ on: home === "effect" ? "turnStart" : "use.end", do: [{ table: { id: "table", formula: "1d20", rows: [{ range: [20, 20], label: "", do: [] }] } }] })
  },
  {
    id: "whenEnds", homes: ["effect"],
    entry: () => ({ on: "ended", do: [{ effect: "apply", what: "prone", to: "self" }] })
  }
];

export function recipesFor(home: EntryHome): Recipe[] {
  return recipes.filter(recipe => recipe.homes.includes(home));
}

export function recipe(id: string): Recipe | undefined {
  return recipes.find(r => r.id === id);
}

/** A module's recipe (or a replacement of one of midi's, by id) */
export function registerRecipe(added: Recipe): void {
  const at = recipes.findIndex(r => r.id === added.id);
  if (at >= 0) recipes[at] = added;
  else recipes.push(added);
}
