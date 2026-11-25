import { i18n } from "../../../midi-qol.js";
import type { Workflow } from "../../Workflow.js";
import { registerUseOptions, type UseOption, type UseOptionSection } from "../../services/useOptions/registry.js";
import { acceptCasting, castingOffers, itemCastingEntries, runEvent, type CastingOffer } from "./engine.js";
import { costAllows, offerName, poolCost } from "./offers.js";
import { useContext } from "./useEvents.js";

/*
 * offer "casting": an entry chosen as a use starts (Metamagic on a spell, a manoeuvre before the attack). Offered as use
 * options (services/useOptions): a section of dnd5e's usage dialog per group (its limit the group's, its budget the
 * entries' shared cost), or the small prompt when no dialog is shown. Choosing pays; a `use.configure` entry then runs
 * on the use's copy, before the bonus action and reaction checks and before anything is consumed; an entry at a later
 * event runs there as taken.
 */

const PROVIDER = "midi-qol.entries";
const offered = new WeakMap<Workflow, CastingOffer[]>();

const groupLabel = (group: string | undefined) => {
  if (!group) return i18n("midi-qol.Entries.Casting.Options");
  const key = `midi-qol.Entries.Groups.${group}`;
  return game.i18n?.has(key) ? i18n(key) : group.charAt(0).toUpperCase() + group.slice(1);
};

function optionOf(offer: CastingOffer): UseOption {
  const f = offer.found;
  const cost = poolCost(f);
  const document = f.document as { img?: string | null, item?: { img?: string | null } };
  return {
    id: offer.key, label: offerName(f), img: document.img ?? document.item?.img ?? undefined,
    ...(cost ? { cost: cost.amount } : {}),
    ...(offer.allowed ? {} : { disabled: cost ? i18n("midi-qol.Entries.Casting.NotEnough").replace("{label}", cost.label) : i18n("midi-qol.Entries.Casting.NoUses") })
  };
}

function sectionsOf(list: CastingOffer[]): UseOptionSection[] {
  const byGroup = new Map<string, CastingOffer[]>();
  for (const offer of list) {
    // An entry that stacks takes none of its group's room: listed with the ungrouped
    const group = offer.found.entry.stacks ? "" : offer.found.entry.group ?? "";
    byGroup.set(group, [...(byGroup.get(group) ?? []), offer]);
  }
  return [...byGroup].map(([group, offers]) => {
    const costs = offers.map(o => poolCost(o.found));
    const shared = costs[0] && costs.every(c => c && c.from.join() === costs[0]!.from.join()) ? costs[0] : undefined;
    return {
      id: group, label: groupLabel(group || undefined), options: offers.map(optionOf),
      ...(group && Number.isFinite(offers[0].groupLimit) ? { limit: offers[0].groupLimit } : {}),
      ...(shared ? { budget: { amount: shared.left, label: shared.label } } : {})
    };
  });
}

/** An item that is an option chosen as a use starts (a Metamagic feature): the hub doesn't list it as a use */
export function isCastingOption(item: Item.Implementation | null | undefined): boolean {
  const actor = item?.actor as Actor.Implementation | null | undefined;
  return !!item && !!actor && itemCastingEntries(item, actor).length > 0;
}

/** The hub's hint on a spell cast with an action: an option the caster can pay for makes it a bonus action (Quickened) */
export function bonusActionHint(item: Item.Implementation | null | undefined, activation: string): string | undefined {
  const actor = item?.actor as Actor.Implementation | null | undefined;
  if (!item || !actor || (item.type as string) !== "spell" || activation !== "action") return undefined;
  for (const feature of actor.items) {
    if ((feature.type as string) !== "feat") continue;
    for (const f of itemCastingEntries(feature, actor)) {
      if (!f.entry.do?.some(action => (action.change as { activation?: string } | undefined)?.activation === "bonus") || !costAllows(f)) continue;
      const cost = poolCost(f);
      return cost ? i18n("midi-qol.Entries.Casting.BonusHint").replace("{name}", feature.name ?? "").replace("{n}", String(cost.amount)).replace("{label}", cost.label)
        : i18n("midi-qol.Entries.Casting.BonusHintFree").replace("{name}", feature.name ?? "");
    }
  }
  return undefined;
}

export function registerCastingOffers() {
  registerUseOptions(PROVIDER, {
    label: "midi-qol.Entries.Casting.Options",
    offer: () => [],
    sections: async ({ workflow }) => {
      const list = await castingOffers(useContext(workflow));
      offered.set(workflow, list);
      return sectionsOf(list);
    },
    apply: async (chosen, ctx) => {
      const keys = new Set(chosen.map(o => o.id));
      const taken = (offered.get(ctx.workflow) ?? []).filter(o => keys.has(o.key));
      if (!taken.length) return;
      // The use's copy is what the changes are made on (dnd5e's consumption sets it on the workflow next)
      ctx.workflow.activity = ctx.activity;
      const context = { ...useContext(ctx.workflow, { usage: ctx.usageConfig, afterDialog: true }), offers: "casting" as const };
      const paid = await acceptCasting(taken, context);
      if (!paid) {
        ui.notifications?.warn(i18n("midi-qol.Entries.Casting.CantPay"));
        return false;
      }
      await runEvent("use.configure", context);
      if (ctx.workflow.aborted) { await paid.refund(); return false; }
      return paid;
    }
  });
}
