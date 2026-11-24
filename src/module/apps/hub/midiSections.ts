import { i18n } from "../../../midi-qol.js";
import type { ActivityCell, TurnModel } from "../../services/turnModel/model.js";
import { escape, registerHubSection, type HubContext } from "./sections.js";
import { takeDash, takeDisengage } from "../../services/economy/movement.js";
import { runInteraction } from "../../services/interactions/registry.js";
import { deferredUses, dropDeferred, releaseDeferred } from "../../lib/deferred.js";
import { heldUses } from "../../lib/holds.js";
import { HoldPanel } from "../HoldPanel.js";
import { combatOfToken } from "../../lib/tokenResolver.js";
import { isMultiattackItem } from "../../services/multiattack/plans.js";

/*
 * M27: midi's own hub sections. Left: the creature's state and its economy. Centre: its bar (the user's own, else the
 * sheet's favourites and its attacks), the tabs of everything else, and an NPC's Multiattack. Right: what's waiting
 * (requests, readied uses, the GM's holds, legendary and lair offers) and the turn (End turn, with what's unused).
 * Cost marks: one shape and colour per cost, on the pips and on every button that spends it.
 */

type Kind = "action" | "bonus" | "reaction" | "legendary" | "lair" | "free" | "other";

/** What a use costs, as a mark */
function costKind(cell: ActivityCell): Kind {
  if (cell.multiattack) return "free";
  if (cell.activation === "legendary" || cell.activation === "mythic") return "legendary";
  if (cell.activation === "lair") return "lair";
  if (cell.cost.action) return "action";
  if (cell.cost.bonus) return "bonus";
  if (cell.cost.reaction) return "reaction";
  if (cell.activation === "action") return "free";
  return "other";
}
const mark = (kind: Kind | "movement", spent = false) => `<span class="midi-hub-mark midi-hub-mark-${kind}${spent ? " midi-hub-spent" : ""}"></span>`;

/** A button that uses the activity (greyed with its reason when it can't) */
function useButton(cell: ActivityCell, options: { barIndex?: number, removable?: boolean } = {}): string {
  const kind = costKind(cell);
  const several = cell.name && cell.name !== cell.itemName;
  const title = several ? `${cell.itemName}: ${cell.name}` : cell.itemName;
  const tip = [`<strong>${escape(title)}</strong>`, escape(i18n(`midi-qol.Hub.Cost.${kind}`)),
    ...(cell.uses ? [`${cell.uses.value}/${cell.uses.max}`] : []), ...(cell.spellLevel ? [i18n("midi-qol.Hub.SlotsLeft").replace("{n}", String(cell.slotsLeft ?? 0))] : []),
    ...(!cell.usable && cell.reason ? [`<em>${escape(cell.reason)}</em>`] : []), ...(options.removable ? [`<span class="hint">${escape(i18n("midi-qol.Hub.RightClickRemove"))}</span>`] : [])].join("<br>");
  return `<button type="button" class="midi-hub-use${cell.usable ? "" : " midi-hub-unusable"}${cell.multiattack ? " midi-hub-allowed" : ""}" draggable="true"
    data-hub-action="use" data-uuid="${escape(cell.uuid)}"${options.barIndex !== undefined ? ` data-bar-index="${options.barIndex}" data-hub-context="remove"` : ""}
    data-tooltip-html="${escape(tip)}" data-tooltip-direction="UP">
    <img src="${escape(cell.img)}" alt="">${mark(kind)}${cell.uses ? `<span class="midi-hub-count">${cell.uses.value}</span>` : ""}</button>`;
}

const itemOf = (cell: ActivityCell) => fromUuidSync(cell.itemUuid) as Item.Implementation | null;
const isAttack = (cell: ActivityCell) => cell.type === "attack";

