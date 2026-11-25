import type { Cue } from "../module/lib/cues.js";
import type { Presenter } from "../module/services/presenters/service.js";

/*
 * Automated Animations as a visual presenter (M18 stage 2; user 2026-11-25: midi drives it). A plugin given midi's
 * public API, so it can move into Automated Animations unchanged.
 *
 * Automated Animations (8.0.7) plays from dnd5e's roll hooks, as the roll is made, with the user's targets. For a midi
 * use those animations are stopped (its AutomatedAnimations-WorkflowStart hook) and the presenter plays the use at
 * midi's cue instead, with midi's targets and hit targets: an attack at its result, or at its damage roll with
 * Automated Animations' "play on damage"; other damage and healing at the damage roll; anything else as the use starts.
 * Which animation stays Automated Animations' choice (item and activity settings, autorec): the presenter claims a cue
 * when a probe (playAnimation stopped at that hook) finds one. Template and summon animations, and the critical/fumble
 * animation, stay on Automated Animations' own hooks.
 *
 * Undoing a use ends the effects its plays started that are still running (persistent ones included).
 * Its play resolves when the Sequencer effects it started have ended (a use waits for that with "Wait for animations").
 *
 * A cue's visualAudience (a hidden attacker or target, a private use) limits its Sequencer sequences to those users.
 *
 * Every client is asked (so the user's presenter order gives the same answer everywhere); only the client that raised
 * the cue plays: Sequencer shows the effects to the others.
 */

interface AnimationActivity {
  uuid: string;
  name?: string;
  type?: string;
  item?: AnimationItem;
  attack?: unknown;
  damage?: { parts?: unknown[] };
  target?: { template?: { type?: string } };
}
interface AnimationItem { uuid: string, system?: { properties?: Set<string> } }

interface AutomatedAnimationsApi {
  playAnimation(sourceToken: unknown, item: unknown, options?: Record<string, unknown>): Promise<unknown>;
}

export interface AutoAnimationsPluginApi {
  services: { register(serviceId: "presenters", providerId: string, provider: Presenter, options?: { label?: string, priority?: number }): unknown };
  /** Whether a midi use of this activity (its uuid) is running on this client */
  inMidiUse(activityUuid: string): boolean;
}

const MODULE = "autoanimations";
const PROVIDER_ID = "midi-qol.autoanimations";
const ATTACK_CUES = new Set(["attack.hit", "attack.miss", "attack.critical", "attack.fumble"]);

function automatedAnimations(): AutomatedAnimationsApi | undefined {
  const api = (globalThis as { AutomatedAnimations?: Partial<AutomatedAnimationsApi> }).AutomatedAnimations;
  return typeof api?.playAnimation === "function" ? api as AutomatedAnimationsApi : undefined;
}

function aaSetting(key: string): unknown {
  try { return game.settings?.get(MODULE as never, key as never); } catch { return undefined; }
}

/** The cue Automated Animations' own hooks would play this activity at (none: left to them) */
export function momentOf(activity: AnimationActivity): "attack" | "damage.rolled" | "use.start" | undefined {
  const areaTypes = Object.keys(CONFIG.DND5E.areaTargetTypes ?? {});
  if (areaTypes.includes(activity.target?.template?.type ?? "")) return undefined;
  if (activity.type === "summon") return undefined;
  const hasDamage = !!activity.damage?.parts?.length;
  if (activity.type === "attack") return hasDamage && aaSetting("playonDamageCore") ? "damage.rolled" : "attack";
  if (hasDamage || activity.type === "heal") return "damage.rolled";
  return "use.start";
}

function atMoment(cue: Cue, moment: ReturnType<typeof momentOf>): boolean {
  if (!moment) return false;
  return moment === "attack" ? ATTACK_CUES.has(cue.cue) : cue.cue === moment;
}

function activityOf(cue: Cue): AnimationActivity | undefined {
  if (!cue.activity) return undefined;
  const activity = fromUuidSync(cue.activity) as AnimationActivity | null;
  return activity?.uuid ? activity : undefined;
}

function placeable(uuid: string | undefined): unknown {
  if (!uuid) return undefined;
  return (fromUuidSync(uuid) as { object?: unknown } | null)?.object ?? undefined;
}

/** What Automated Animations is given for a cue, as its dnd5e hooks would give it */
function animationOptions(cue: Cue, activity: AnimationActivity): Record<string, unknown> {
  const targets = cue.targets.map(placeable).filter(Boolean);
  const isAttack = activity.type === "attack";
  const hitUuids = isAttack ? cue.outcomes.filter(o => o.attack?.hit).map(o => o.target) : cue.targets;
  const hitTargets = hitUuids.map(placeable).filter(Boolean);
  const name = activity.name?.trim();
  return {
    activity,
    targets,
    hitTargets,
    hit: hitTargets.length > 0,
    ammoItem: cue.ammunition ? fromUuidSync(cue.ammunition) ?? undefined : undefined,
    overrideNames: name && !["heal", "summon"].includes(name) ? [activity.name] : [],
    spellLevel: cue.tags.spellLevel,
    reach: activity.item?.system?.properties?.has?.("rch") ? 1 : 0
  };
}

interface SequencerEffectLike { id?: string, data?: { moduleName?: string, persist?: boolean } }

interface SequencerEffectManager { endEffects(filter: { effects: SequencerEffectLike[] }): Promise<unknown> }

function effectManager(): SequencerEffectManager | undefined {
  return (globalThis as { Sequencer?: { EffectManager?: SequencerEffectManager } }).Sequencer?.EffectManager;
}

