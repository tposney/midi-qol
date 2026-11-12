import { Activity, RollMessageConfig } from "../../globals.js";
import { debugEnabled, GameSystemConfig, i18n, i18nFormat, warn, moveToken } from "../../midi-qol.js";
import { replaceDefaultActivities, configSettings } from "../settings.js";
import { Workflow } from "../Workflow.js";
import { callActivityHooks, collisionLevel, completeActivityUse, convertLengthTo, getToken, pauseReactionTimeout } from "../utils.js";
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

export const teleportMoverModes = ["default", "caster", "casterAndTargets", "targets", "swap"] as const;
export type TeleportMoverMode = typeof teleportMoverModes[number];
export const teleportPlanModes = ["button", "auto"] as const;

interface Mover {
  token: Token.Implementation;
  /** "plan": its owner plans the move (Foundry movement planning); "place": the user picks the destination. */
  method: "plan" | "place";
}

/** A token position; `level` is the scene level's id (Foundry 14). */
type Position = { x: number, y: number, elevation?: number, level?: string };

export interface TeleportPlan {
  token: Token.Implementation;
  plan: { id?: string, origin: Position, destination: Position, waypoints?: unknown[] };
}

export interface TeleportResult extends TeleportPlan {
  moved: boolean;
}

export interface TeleportConfig {
  maxDistance: number;
  tokens: Token.Implementation[];
  movers: TeleportMoverMode;
}

/** midiOptions.teleport: "button" leaves an auto teleport to the card's button; destinations move without asking. */
export type TeleportOption = "button" | { destinations?: Record<string, Position> };

type Rect = { x: number, y: number, width: number, height: number };

/** A token's footprint at a position: its grid spaces (square and hex grids) and bounds. */
interface Space {
  rect: Rect;
  cells?: { i: number, j: number }[];
  level?: string;
}

/** The level being viewed (Foundry 14). */
function viewedLevel(): { id: string, elevation: { base: number } } | undefined {
  // @ts-expect-error v14 canvas.level not in fvtt-types
  return canvas?.level ?? undefined;
}