/** The user's own bar for this creature, else the sheet's favourites then its attacks */
function barCells(ctx: HubContext): { cells: ActivityCell[], own: boolean } {
  const byUuid = new Map(ctx.model.activities.map(c => [c.uuid, c]));
  const own = game.user?.flags?.["midi-qol"]?.hubBars?.find(b => b.actor === ctx.actor.uuid);
  if (own) return { cells: own.entries.map(uuid => byUuid.get(uuid)).filter((c): c is ActivityCell => !!c), own: true };
  const favourites = ((ctx.actor.system as { favorites?: { type?: string, id?: string }[] }).favorites ?? []).flatMap(f => {
    if (!f.id || (f.type !== "item" && f.type !== "activity")) return [];
    const found = fromUuidSync(f.id, { relative: ctx.actor as never }) as { uuid?: string, system?: { activities?: { contents?: { uuid: string }[] } } } | null;
    const uuid = f.type === "activity" ? found?.uuid : found?.system?.activities?.contents?.[0]?.uuid;
    return uuid && byUuid.has(uuid) ? [byUuid.get(uuid)!] : [];
  });
  const attacks = ctx.model.activities.filter(c => isAttack(c) && !favourites.includes(c));
  return { cells: [...favourites, ...attacks], own: false };
}

async function saveBar(ctx: HubContext, entries: string[] | undefined) {
  const bars = (game.user?.flags?.["midi-qol"]?.hubBars ?? []).filter(b => b.actor !== ctx.actor.uuid);
  await game.user?.setFlag("midi-qol", "hubBars", entries ? [...bars, { actor: ctx.actor.uuid ?? "", entries }] : bars);
}

const TABS = ["bar", "weapons", "spells", "features", "items", "actions"] as const;
function tabCells(model: TurnModel, tab: string): ActivityCell[] {
  return model.activities.filter(cell => {
    const type = itemOf(cell)?.type as string | undefined;
    if (isMultiattackItem(itemOf(cell) as Item.Implementation)) return false;
    switch (tab) {
      case "weapons": return type === "weapon";
      case "spells": return type === "spell";
      case "features": return type === "feat";
      case "items": return !!type && !["weapon", "spell", "feat"].includes(type);
      default: return false;
    }
  });
}

/** Offers the GM is to answer in the hub (legendary and lair): set by the hub's presenter */
export const hubOffers: { actor: Actor.Implementation, title: string, reason: string, choices: { uuid: string, label: string }[], resolve(uuid: string | undefined): void }[] = [];

