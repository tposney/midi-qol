import { Activity, RollMessageConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, i18n, i18nFormat, warn, moveToken } from "../../midi-qol.js";
import { replaceDefaultActivities, configSettings } from "../settings.js";
import { Workflow } from "../Workflow.js";
import { callActivityHooks, collisionLevel, completeActivityUse, getToken } from "../utils.js";
import { MidiActivityMixin, MidiActivityMixinSheet } from "./MidiActivityMixin.js";
import { highlightTokens, TokenHighlight } from "../lib/tokenHighlight.js";

export let MidiTeleportActivity: ReturnType<typeof defineMidiTeleportActivityClass>;
export let MidiTeleportSheet: ReturnType<typeof defineMidiTeleportSheetClass>;

/** dnd5e 6's teleport activity, given a midi workflow. Not present on dnd5e 5.x. */
export function setupTeleportActivity() {
  const base = GameSystemConfig.activityTypes.teleport?.documentClass;
  //@ts-expect-error no dnd5e-types
  const sheet = game.system.applications.activity.TeleportSheet;
  if (!base || !sheet) return;
  if (debugEnabled > 0) warn("MidiQOL | TeleportActivity | setupTeleportActivity | Called");
  MidiTeleportSheet = defineMidiTeleportSheetClass(sheet);
  MidiTeleportActivity = defineMidiTeleportActivityClass(base as Activity);
  if (replaceDefaultActivities) GameSystemConfig.activityTypes.teleport = { documentClass: MidiTeleportActivity };
  else GameSystemConfig.activityTypes["midiTeleport"] = { documentClass: MidiTeleportActivity };
}

export const teleportMoverModes = ["default", "caster", "casterAndTargets", "targets"] as const;
export type TeleportMoverMode = typeof teleportMoverModes[number];

interface Mover {
  token: Token.Implementation;
  /** "plan": its owner plans the move (Foundry movement planning); "place": the user picks the destination. */
  method: "plan" | "place";
}

export interface TeleportPlan {
  token: Token.Implementation;
  plan: { id?: string, origin: { x: number, y: number, elevation?: number }, destination: { x: number, y: number, elevation?: number }, waypoints?: unknown[] };
}

export interface TeleportResult extends TeleportPlan {
  moved: boolean;
}

export interface TeleportConfig {
  maxDistance: number;
  tokens: Token.Implementation[];
  movers: TeleportMoverMode;
}

type Rect = { x: number, y: number, width: number, height: number };