/** A token's level id (Foundry 14). */
function tokenLevel(document: TokenDocument.Implementation): string | undefined {
  // @ts-expect-error v14 token level not in fvtt-types
  return document._source.level ?? undefined;
}

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
          plan: new StringField({ initial: "button", required: true, blank: false,
            choices: Object.fromEntries(teleportPlanModes.map(mode => [mode, `midi-qol.TELEPORT.PlanModes.${mode}`])) }),
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

    /** Plan: auto. The workflow's teleport, after its effects and damage, unless the use leaves it to the button. */
    async autoTeleport(workflow: Workflow) {
      if (this.midiTeleport?.plan !== "auto" || workflow.workflowOptions?.teleport === "button") return;
      return this.planTeleport({ workflow, message: workflow.chatCard });
    }

    /** The teleport distance in the scene's units (dnd5e's #getSceneMaxDistance). */
    get sceneMaxDistance(): number | null {
      const teleport: { value: number, units: string } = this.teleport;
      if (!Number.isFinite(teleport.value)) return Infinity;
      const sceneUnits = canvas?.grid?.units;
      // @ts-expect-error no dnd5e-types
      const units = CONFIG.DND5E.movementUnits;
      if (!(teleport.units in units) || !(teleport.value > 0) || !((sceneUnits ?? "") in units)) return null;
      return convertLengthTo(teleport.value, teleport.units, sceneUnits);
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
        // The caster and one other trade places: nothing to plan or pick.
        case "swap": return caster && others[0] ? [{ token: caster, method: "place" }, { token: others[0], method: "place" }] : [];
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
     * preTeleport/postTeleport on-use passes run as for dnd5e's own planning. A use's `midiOptions.teleport`
     * destinations replace the planning and picking.
     */
    async planTeleport({ message, workflow, listed }: { message?: ChatMessage.Implementation, workflow?: Workflow, listed?: Token.Implementation[] } = {}): Promise<TeleportResult[] | null | undefined> {
      if (!this.canPlanTeleport) return null;
      workflow ??= Workflow.findWorkflow(message?.uuid);
      message ??= workflow?.chatCard;
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

      const option = workflow?.workflowOptions?.teleport as TeleportOption | undefined;
      const destinations = typeof option === "object" ? option.destinations : undefined;
      const highlight = highlightTokens(kept.map(m => m.token));
      // The caster is still answering a reaction prompt while placing: the requester's timeout waits.
      const reactionRequest = workflow?.workflowOptions?.reactionRequest;
      if (reactionRequest) await pauseReactionTimeout(reactionRequest, true);
      let plans: (TeleportPlan[] & { failed?: boolean }) | undefined;
      try {
        plans = this.midiTeleport?.movers === "swap"
          ? this.#planSwap(kept, config.maxDistance)
          : await this.#planMovers(kept, config.maxDistance, highlight, destinations);
      } finally {
        highlight.remove();
        if (reactionRequest) await pauseReactionTimeout(reactionRequest, false);
      }
      if (!plans?.length) return;
      if (Hooks.call("dnd5e.teleport", this, plans.map(p => ({ token: p.token, plan: p.plan }))) === false) return;
      if (plans.failed) {
        await this.#failTeleport(kept.map(m => m.token));
        return [];
      }

      const results = await Promise.all(plans.map(async p => ({ token: p.token, plan: p.plan, moved: await this.#move(p) })));
      Hooks.callAll("dnd5e.postTeleport", this, results);
      if (workflow) workflow.teleportResults = results;
      if (message && results.some(r => r.moved)) await this.#recordTeleported(message, workflow);
      await callActivityHooks(this, "midi-qol.postTeleport", workflow, results);
      if (workflow) await this.#callTeleportMacros(workflow, "postTeleport", { teleport: { ...config, results } });
      return results;
    }

    /** The card's Teleport button goes once the move is made. */
    async #recordTeleported(message: ChatMessage.Implementation, workflow: Workflow | undefined) {
      if (!message.isOwner || !foundry.utils.getProperty(message, "system.midi")) return;
      const update = { "system.midi.progress.teleported": true } as ChatMessage.UpdateData;
      // With the run's next card write when the use's workflow is running, else at once
      if (workflow && workflow.itemCardUuid === message.uuid) await workflow.performThrottledUpdate(message, update);
      else await message.update(update).catch(() => undefined);
    }

    #workflowTargets(workflow: Workflow | undefined, message: ChatMessage.Implementation | undefined): Token.Implementation[] {
      if (workflow?.targets?.tokens.length) return workflow.targets.tokens;
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

    /** Swap: the caster and the target trade places, the target within the teleport distance (and seen, if required). */
    #planSwap(movers: Mover[], maxDistance: number): (TeleportPlan[] & { failed?: boolean }) | undefined {
      const [first, second] = movers.map(m => m.token);
      if (!first || !second) return;
      const plans: TeleportPlan[] & { failed?: boolean } = [
        { token: first, plan: { origin: this.#positionOf(first), destination: this.#positionOf(second), waypoints: [] } },
        { token: second, plan: { origin: this.#positionOf(second), destination: this.#positionOf(first), waypoints: [] } }
      ];
      const fail = this.midiTeleport?.blocked === "fail";
      let problem = this.#gap(this.#space(first, first.document), this.#space(second, second.document)) > maxDistance + 0.01
        ? "midi-qol.TELEPORT.TooFar" : undefined;
      for (const { token, plan } of plans) {
        problem ??= this.#destinationProblem(token, this.#space(token, plan.destination), plans, { from: first });
      }
      if (!problem) return plans;
      if (fail) {
        plans.failed = true;
        return plans;
      }
      ui.notifications?.warn(i18nFormat("midi-qol.TELEPORT.Blocked", { name: second.name, reason: i18n(problem) }));
      return;
    }

    async #planMovers(movers: Mover[], maxDistance: number, highlight: TokenHighlight, destinations?: Record<string, Position>): Promise<(TeleportPlan[] & { failed?: boolean }) | undefined> {
      const plans: TeleportPlan[] & { failed?: boolean } = [];
      const caster = this.casterToken;
      const fail = this.midiTeleport?.blocked === "fail";
      const given = (token: Token.Implementation) => destinations?.[token.document.uuid];
      let anchor: Space | undefined;
      for (const mover of movers.filter(m => m.method === "plan")) {
        highlight.setActive(mover.token);
        let planned = false;
        const destination = given(mover.token);
        if (destination) {
          const space = this.#space(mover.token, destination);
          const origin = this.#positionOf(mover.token);
          const problem = this.#travel(mover.token, origin, destination) > maxDistance + 0.01
            ? "midi-qol.TELEPORT.TooFar" : this.#destinationProblem(mover.token, space, plans, { from: caster });
          if (problem && !fail) {
            ui.notifications?.warn(i18nFormat("midi-qol.TELEPORT.Blocked", { name: mover.token.name, reason: i18n(problem) }));
            if (mover.token === caster) return;
            continue;
          }
          if (problem) plans.failed = true;
          plans.push({ token: mover.token, plan: { origin, destination: { elevation: origin.elevation, ...destination }, waypoints: [] } });
          if (mover.token === caster) anchor = space;
          continue;
        }
        for (let attempt = 0; attempt < 5; attempt++) {
          const plan = await mover.token.planMovement({ allowedActions: ["blink"], direct: true, maxDistance, preventDrop: true });
          if (!plan) break;
          const space = this.#space(mover.token, plan.destination);
          const problem = this.#destinationProblem(mover.token, space, plans, { from: caster });
          if (problem && !fail) {
            ui.notifications?.warn(i18nFormat("midi-qol.TELEPORT.Blocked", { name: mover.token.name, reason: i18n(problem) }));
            continue;
          }
          if (problem) plans.failed = true;
          plans.push({ token: mover.token, plan });
          if (mover.token === caster) anchor = space;
          planned = true;
          break;
        }
        // The caster not moving (dismissed, or refused every time) means no teleport.
        if (!planned && mover.token === caster) return;
      }
      const placed = movers.filter(m => m.method === "place");
      // A failed teleport fails for everyone: no one else needs a destination.
      if (!placed.length || plans.failed) return plans;
      const mode = this.midiTeleport?.movers as TeleportMoverMode;
      if (mode === "casterAndTargets" && !anchor) return plans;
      for (const mover of placed) {
        const constraint = mode === "casterAndTargets"
          ? { near: anchor!, within: canvas!.grid!.distance }
          : { near: caster ? this.#space(caster, caster.document) : undefined, within: maxDistance };
        highlight.setActive(mover.token);
        const origin = this.#positionOf(mover.token);
        let destination: Position | undefined | null = given(mover.token);
        if (destination) {
          const problem = this.#placementProblem(mover.token, this.#space(mover.token, destination), constraint, plans, fail);
          if (problem) {
            ui.notifications?.warn(i18nFormat("midi-qol.TELEPORT.Blocked", { name: mover.token.name, reason: i18n(problem) }));
            continue;
          }
        } else {
          destination = await this.#pickDestination(mover.token, constraint, plans, fail);
          if (destination === null) return; // dismissed
        }
        if (!destination && mode === "casterAndTargets") destination = this.#nearestFree(mover.token, anchor!, plans);
        if (!destination) {
          if (mode === "casterAndTargets") ui.notifications?.warn(i18nFormat("midi-qol.TELEPORT.NoSpace", { name: mover.token.name }));
          continue;
        }
        const space = this.#space(mover.token, destination);
        if (fail && this.#destinationProblem(mover.token, space, plans, { from: anchor ? undefined : caster, reachableFrom: anchor })) plans.failed = true;
        // Next to the caster's destination: on its level; otherwise the level the pick was made on.
        const { elevation, level } = anchor ? plans[0]!.plan.destination : { ...origin, ...destination };
        plans.push({ token: mover.token, plan: { origin, destination: { x: destination.x, y: destination.y, elevation, level }, waypoints: [] } });
      }
      return plans;
    }

    /** Why a placed mover can't go to `space`: too far from its anchor, or (unless the teleport fails instead) blocked. */
    #placementProblem(token: Token.Implementation, space: Space, constraint: { near?: Space, within: number }, plans: TeleportPlan[], fail: boolean): string | undefined {
      if (constraint.near && this.#gap(constraint.near, space) > constraint.within + 0.01) return "midi-qol.TELEPORT.TooFar";
      if (fail) return undefined;
      return this.#destinationProblem(token, space, plans, { reachableFrom: this.midiTeleport?.movers === "casterAndTargets" ? constraint.near : undefined });
    }

    /**
     * Let the user pick where `token` goes: Foundry's token placement preview, nothing created. Undefined when the
     * user skips it (right click), null when they dismiss the placement.
     */
    async #pickDestination(token: Token.Implementation, constraint: { near?: Space, within: number }, plans: TeleportPlan[], fail: boolean): Promise<Position | undefined | null> {
      let skipped = false;
      // Foundry places only tokens the user owns and moves the preview in x and y alone: preview an owned token (the
      // caster's) with the mover's size and image, on the level being viewed.
      const owned = token.document.isOwner ? token.document : this.casterToken?.document;
      if (!owned?.isOwner) {
        ui.notifications?.warn(i18nFormat("midi-qol.TELEPORT.NoGM", { name: token.name }));
        return undefined;
      }
      const mover = token.document.toObject();
      // On its own level it keeps its height (a flier stays in the air); on another, it stands on that level's floor.
      const viewed = viewedLevel();
      const sameLevel = !viewed || viewed.id === tokenLevel(token.document);
      const preview = { ...owned.toObject(), name: mover.name, texture: mover.texture, width: mover.width, height: mover.height,
        shape: mover.shape, rotation: mover.rotation, level: sameLevel ? tokenLevel(token.document) : viewed.id,
        elevation: sameLevel ? mover.elevation : viewed.elevation.base };
      const placed = await canvas!.tokens!.placeTokens([preview], {
        create: false,
        allowRotation: false,
        preConfirm: ({ document }: { document: TokenDocument.Implementation }) => {
          const problem = this.#placementProblem(token, this.#space(token, document), constraint, plans, fail);
          if (problem) ui.notifications?.warn(i18nFormat("midi-qol.TELEPORT.Blocked", { name: token.name, reason: i18n(problem) }));
          return !problem;
        },
        preSkip: () => { skipped = true; }
      });
      if (skipped) return undefined;
      if (!placed?.length) return null;
      const document = placed[0] as TokenDocument.Implementation;
      return { x: document._source.x, y: document._source.y, elevation: document._source.elevation, level: tokenLevel(document) };
    }

    /** The nearest free space within 5 ft of `anchor`, or undefined. */
    #nearestFree(token: Token.Implementation, anchor: Space, plans: TeleportPlan[]): Position | undefined {
      const grid = canvas!.grid!;
      const within = grid.distance;
      const candidates: Position[] = [];
      if (anchor.cells) {
        // Every grid space next to the anchor's, the token placed over it.
        const seen = new Set(anchor.cells.map(c => `${c.i},${c.j}`));
        for (const cell of anchor.cells) {
          for (const next of grid.getAdjacentOffsets(cell)) {
            const key = `${next.i},${next.j}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const centre = grid.getCenterPoint(next);
            candidates.push(token.document.getSnappedPosition({ x: centre.x - token.w / 2, y: centre.y - token.h / 2 }));
          }
        }
      } else {
        // Gridless: positions round the anchor, half a grid size apart.
        const step = grid.size / 2;
        const { x, y, width, height } = anchor.rect;
        for (let px = x - token.w - grid.size; px <= x + width + grid.size; px += step) {
          for (let py = y - token.h - grid.size; py <= y + height + grid.size; py += step) candidates.push({ x: px, y: py });
        }
      }
      const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
      const a = centre(anchor.rect);
      const distanceFrom = (p: Position) => { const c = centre(this.#space(token, p).rect); return Math.hypot(c.x - a.x, c.y - a.y); };
      candidates.sort((p1, p2) => distanceFrom(p1) - distanceFrom(p2));
      return candidates.find(p => {
        const space = this.#space(token, p);
        return !this.#overlaps(space, anchor) && this.#gap(anchor, space) <= within + 0.01
          && !this.#destinationProblem(token, space, plans, { reachableFrom: anchor });
      });
    }

    /**
     * Why `token` can't arrive at `space`, or undefined: it must be inside the scene, on an unoccupied space (other
     * tokens and the other movers' destinations), not inside a wall, reachable from `reachableFrom` without
     * crossing a wall, and seen from `from` when the activity requires sight.
     */
    #destinationProblem(token: Token.Implementation, space: Space, plans: TeleportPlan[], { from, reachableFrom }: { from?: Token.Implementation, reachableFrom?: Space } = {}): string | undefined {
      const scene = canvas!.dimensions!.sceneRect;
      const rect = space.rect;
      if (rect.x < scene.x || rect.y < scene.y || rect.x + rect.width > scene.x + scene.width || rect.y + rect.height > scene.y + scene.height)
        return "midi-qol.TELEPORT.OutsideScene";
      const moving = new Set(plans.map(p => p.token));
      // Moving tokens are judged by where they go, not where they are; only tokens on the destination's level count.
      const sameLevel = (other: Space) => !space.level || !other.level || other.level === space.level;
      const occupied = canvas!.tokens!.placeables.some(t => {
        if (t === token || moving.has(t) || t.document.hidden === true) return false;
        const other = this.#space(t, t.document);
        return sameLevel(other) && this.#overlaps(space, other);
      });
      const reserved = plans.some(p => {
        if (p.token === token) return false;
        const other = this.#space(p.token, p.plan.destination);
        return sameLevel(other) && this.#overlaps(space, other);
      });
      if (occupied || reserved) return "midi-qol.TELEPORT.Occupied";
      if (this.#wallInside(space, token)) return "midi-qol.TELEPORT.InWall";
      const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      if (reachableFrom) {
        const origin = { x: reachableFrom.rect.x + reachableFrom.rect.width / 2, y: reachableFrom.rect.y + reachableFrom.rect.height / 2 };
        if (this.#collides(origin, centre, "move", token, space.level)) return "midi-qol.TELEPORT.BehindWall";
      }
      if (from && this.midiTeleport?.requireSight && this.#collides(from.center, centre, "sight", from)) return "midi-qol.TELEPORT.NotSeen";
      return undefined;
    }

    /** A wall between two points on `levelId`'s level (default: the token's). */
    #collides(origin: { x: number, y: number }, destination: { x: number, y: number }, type: "move" | "sight", token: Token.Implementation, levelId?: string): boolean {
      // @ts-expect-error no dnd5e-types for document.level / scene.levels
      const level = (levelId && canvas?.scene?.levels?.get(levelId)) || collisionLevel(token);
      // @ts-expect-error v14 collision level not in fvtt-types
      return !!CONFIG.Canvas.polygonBackends[type].testCollision(origin, destination, { type, mode: "any", level });
    }

    /**
     * A movement-blocking wall crossing the space: each grid space's edges and diagonals (the bounds when gridless),
     * inset so walls along its border don't count.
     */
    #wallInside(space: Space, token: Token.Implementation): boolean {
      const inset = 2;
      const outlines: { x: number, y: number }[][] = space.cells
        ? space.cells.map(cell => canvas!.grid!.getVertices(cell))
        : [[{ x: space.rect.x, y: space.rect.y }, { x: space.rect.x + space.rect.width, y: space.rect.y },
          { x: space.rect.x + space.rect.width, y: space.rect.y + space.rect.height }, { x: space.rect.x, y: space.rect.y + space.rect.height }]];
      for (const outline of outlines) {
        const cx = outline.reduce((sum, v) => sum + v.x, 0) / outline.length;
        const cy = outline.reduce((sum, v) => sum + v.y, 0) / outline.length;
        const points = outline.map(v => {
          const d = Math.hypot(v.x - cx, v.y - cy) || 1;
          return { x: v.x - (v.x - cx) * inset / d, y: v.y - (v.y - cy) * inset / d };
        });
        const n = points.length;
        for (let k = 0; k < n; k++) {
          if (this.#collides(points[k], points[(k + 1) % n], "move", token, space.level)) return true;
          if (k < n / 2 && this.#collides(points[k], points[k + Math.floor(n / 2)], "move", token, space.level)) return true;
        }
      }
      return false;
    }

    #positionOf(token: Token.Implementation): Position {
      const { x, y, elevation } = token.document._source;
      return { x, y, elevation, level: tokenLevel(token.document) };
    }

    /** `token`'s footprint at `position`: its grid spaces on square and hex grids, its bounds. */
    #space(token: Token.Implementation, position: Position | TokenDocument.Implementation): Space {
      const rect = { x: position.x, y: position.y, width: token.w, height: token.h };
      const level = (position instanceof TokenDocument ? tokenLevel(position) : position.level) ?? tokenLevel(token.document);
      if (canvas!.grid!.isGridless) return { rect, level };
      const seen = new Set<string>();
      const cells: { i: number, j: number }[] = [];
      const at = { x: position.x, y: position.y, level };
      for (const { i, j } of token.document.getOccupiedGridSpaceOffsets(at)) {
        if (seen.has(`${i},${j}`)) continue;
        seen.add(`${i},${j}`);
        cells.push({ i, j });
      }
      return { rect, cells, level };
    }

    #overlaps(a: Space, b: Space): boolean {
      if (a.cells && b.cells) {
        const keys = new Set(a.cells.map(c => `${c.i},${c.j}`));
        return b.cells.some(c => keys.has(`${c.i},${c.j}`));
      }
      const e = 1;
      return a.rect.x < b.rect.x + b.rect.width - e && b.rect.x < a.rect.x + a.rect.width - e
        && a.rect.y < b.rect.y + b.rect.height - e && b.rect.y < a.rect.y + a.rect.height - e;
    }

    /**
     * How far apart two spaces are, in scene units, as the grid measures from space to space: one grid space's
     * distance when adjacent. Gridless: the gap between their bounds.
     */
    #gap(a: Space, b: Space): number {
      const grid = canvas!.grid!;
      if (a.cells && b.cells) {
        let best = Infinity;
        for (const ca of a.cells) {
          for (const cb of b.cells) {
            best = Math.min(best, grid.measurePath([grid.getCenterPoint(ca), grid.getCenterPoint(cb)], {}).distance);
          }
        }
        return best;
      }
      const dx = Math.max(0, b.rect.x - (a.rect.x + a.rect.width), a.rect.x - (b.rect.x + b.rect.width));
      const dy = Math.max(0, b.rect.y - (a.rect.y + a.rect.height), a.rect.y - (b.rect.y + b.rect.height));
      return Math.hypot(dx, dy) / grid.size * grid.distance;
    }

    /** The distance a token's own teleport covers, as the grid measures it. */
    #travel(token: Token.Implementation, from: Position, to: Position): number {
      const centre = (p: Position) => ({ x: p.x + token.w / 2, y: p.y + token.h / 2 });
      return canvas!.grid!.measurePath([centre(from), centre(to)], {}).distance;
    }

    async #move({ token, plan }: TeleportPlan): Promise<boolean> {
      // Leaving the viewed level undraws the token; Foundry's target animation then draws on it and throws.
      const viewed = viewedLevel();
      if (plan.destination.level && viewed && plan.destination.level !== viewed.id && token.isTargeted)
        token.setTarget(false, { releaseOthers: false });
      if (plan.id) return token.document.startMovement(plan.id);
      const { elevation, level } = plan.destination;
      const centre = { x: plan.destination.x + token.w / 2, y: plan.destination.y + token.h / 2, elevation, level };
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
