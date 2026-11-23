import { i18n } from "../../../midi-qol.js";
import type { MultiattackPlan, PlanGroup, PlanRef } from "../../lib/multiattack.js";
import { slug } from "../../lib/multiattack.js";
import { spellInfo } from "../../services/multiattack/plans.js";

/*
 * A Multiattack plan in plain words for a creature (the run sheet and the plan editor): each reference named by the
 * creature's own item (its sheet's language), a cast as "Spellcasting: Guiding Bolt (level 2)".
 */

type ItemSystem = { identifier?: string, activities?: { contents?: { type?: string, spell?: { uuid?: string } }[] } };

const unslug = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

/** The creature's name for a plan reference */
export function refName(actor: Actor.Implementation, ref: PlanRef): string {
  const level = ref.match(/@(\d+)$/)?.[1];
  const bare = ref.replace(/@\d+$/, "");
  const levelText = level ? ` ${i18n("midi-qol.Multiattack.Level").replace("{level}", level)}` : "";
  if (bare === "attack") return i18n("midi-qol.Multiattack.AnyAttack");
  if (bare === "attack:melee") return i18n("midi-qol.Multiattack.AnyMelee");
  if (bare === "attack:ranged") return i18n("midi-qol.Multiattack.AnyRanged");
  if (bare === "spell") return i18n("midi-qol.Multiattack.AnySpell");
  const itemFor = (id: string) => actor.items.find(i => ((i.system as ItemSystem).identifier || slug(i.name ?? "")) === id);
  if (bare.includes(">")) {
    const [via, spell] = bare.split(">");
    const casting = itemFor(via);
    let spellName: string | undefined;
    for (const item of actor.items) {
      if ((item.type as string) === "spell" && ((item.system as ItemSystem).identifier || slug(item.name ?? "")) === spell) spellName = item.name ?? undefined;
      for (const activity of (item.system as ItemSystem).activities?.contents ?? []) {
        const info = activity.spell?.uuid ? spellInfo(activity.spell.uuid) : undefined;
        if (info && (info.identifier || slug(info.name ?? "")) === spell) spellName = info.name ?? spellName;
      }
    }
    return `${casting?.name ?? unslug(via)}: ${spellName ?? unslug(spell)}${levelText}`;
  }
  const item = itemFor(bare);
  return `${item?.name ?? unslug(bare)}${levelText}`;
}

const names = (actor: Actor.Implementation, refs: PlanRef[]) => refs.map(ref => refName(actor, ref)).join(i18n("midi-qol.Multiattack.OrJoin"));

function countText(actor: Actor.Implementation, n: PlanGroup["n"]): string {
  if (typeof n === "number") return String(n);
  if (n === "any") return i18n("midi-qol.Multiattack.Any");
  if ("formula" in n) {
    try {
      const value = Number(Roll.safeEval(Roll.replaceFormulaData(n.formula, actor.getRollData())));
      if (Number.isFinite(value)) return String(Math.max(0, Math.floor(value)));
    } catch { /* shown as the formula */ }
    return n.formula;
  }
  return n.text === true ? i18n("midi-qol.Multiattack.AsAllowed") : n.text;
}

export interface PlanView {
  options: { groups: { count: string, names: string }[], extras: { names: string, ifAvailable: boolean }[], condition?: string, limits: string[] }[];
  replace: { text: string }[];
  notes: string[];
}

export function planView(actor: Actor.Implementation, plan: MultiattackPlan): PlanView {
  return {
    options: plan.options.map(option => ({
      groups: option.groups.map(g => ({ count: countText(actor, g.n), names: names(actor, g.refs) })),
      extras: option.extra.map(e => ({ names: names(actor, e.refs), ifAvailable: !!e.ifAvailable })),
      ...(option.condition ? { condition: option.condition === true ? i18n("midi-qol.Multiattack.SeeDescription") : option.condition } : {}),
      limits: (option.limits ?? []).map(l => i18n("midi-qol.Multiattack.Limit").replace("{max}", String(l.max)).replace("{names}", names(actor, l.refs)))
    })),
    replace: plan.replace.map(r => {
      const using = names(actor, r.refs);
      const text = r.of ? i18n("midi-qol.Multiattack.ReplaceOf").replace("{of}", names(actor, r.of)).replace("{with}", using)
        : r.n === "any" ? i18n("midi-qol.Multiattack.ReplaceAny").replace("{with}", using)
          : i18n("midi-qol.Multiattack.ReplaceN").replace("{n}", String(r.n)).replace("{with}", using);
      return { text };
    }),
    notes: plan.notes === true ? [i18n("midi-qol.Multiattack.SeeDescription")] : plan.notes ?? []
  };
}