let defineMidiTeleportActivityClass = <T extends Activity>(ActivityClass: T) => {
  return class MidiTeleportActivity extends MidiActivityMixin(ActivityClass) {
    static LOCALIZATION_PREFIXES = ["midi-qol.TELEPORT", ...super.LOCALIZATION_PREFIXES];

    static metadata =
      foundry.utils.mergeObject(
        super.metadata, {
        title: configSettings.activityNamePrefix ? "midi-qol.TELEPORT.Title.one" : ActivityClass.metadata.title,
        dnd5eTitle: ActivityClass.metadata.title,
        sheetClass: MidiTeleportSheet,
        // No `chatCard` (see UtilityActivity). The card's Teleport button runs midi's planning.
        usage: { actions: { planTeleport: MidiTeleportActivity.#planTeleport } },
        // dnd5e lists the card's targets (Targeted/Selected): who teleports, apart from the caster.
        targetPhase: "pre"
      }, { inplace: false, insertKeys: true, insertValues: true });

    static defineSchema() {
      const { BooleanField, SchemaField, StringField } = foundry.data.fields;
      return {
        ...super.defineSchema(),
        midiTeleport: new SchemaField({
          movers: new StringField({ initial: "default", required: true, blank: false,
            choices: Object.fromEntries(teleportMoverModes.map(mode => [mode, `midi-qol.TELEPORT.Movers.${mode}`])) }),
          blocked: new StringField({ initial: "refuse", required: true, blank: false,
            choices: { refuse: "midi-qol.TELEPORT.BlockedModes.refuse", fail: "midi-qol.TELEPORT.BlockedModes.fail" } }),
          requireSight: new BooleanField({ initial: false })
        })
      };
    }

    get possibleOtherActivity() {
      return false;
    }

    get isTriggerableActivity() {
      return true;
    }

    /** The card's Teleport button: the tokens its targets list shows, ticked, in the Targeted or Selected view. */
    static #planTeleport(this: { planTeleport: (options: { message?: ChatMessage.Implementation, listed?: Token.Implementation[] }) => Promise<unknown> },
      event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation) {
      const list = target?.closest("[data-message-id]")?.querySelector("recorded-targets") as (HTMLElement & { targets: Iterable<string> }) | null;
      const listed = list ? Array.from(list.targets, uuid => getToken(uuid)).filter((t): t is Token.Implementation => !!t) : undefined;
      return this.planTeleport({ message, listed });
    }

    /** A caster-only teleport lists the caster on its card. */
    async _createUsageMessage(message: RollMessageConfig = {}) {
      const caster = this.casterToken;
      const TargetsField = globalThis.dnd5e?.dataModels?.chatMessage?.fields?.TargetsField;
      if (this.midiTeleport?.movers === "caster" && caster && TargetsField)
        foundry.utils.setProperty(message, "data.system.targets", TargetsField.getDescriptors([caster]));
      return super._createUsageMessage(message);
    }

    /** The teleport distance in the scene's units (dnd5e's #getSceneMaxDistance). */
    get sceneMaxDistance(): number | null {
      const teleport: { value: number, units: string } = this.teleport;
      if (!Number.isFinite(teleport.value)) return Infinity;
      const sceneUnits = canvas?.grid?.units;
      // @ts-expect-error no dnd5e-types
      const units = CONFIG.DND5E.movementUnits;
      if (!(teleport.units in units) || !(teleport.value > 0) || !((sceneUnits ?? "") in units)) return null;
      // @ts-expect-error no dnd5e-types
      return dnd5e.utils.convertLength(teleport.value, teleport.units, sceneUnits);
    }

    get casterToken(): Token.Implementation | undefined {
      return getToken(this.actor);
    }

    /**
     * The tokens the activity teleports and how each one's destination is chosen. `listed`: what the card's targets
     * list shows when its Teleport button is pressed.
     */
    teleportMovers(targets: Token.Implementation[], listed?: Token.Implementation[]): Mover[] {
      const caster = this.casterToken;
      const others = targets.filter(t => t !== caster);
      switch (this.midiTeleport?.movers as TeleportMoverMode) {
        case "caster": return caster ? [{ token: caster, method: "plan" }] : [];
        case "casterAndTargets": return caster ? [{ token: caster, method: "plan" }, ...others.map(token => ({ token, method: "place" as const }))] : [];
        case "targets": return targets.map(token => ({ token, method: "place" }));
        default: {
          // dnd5e's own choice, the controlled tokens (the list's Selected view), or what the list shows instead.
          // @ts-expect-error no dnd5e-types
          const tokens: Token.Implementation[] = listed ?? (canvas?.tokens?.controlled.length ? dnd5e.utils.getSceneTargets() : []);
          // Only an owner can plan a token's move; the user places the rest.
          return tokens.map(token => ({ token, method: token.document.isOwner ? "plan" : "place" }));
        }
      }
    }

    /**
     * Teleport the movers: those planned by their owner move as dnd5e moves them; the others go where the user
     * picks, within 5 ft of the caster's destination (casterAndTargets) or within the teleport distance of the
     * caster (targets), and a GM moves those the user doesn't own. dnd5e's and midi's teleport hooks and midi's
     * preTeleport/postTeleport on-use passes run as for dnd5e's own planning.
     */
    async planTeleport({ message, workflow, listed }: { message?: ChatMessage.Implementation, workflow?: Workflow, listed?: Token.Implementation[] } = {}): Promise<TeleportResult[] | null | undefined> {
      if (!this.canPlanTeleport) return null;
      workflow ??= Workflow.getWorkflow(message?.uuid);
      const targets = listed ?? this.#workflowTargets(workflow, message);
      const movers = this.teleportMovers(targets, listed);
      if (!movers.length) {
        ui.notifications?.warn("DND5E.ActionWarningNoToken", { localize: true });
        return null;
      }
      const maxDistance = this.sceneMaxDistance;
      if (!maxDistance || maxDistance <= 0) {
        ui.notifications?.warn("DND5E.TELEPORT.Warning.InvalidDistance", { localize: true });
        return null;
      }

      const config: TeleportConfig = { maxDistance, tokens: movers.map(m => m.token), movers: this.midiTeleport?.movers ?? "default" };
      if (Hooks.call("dnd5e.preTeleport", this, config) === false) return;
      if (await callActivityHooks(this, "midi-qol.preTeleport", workflow, config) === false) return;
      if (workflow && await this.#callTeleportMacros(workflow, "preTeleport", { teleport: config })) return;
      const kept = movers.filter(m => config.tokens.includes(m.token));

      const highlight = highlightTokens(kept.map(m => m.token));
      let plans: (TeleportPlan[] & { failed?: boolean }) | undefined;
      try {
        plans = await this.#planMovers(kept, config.maxDistance, highlight);
      } finally {
        highlight.remove();
      }
      if (!plans) return;
      if (Hooks.call("dnd5e.teleport", this, plans.map(p => ({ token: p.token, plan: p.plan }))) === false) return;
      if (plans.failed) {
        await this.#failTeleport(kept.map(m => m.token));
        return [];
      }

      const results = await Promise.all(plans.map(async p => ({ token: p.token, plan: p.plan, moved: await this.#move(p) })));
      Hooks.callAll("dnd5e.postTeleport", this, results);
      if (workflow) workflow.teleportResults = results;
      await callActivityHooks(this, "midi-qol.postTeleport", workflow, results);
      if (workflow) await this.#callTeleportMacros(workflow, "postTeleport", { teleport: { ...config, results } });
      return results;
    }

    #workflowTargets(workflow: Workflow | undefined, message: ChatMessage.Implementation | undefined): Token.Implementation[] {
      if (workflow?.targets?.size) return Array.from(workflow.targets);
      // @ts-expect-error no dnd5e-types
      const descriptors: { token?: string }[] = message?.system?.targets ?? [];
      return descriptors.map(d => getToken(d.token)).filter((t): t is Token.Implementation => !!t);
    }

    /** Run the item's on-use macros for a teleport pass; true when one returned false (cancel). */
    async #callTeleportMacros(workflow: Workflow, pass: "preTeleport" | "postTeleport", options: Record<string, unknown>): Promise<boolean> {
      if (!configSettings.allowUseMacro || workflow.workflowOptions?.noOnUseMacro === true) return false;
      const results = await workflow.callMacros(workflow.item, workflow.onUseMacros?.getMacros(pass), "OnUse", pass, options);
      return results.some(r => r === false);
    }

    async #planMovers(movers: Mover[], maxDistance: number, highlight: TokenHighlight): Promise<(TeleportPlan[] & { failed?: boolean }) | undefined> {
      const plans: TeleportPlan[] & { failed?: boolean } = [];
      const caster = this.casterToken;
      const fail = this.midiTeleport?.blocked === "fail";
      let anchor: Rect | undefined;
      for (const mover of movers.filter(m => m.method === "plan")) {
        highlight.setActive(mover.token);
        for (let attempt = 0; attempt < 5; attempt++) {
          const plan = await mover.token.planMovement({ allowedActions: ["blink"], direct: true, maxDistance, preventDrop: true });
          if (!plan) break;
          const rect = this.#rectAt(mover.token, plan.destination);
          const problem = this.#destinationProblem(mover.token, rect, plans, { from: caster });
          if (problem && !fail) {
            ui.notifications?.warn(i18nFormat("midi-qol.TELEPORT.Blocked", { name: mover.token.name, reason: i18n(problem) }));
            continue;
          }
          if (problem) plans.failed = true;
          plans.push({ token: mover.token, plan });
          if (mover.token === caster) anchor = rect;
          break;
        }
      }
      const placed = movers.filter(m => m.method === "place");
      // A failed teleport fails for everyone: no one else needs a destination.
      if (!placed.length || plans.failed) return plans;
      const mode = this.midiTeleport?.movers as TeleportMoverMode;
      if (mode === "casterAndTargets" && !anchor) return plans;
      for (const mover of placed) {
        const constraint = mode === "casterAndTargets"
          ? { near: anchor!, within: canvas!.grid!.distance }
          : { near: caster ? this.#rectAt(caster, caster.document) : undefined, within: maxDistance };
        highlight.setActive(mover.token);
        let rect = await this.#pickDestination(mover.token, constraint, plans, fail);
        if (rect === null) return; // dismissed
        if (!rect && mode === "casterAndTargets") rect = this.#nearestFree(mover.token, anchor!, plans);
        if (!rect) {
          if (mode === "casterAndTargets") ui.notifications?.warn(i18nFormat("midi-qol.TELEPORT.NoSpace", { name: mover.token.name }));
          continue;
        }
        if (fail && this.#destinationProblem(mover.token, rect, plans, { from: anchor ? undefined : caster, reachableFrom: anchor })) plans.failed = true;
        const origin = { x: mover.token.document.x, y: mover.token.document.y, elevation: mover.token.document.elevation };
        const destination = { x: rect.x, y: rect.y, elevation: anchor ? plans[0]?.plan.destination.elevation : origin.elevation };
        plans.push({ token: mover.token, plan: { origin, destination, waypoints: [] } });
      }
      return plans;
    }

    /**
     * Let the user pick where `token` goes: Foundry's token placement preview, nothing created. Undefined when the
     * user skips it (right click), null when they dismiss the placement.
     */
    async #pickDestination(token: Token.Implementation, constraint: { near?: Rect, within: number }, plans: TeleportPlan[], fail: boolean): Promise<Rect | undefined | null> {
      let skipped = false;
      const placed = await canvas!.tokens!.placeTokens([token.document.toObject()], {
        create: false,
        allowRotation: false,
        preConfirm: ({ document }: { document: TokenDocument.Implementation }) => {
          const rect = this.#rectAt(token, document);
          const problem = (constraint.near && this.#gapDistance(constraint.near, rect) > constraint.within + 0.01)
            ? "midi-qol.TELEPORT.TooFar"
            : (fail ? undefined : this.#destinationProblem(token, rect, plans, { reachableFrom: this.midiTeleport?.movers === "casterAndTargets" ? constraint.near : undefined }));
          if (problem) ui.notifications?.warn(i18nFormat("midi-qol.TELEPORT.Blocked", { name: token.name, reason: i18n(problem) }));
          return !problem;
        },
        preSkip: () => { skipped = true; }
      });
      if (skipped) return undefined;
      if (!placed?.length) return null;
      return this.#rectAt(token, placed[0]);
    }

    /** The nearest free space within 5 ft of `anchor`, or undefined. */
    #nearestFree(token: Token.Implementation, anchor: Rect, plans: TeleportPlan[]): Rect | undefined {
      const size = canvas!.grid!.size;
      const w = token.document.width * size, h = token.document.height * size;
      const candidates: Rect[] = [];
      for (let dx = -w; dx <= anchor.width; dx += size) {
        for (let dy = -h; dy <= anchor.height; dy += size) {
          const rect = { x: anchor.x + dx, y: anchor.y + dy, width: w, height: h };
          if (this.#overlaps(rect, anchor)) continue;
          candidates.push(rect);
        }
      }
      const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
      const a = centre(anchor);
      candidates.sort((r1, r2) => Math.hypot(centre(r1).x - a.x, centre(r1).y - a.y) - Math.hypot(centre(r2).x - a.x, centre(r2).y - a.y));
      return candidates.find(rect => !this.#destinationProblem(token, rect, plans, { reachableFrom: anchor }));
    }

    /**
     * Why `token` can't arrive at `rect`, or undefined: it must be inside the scene, on an unoccupied space (other
     * tokens and the other movers' destinations), not inside a wall, reachable from `reachableFrom` without
     * crossing a wall, and seen from `from` when the activity requires sight.
     */
    #destinationProblem(token: Token.Implementation, rect: Rect, plans: TeleportPlan[], { from, reachableFrom }: { from?: Token.Implementation, reachableFrom?: Rect } = {}): string | undefined {
      const scene = canvas!.dimensions!.sceneRect;
      if (rect.x < scene.x || rect.y < scene.y || rect.x + rect.width > scene.x + scene.width || rect.y + rect.height > scene.y + scene.height)
        return "midi-qol.TELEPORT.OutsideScene";
      const movingIds = new Set(plans.map(p => p.token.id));
      const occupied = canvas!.tokens!.placeables.some(t => t !== token && !movingIds.has(t.id) && t.document.hidden !== true
        && this.#overlaps(rect, this.#rectAt(t, t.document)));
      const reserved = plans.some(p => p.token !== token && this.#overlaps(rect, this.#rectAt(p.token, p.plan.destination)));
      if (occupied || reserved) return "midi-qol.TELEPORT.Occupied";
      if (this.#wallInside(rect, token)) return "midi-qol.TELEPORT.InWall";
      const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      if (reachableFrom) {
        const origin = { x: reachableFrom.x + reachableFrom.width / 2, y: reachableFrom.y + reachableFrom.height / 2 };
        if (this.#collides(origin, centre, "move", token)) return "midi-qol.TELEPORT.BehindWall";
      }
      if (from && this.midiTeleport?.requireSight && this.#collides(from.center, centre, "sight", from)) return "midi-qol.TELEPORT.NotSeen";
      return undefined;
    }

    #collides(origin: { x: number, y: number }, destination: { x: number, y: number }, type: "move" | "sight", token: Token.Implementation): boolean {
      // @ts-expect-error v14 collision level not in fvtt-types
      return !!CONFIG.Canvas.polygonBackends[type].testCollision(origin, destination, { type, mode: "any", level: collisionLevel(token) });
    }

    /** A movement-blocking wall crossing the space: its edges or diagonals, inset so bordering walls don't count. */
    #wallInside(rect: Rect, token: Token.Implementation): boolean {
      const inset = 2;
      const l = rect.x + inset, t = rect.y + inset, r = rect.x + rect.width - inset, b = rect.y + rect.height - inset;
      const segments = [[l, t, r, t], [r, t, r, b], [r, b, l, b], [l, b, l, t], [l, t, r, b], [r, t, l, b]];
      return segments.some(([x0, y0, x1, y1]) => this.#collides({ x: x0, y: y0 }, { x: x1, y: y1 }, "move", token));
    }

    #rectAt(token: Token.Implementation, position: { x: number, y: number }): Rect {
      const size = canvas!.grid!.size;
      return { x: position.x, y: position.y, width: token.document.width * size, height: token.document.height * size };
    }

    #overlaps(a: Rect, b: Rect): boolean {
      const e = 1;
      return a.x < b.x + b.width - e && b.x < a.x + a.width - e && a.y < b.y + b.height - e && b.y < a.y + a.height - e;
    }

    /** The gap between two spaces in scene units: 0 when touching, one square's distance when one square apart. */
    #gapDistance(a: Rect, b: Rect): number {
      const size = canvas!.grid!.size;
      const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
      const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
      return (Math.round(Math.max(dx, dy) / size) + 1) * canvas!.grid!.distance;
    }

    async #move({ token, plan }: TeleportPlan): Promise<boolean> {
      if (plan.id) return token.document.startMovement(plan.id);
      const centre = { x: plan.destination.x + token.w / 2, y: plan.destination.y + token.h / 2, elevation: plan.destination.elevation };
      if (!token.document.isOwner && !game.users?.activeGM) {
        ui.notifications?.warn(i18nFormat("midi-qol.TELEPORT.NoGM", { name: token.name }));
        return false;
      }
      await moveToken(token.document, centre, { teleport: true });
      return true;
    }

    /** Dimension Door: an arrival in an occupied or filled space fails the teleport and damages every traveller. */
    async #failTeleport(travellers: Token.Implementation[]) {
      ui.notifications?.warn(i18n("midi-qol.TELEPORT.Failed"));
      // @ts-expect-error no dnd5e-types
      const damage = this.item.system.activities.find(a => a.type === "damage" && a.id !== this.id);
      if (!damage) return;
      // The travellers are the targets: nothing to confirm.
      await completeActivityUse(damage, { midiOptions: { targetUuids: travellers.map(t => t.document.uuid), ignoreUserTargets: true,
        workflowOptions: { targetConfirmation: "none" } } }, { configure: false }, {});
    }
  }
}

let defineMidiTeleportSheetClass = (baseClass: any) => {
  return class MidiTeleportSheet extends MidiActivityMixinSheet(baseClass) {
    static PARTS = {
      ...super.PARTS,
      effect: {
        template: "modules/midi-qol/templates/activity/teleport-effect.hbs",
        templates: [
          ...super.PARTS.effect.templates,
          "modules/midi-qol/templates/activity/parts/teleport-midi.hbs"
        ]
      }
    };
  }
}