/** Per use: the Automated Animations effects its plays started (persistent ones too), still running */
const effectsOfUse = new Map<string, Set<SequencerEffectLike>>();
const KEEP_EFFECTS_MS = 30 * 60_000;

function recordEffect(useId: string | undefined, effect: SequencerEffectLike): void {
  if (!useId) return;
  let set = effectsOfUse.get(useId);
  if (!set) {
    effectsOfUse.set(useId, set = new Set());
    setTimeout(() => effectsOfUse.delete(useId), KEEP_EFFECTS_MS);
  }
  set.add(effect);
}

/** Undo: end the effects still running that its plays started (Sequencer ends them on every client) */
async function stopUse(useId: string): Promise<void> {
  const effects = [...(effectsOfUse.get(useId) ?? [])];
  effectsOfUse.delete(useId);
  if (effects.length) await effectManager()?.endEffects({ effects });
}

/**
 * Resolves when the (non-persistent) Sequencer effects Automated Animations starts from now have ended, or at once if
 * none starts within its global delay and a second: its sequences don't all report their end (melee doesn't).
 */
function animationsEnded(useId?: string): Promise<void> {
  return new Promise(resolve => {
    const running = new Set<SequencerEffectLike>();
    let started = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const startWindow = Number(aaSetting("globaldelay") ?? 0) + 1000;
    const finish = () => {
      Hooks.off("createSequencerEffect", created);
      Hooks.off("endedSequencerEffect", ended);
      clearTimeout(quiet);
      clearTimeout(settle);
      resolve();
    };
    const created = (effect: SequencerEffectLike) => {
      if (effect?.data?.moduleName !== "Automated Animations") return;
      recordEffect(useId, effect);
      if (effect.data.persist) return;
      started = true;
      running.add(effect);
      clearTimeout(settle);
    };
    // A sequence's next effect may start just after the last ended
    const ended = (effect: SequencerEffectLike) => {
      if (useId) effectsOfUse.get(useId)?.delete(effect);
      if (running.delete(effect) && !running.size) settle = setTimeout(finish, 150);
    };
    Hooks.on("createSequencerEffect", created);
    Hooks.on("endedSequencerEffect", ended);
    const quiet = setTimeout(() => { if (!started) finish(); }, startWindow);
  });
}

export function registerAutoAnimationsPresenter(api: AutoAnimationsPluginApi): boolean {
  if (!game.modules?.get(MODULE)?.active || !automatedAnimations()) return false;

  const probes = new Map<string, boolean>();
  /** Per use and moment: whether Automated Animations has an animation for it */
  const found = new Map<string, Promise<boolean>>();

  Hooks.on("AutomatedAnimations-WorkflowStart", (data, animationData) => {
    const probe = data.midiProbe;
    if (typeof probe === "string") {
      probes.set(probe, !!animationData);
      data.stopWorkflow = true;
      return;
    }
    if (data.midiPresented) return;
    // Its own dnd5e roll/use hooks for a midi use: midi plays the use at its cues
    const activity = data.activity;
    const uuid = typeof activity === "object" && activity && "uuid" in activity && typeof activity.uuid === "string" ? activity.uuid : undefined;
    if ((data.rollAttackHook || data.rollDamageHook || data.useItemHook) && uuid && api.inMidiUse(uuid)) data.stopWorkflow = true;
  });

  async function hasAnimation(cue: Cue, activity: AnimationActivity, moment: string): Promise<boolean> {
    const key = `${cue.useId ?? cue.activity}|${moment}`;
    let answer = found.get(key);
    if (!answer) {
      answer = (async () => {
        const item = activity.item ?? (cue.item ? fromUuidSync(cue.item) : undefined);
        if (!item) return false;
        const probe = foundry.utils.randomID();
        try {
          await automatedAnimations()?.playAnimation(placeable(cue.source), item, { ...animationOptions(cue, activity), midiProbe: probe });
          return probes.get(probe) ?? false;
        } finally {
          probes.delete(probe);
        }
      })();
      found.set(key, answer);
      // A use's moments are close together; forget it once the use is over
      setTimeout(() => found.delete(key), 60_000);
    }
    return answer;
  }

  const presenter: Presenter = {
    channel: "visual",
    claims: async cue => {
      const activity = activityOf(cue);
      if (!activity) return false;
      const moment = momentOf(activity);
      if (!atMoment(cue, moment)) return false;
      return hasAnimation(cue, activity, moment!);
    },
    play: async cue => {
      if (cue.raisedBy && cue.raisedBy !== game.user?.id) return;
      const activity = activityOf(cue);
      const item = activity?.item ?? (cue.item ? fromUuidSync(cue.item) : undefined);
      if (!activity || !item) return;
      const ended = animationsEnded(cue.useId);
      // Shown only to the users who may see it (a hidden attacker or target, a private use): Sequencer plays for them
      const audience = cue.visualAudience;
      const limit = audience ? Hooks.on("createSequencerSequence", sequence => {
        if (sequence.moduleName !== "Automated Animations") return;
        for (const section of sequence.sections ?? []) section.forUsers?.(audience);
      }) : undefined;
      if (limit !== undefined) void ended.then(() => Hooks.off("createSequencerSequence", limit));
      await automatedAnimations()?.playAnimation(placeable(cue.source), item, { ...animationOptions(cue, activity), midiPresented: true });
      return ended;
    },
    stop: stopUse
  };
  api.services.register("presenters", PROVIDER_ID, presenter, { label: "Automated Animations" });
  return true;
}