export function registerMidiHubSections() {
  // State: portrait, HP, AC, speed, concentration, conditions, what ends soon
  registerHubSection({
    id: "midi-qol.state", area: "left", order: 10,
    render: ({ actor, token, model }) => {
      const sys = actor.system as { attributes?: { hp?: { value?: number, max?: number, temp?: number }, ac?: { value?: number } } };
      const hp = sys.attributes?.hp ?? {};
      const pct = hp.max ? Math.max(0, Math.min(100, Math.round(100 * (hp.value ?? 0) / hp.max))) : 0;
      const conditions = [...actor.statuses].map(id => CONFIG.statusEffects.find(s => s.id === id)).filter(Boolean)
        .map(s => `<img class="midi-hub-condition" src="${escape(s!.img)}" data-tooltip="${escape(s!.name ? i18n(s!.name) : s!.id)}">`).join("");
      const held = model.checklist.filter(i => i.phase === "start" && (i.kind === "held" || i.kind === "ending"))
        .map(i => `<div class="midi-hub-note midi-hub-note-${i.kind}"><i class="${escape(i.icon ?? "fa-solid fa-circle-info")}"></i> ${escape(i.label)}</div>`).join("");
      return `<div class="midi-hub-state">
        <img class="midi-hub-portrait" src="${escape(token?.texture?.src ?? actor.img)}" alt="">
        <div class="midi-hub-vitals">
          <div class="midi-hub-name">${escape(token?.name ?? actor.name)}</div>
          <div class="midi-hub-hp" data-tooltip="${escape(i18n("midi-qol.Hub.HP"))}"><div class="midi-hub-hp-fill" style="width:${pct}%"></div>
            <span>${hp.value ?? 0}/${hp.max ?? 0}${hp.temp ? ` +${hp.temp}` : ""}</span></div>
          <div class="midi-hub-stats"><span data-tooltip="${escape(i18n("midi-qol.Hub.AC"))}"><i class="fa-solid fa-shield-halved"></i> ${sys.attributes?.ac?.value ?? "-"}</span>
            ${model.economy.movement ? `<span data-tooltip="${escape(i18n("midi-qol.Hub.Movement"))}">${mark("movement")} ${model.economy.movement.remaining}/${model.economy.movement.allowed} ${escape(model.economy.movement.units)}</span>` : ""}</div>
          <div class="midi-hub-conditions">${conditions}</div>
          ${held}
        </div>
      </div>`;
    }
  });

  // Economy: a pip per use left of each kind, in its cost shape; legendary uses; attacks left
  registerHubSection({
    id: "midi-qol.economy", area: "left", order: 20,
    render: ({ model }) => {
      const order = (id: string) => ["action", "bonus", "reaction"].indexOf(id) >= 0 ? ["action", "bonus", "reaction"].indexOf(id) : 9;
      const kinds = Object.entries(model.economy.windows).filter(([, w]) => w.tracked).sort((a, b) => order(a[0]) - order(b[0]));
      const pips = kinds.map(([id, w]) => {
        const kind = (["action", "bonus", "reaction"].includes(id) ? id : "other") as Kind;
        const marks = Array.from({ length: Math.max(1, w.max) }, (_, i) => mark(kind, i >= w.max - w.used)).join("");
        return `<span class="midi-hub-pips" data-tooltip="${escape(w.label)}">${marks}</span>`;
      });
      const legendary = model.economy.legendary
        ? `<span class="midi-hub-pips" data-tooltip="${escape(i18n("midi-qol.Hub.Cost.legendary"))}">${Array.from({ length: model.economy.legendary.max }, (_, i) => mark("legendary", i >= model.economy.legendary!.value)).join("")}</span>` : "";
      const attacks = model.economy.attacksLeft > 0 ? `<span class="midi-hub-badge">${escape(i18n("midi-qol.Hub.AttacksLeft").replace("{n}", String(model.economy.attacksLeft)))}</span>` : "";
      return `<div class="midi-hub-economy">${pips.join("")}${legendary}${attacks}</div>`;
    }
  });

  // An NPC's Multiattack: its own button; while the run is open, the attacks it allows (marked free)
  registerHubSection({
    id: "midi-qol.multiattack", area: "center", order: 5,
    when: ({ actor, model }) => (actor.type as string) === "npc" && model.activities.some(c => isMultiattackItem(itemOf(c) as Item.Implementation)),
    render: ({ model }) => {
      const own = model.activities.find(c => isMultiattackItem(itemOf(c) as Item.Implementation))!;
      const run = model.economy.multiattack;
      const allowed = run ? model.activities.filter(c => run.allowed.includes(c.uuid)) : [];
      const left = run?.attacksLeft !== null && run?.attacksLeft !== undefined ? ` (${escape(i18n("midi-qol.Hub.AttacksLeft").replace("{n}", String(run.attacksLeft)))})` : "";
      return `<div class="midi-hub-multiattack">
        <button type="button" class="midi-hub-multi${own.usable ? "" : " midi-hub-unusable"}" data-hub-action="use" data-uuid="${escape(own.uuid)}"
          data-tooltip="${escape(own.usable ? i18n("midi-qol.Multiattack.Title").replace("{name}", "") : own.reason ?? "")}"><i class="fa-solid fa-burst"></i> ${escape(own.itemName)}</button>
        ${run ? `<span class="midi-hub-label">${run.complete ? escape(i18n("midi-qol.Multiattack.Done")) : escape(i18n("midi-qol.Hub.AllowedNow")) + left}</span>${allowed.map(c => useButton(c)).join("")}` : ""}
      </div>`;
    }
  });

  // The bar and the tabs: the user's own bar (drag on, drag to reorder, right-click to remove) or the default
  registerHubSection({
    id: "midi-qol.use", area: "center", order: 10,
    render: (ctx) => {
      const tabs = TABS.map(tab => `<a class="midi-hub-tab${ctx.tab === tab ? " active" : ""}" data-hub-action="tab" data-tab="${tab}">${escape(i18n(`midi-qol.Hub.Tab.${tab}`))}</a>`).join("");
      let body = "";
      if (ctx.tab === "bar") {
        const { cells, own } = barCells(ctx);
        body = `<div class="midi-hub-bar" data-hub-drop="bar">${cells.map((c, i) => useButton(c, { barIndex: i, removable: true })).join("")}
          <span class="midi-hub-drop-hint">${escape(i18n(own ? "midi-qol.Hub.DropHere" : "midi-qol.Hub.DropToArrange"))}</span>
          ${own ? `<a class="midi-hub-reset" data-hub-action="resetBar" data-tooltip="${escape(i18n("midi-qol.Hub.ResetBar"))}"><i class="fa-solid fa-rotate-left"></i></a>` : ""}</div>`;
      } else if (ctx.tab === "actions") {
        const offers = [...ctx.model.interactions.self, ...ctx.model.interactions.target].map(o =>
          `<button type="button" class="midi-hub-action${o.reason ? " midi-hub-unusable" : ""}" data-hub-action="interaction" data-id="${escape(o.id)}" data-tooltip="${escape(o.reason ?? o.hint ?? "")}">${o.icon ? `<i class="${escape(o.icon)}"></i> ` : ""}${escape(i18n(o.label))}</button>`);
        const own = ctx.model.economy.movement ? [
          `<button type="button" class="midi-hub-action" data-hub-action="dash">${mark("action")} ${escape(i18n("midi-qol.Hub.Dash"))}</button>`,
          `<button type="button" class="midi-hub-action" data-hub-action="disengage">${mark("action")} ${escape(i18n("midi-qol.Hub.Disengage"))}</button>`] : [];
        body = `<div class="midi-hub-actions">${[...own, ...offers].join("")}</div>`;
      } else if (ctx.tab === "spells") {
        const byLevel = new Map<number, ActivityCell[]>();
        for (const cell of tabCells(ctx.model, "spells")) {
          const level = (itemOf(cell)?.system as { level?: number } | undefined)?.level ?? 0;
          byLevel.set(level, [...(byLevel.get(level) ?? []), cell]);
        }
        body = [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, cells]) =>
          `<div class="midi-hub-row"><span class="midi-hub-label">${escape(level ? i18n("midi-qol.Hub.Level").replace("{n}", String(level)) : i18n("midi-qol.Hub.Cantrips"))}</span>${cells.map(c => useButton(c)).join("")}</div>`).join("");
      } else {
        body = `<div class="midi-hub-row">${tabCells(ctx.model, ctx.tab).map(c => useButton(c)).join("")}</div>`;
      }
      return `<nav class="midi-hub-tabs">${tabs}</nav><div class="midi-hub-tab-body">${body || `<span class="hint">${escape(i18n("midi-qol.Hub.Nothing"))}</span>`}</div>`;
    },
    actions: {
      interaction: async ({ token }, target) => { if (token && target.dataset.id) await runInteraction(target.dataset.id, token, [...(game.user?.targets ?? [])][0]?.document); },
      dash: async ({ actor }) => { await takeDash(actor); },
      disengage: async ({ actor }) => { await takeDisengage(actor); },
      resetBar: async (ctx) => { await saveBar(ctx, undefined); },
      remove: async (ctx, target) => {
        const { cells } = barCells(ctx);
        const index = Number(target.dataset.barIndex);
        await saveBar(ctx, cells.map(c => c.uuid).filter((_, i) => i !== index));
      },
      drop: async (ctx, _zone, event) => {
        const drop = (event as Event & { midiHub?: { uuid: string, from: string | null, before: string | null } }).midiHub;
        if (!drop) return;
        const entries = barCells(ctx).cells.map(c => c.uuid);
        if (drop.from !== null) entries.splice(Number(drop.from), 1);
        else if (entries.includes(drop.uuid)) entries.splice(entries.indexOf(drop.uuid), 1);
        const at = drop.before !== null ? Math.min(Number(drop.before) - (drop.from !== null && Number(drop.from) < Number(drop.before) ? 1 : 0), entries.length) : entries.length;
        entries.splice(at, 0, drop.uuid);
        await saveBar(ctx, entries);
      }
    }
  });

  // What's waiting: requests owed, readied uses, the GM's holds, legendary and lair offers
  registerHubSection({
    id: "midi-qol.waiting", area: "right", order: 10,
    render: ({ actor, model, gm }) => {
      const parts: string[] = [];
      if (model.pending) parts.push(`<div class="midi-hub-note"><i class="fa-solid fa-inbox"></i> ${escape(i18n("midi-qol.Checklist.Requests").replace("{count}", String(model.pending)))}</div>`);
      for (const use of deferredUses({ actor })) parts.push(`<div class="midi-hub-note"><i class="fa-solid fa-hourglass-half"></i> ${escape(i18n("midi-qol.Checklist.Readied").replace("{name}", use.activity?.item?.name ?? ""))}
        <a data-hub-action="release" data-id="${escape(use.id)}" data-tooltip="${escape(i18n("midi-qol.Deferred.Release"))}"><i class="fa-solid fa-bolt"></i></a>
        <a data-hub-action="drop" data-id="${escape(use.id)}" data-tooltip="${escape(i18n("midi-qol.Hold.Drop"))}"><i class="fa-solid fa-xmark"></i></a></div>`);
      if (gm) {
        const held = heldUses().filter(h => h.hold.kind !== "deferred").length;
        if (held) parts.push(`<div class="midi-hub-note"><a data-hub-action="holds"><i class="fa-solid fa-hand"></i> ${escape(i18n("midi-qol.Hub.Held").replace("{n}", String(held)))}</a></div>`);
        hubOffers.forEach((offer, index) => parts.push(`<div class="midi-hub-offer"><div class="midi-hub-label">${escape(offer.title)}</div><div class="hint">${escape(offer.reason)}</div>
          ${offer.choices.map(c => `<button type="button" data-hub-action="offer" data-offer="${index}" data-uuid="${escape(c.uuid)}">${escape(c.label)}</button>`).join("")}
          <button type="button" data-hub-action="offer" data-offer="${index}">${escape(i18n("midi-qol.Legendary.Skip"))}</button></div>`));
      }
      return parts.join("");
    },
    actions: {
      release: async (_ctx, target) => { if (target.dataset.id) await releaseDeferred(target.dataset.id, { targets: [...(game.user?.targets ?? [])].map(t => t.document.uuid ?? "") }); },
      drop: async (_ctx, target) => { if (target.dataset.id) await dropDeferred(target.dataset.id); },
      holds: () => { HoldPanel.open(); },
      offer: (ctx, target) => {
        const offer = hubOffers[Number(target.dataset.offer)];
        if (!offer) return;
        hubOffers.splice(hubOffers.indexOf(offer), 1);
        offer.resolve(target.dataset.uuid || undefined);
        ctx.refresh();
      }
    }
  });

  // The turn: whose it is; End turn with what's unused
  registerHubSection({
    id: "midi-qol.turn", area: "right", order: 20,
    when: ({ model }) => model.inCombat,
    render: ({ token, model, owner, gm }) => {
      const combat = combatOfToken(token);
      if (!model.isTurn) {
        const next = combat?.turns[((combat.turn ?? 0) + 1) % (combat.turns.length || 1)];
        return next?.tokenId === token?.id ? `<div class="midi-hub-ondeck">${escape(i18n("midi-qol.Hub.OnDeck"))}</div>` : "";
      }
      const unused = model.checklist.filter(i => i.phase === "end").map(i => `<div class="midi-hub-note midi-hub-note-unused">${escape(i.label)}</div>`).join("");
      return `<div class="midi-hub-turn"><div class="midi-hub-yourturn">${escape(i18n("midi-qol.Hub.YourTurn"))}</div>${unused}
        ${owner || gm ? `<button type="button" class="midi-hub-endturn" data-hub-action="endTurn"><i class="fa-solid fa-forward"></i> ${escape(i18n("midi-qol.Checklist.EndTurn"))}</button>` : ""}</div>`;
    },
    actions: { endTurn: async ({ token }) => { await combatOfToken(token)?.nextTurn(); } }
  });
}
