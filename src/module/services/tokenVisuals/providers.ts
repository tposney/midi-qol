import { tokenVisualsService, type TokenVisual, type TokenVisualsProvider } from "./service.js";

/*
 * midi's tokenVisuals providers (M33). Token Magic FX and Sequencer store what they draw (token flags, persistent
 * effects), so everyone sees it and it survives a reload: the active GM writes. midi's own drawing is made on each
 * client from the effects and writes nothing.
 */

const colorOf = (css: string | undefined, fallback: number) => {
  const color = css ? Color.fromString(css) : undefined;
  return color?.valid ? Number(color) : fallback;
};

/* midi's own drawing */

interface Drawn { key: string, mesh: PIXI.DisplayObject, parts: PIXI.DisplayObject[], filters: PIXI.Filter[], tick: (dt: number) => void }
const drawn = new Map<string, Drawn>();

function clearDrawn(tokenId: string) {
  const d = drawn.get(tokenId);
  if (!d) return;
  canvas?.app?.ticker.remove(d.tick);
  for (const part of d.parts) if (!part.destroyed) part.destroy();
  const mesh = d.mesh as PIXI.DisplayObject & { filters: PIXI.Filter[] | null };
  if (!mesh.destroyed && mesh.filters) mesh.filters = mesh.filters.filter(f => !d.filters.includes(f));
  drawn.delete(tokenId);
}

function midiShow(token: TokenDocument.Implementation, visuals: readonly TokenVisual[]) {
  const placeable = token.object;
  const mesh = placeable?.mesh;
  const key = JSON.stringify(visuals.map(({ effectUuid, ...v }) => v));
  const known = drawn.get(token.id!);
  if (known && known.key === key && known.mesh === mesh && !mesh?.destroyed) return;
  clearDrawn(token.id!);
  const primary = canvas?.primary;
  if (!placeable || !mesh || !primary || !visuals.length) return;
  const parts: (PIXI.DisplayObject & { elevation: number, sortLayer: number, sort: number })[] = [];
  const filters: PIXI.Filter[] = [];
  const copy = (alpha: number) => {
    const sprite = new foundry.canvas.primary.PrimarySpriteMesh({ texture: mesh.texture ?? undefined, name: `midi-qol.tokenVisual.${token.id}` });
    sprite.anchor?.set(0.5);
    sprite.alpha = alpha;
    primary.addChild(sprite);
    parts.push(sprite);
    return sprite;
  };
  const duplicates = visuals.find(v => v.kind === "duplicates");
  const images = Array.from({ length: duplicates?.count ?? 0 }, () => copy(0.5));
  const glow = visuals.find(v => v.kind === "glow");
  const halo = glow ? copy(0.7) : undefined;
  if (halo) {
    halo.tint = colorOf(glow!.color, 0x7fd3ff);
    halo.filters = [new PIXI.BlurFilter(8)];
  }
  const blur = visuals.some(v => v.kind === "blur") ? new PIXI.BlurFilter(2) : undefined;
  if (blur) {
    filters.push(blur);
    mesh.filters = [...(mesh.filters ?? []), blur];
  }
  let t = 0;
  const tick = (dt: number) => {
    if (mesh.destroyed) return clearDrawn(token.id!);
    t += dt * 0.02;
    const { x, y } = placeable.center;
    const visible = placeable.visible && mesh.visible;
    for (const part of parts) {
      Object.assign(part, { elevation: mesh.elevation, sortLayer: mesh.sortLayer, sort: mesh.sort, zIndex: mesh.zIndex - 1, visible });
    }
    const r = placeable.w * 0.2;
    images.forEach((image, i) => {
      const a = t + (2 * Math.PI * i) / images.length;
      image.width = mesh.width; image.height = mesh.height;
      image.position.set(x + r * Math.cos(a), y + r * 0.6 * Math.sin(a));
    });
    if (halo) { halo.width = mesh.width * 1.15; halo.height = mesh.height * 1.15; halo.position.set(x, y); }
    if (blur) blur.blur = 1.5 + Math.sin(t * 3);
  };
  tick(0);
  canvas!.app!.ticker.add(tick);
  drawn.set(token.id!, { key, mesh, parts, filters, tick });
}

/* Token Magic FX */

type TmParams = Record<string, unknown> & { filterType: string, filterId: string };
interface TokenMagicApi {
  getPreset(name: string): TmParams[] | undefined;
  addUpdateFilters(placeable: Token.Implementation, params: TmParams[]): Promise<unknown>;
  deleteFilters(placeable: Token.Implementation, filterId: string): Promise<unknown>;
}

const TM_KINDS = ["duplicates", "blur", "glow"] as const;
const TM_PRESET: Record<(typeof TM_KINDS)[number], string> = { duplicates: "images", blur: "blur", glow: "glow" };

function tmParams(api: TokenMagicApi, visual: TokenVisual): TmParams | undefined {
  const preset = api.getPreset(TM_PRESET[visual.kind as (typeof TM_KINDS)[number]])?.[0];
  if (!preset) return undefined;
  const params: TmParams = { ...foundry.utils.deepClone(preset), filterId: `midi-qol-${visual.kind}` };
  // The images filter counts the creature among its images
  if (visual.kind === "duplicates") params.nbImage = (visual.count ?? 0) + 1;
  if (visual.kind === "glow" && visual.color) {
    params.color = colorOf(visual.color, 0x006000);
    delete params.animated;
  }
  params.midiKey = JSON.stringify({ count: visual.count, color: visual.color });
  return params;
}

async function tokenMagicShow(token: TokenDocument.Implementation, visuals: readonly TokenVisual[]) {
  const api: TokenMagicApi | undefined = globalThis.TokenMagic;
  const placeable = token.object;
  if (!api || !placeable || !game.user?.isActiveGM) return;
  const stored = (token.flags.tokenmagic?.filters ?? []).map(f => f.tmFilters);
  for (const kind of TM_KINDS) {
    const filterId = `midi-qol-${kind}`;
    const current = stored.find(f => f?.tmFilterId === filterId);
    const visual = visuals.find(v => v.kind === kind);
    const params = visual ? tmParams(api, visual) : undefined;
    if (params) {
      if (current?.tmParams?.midiKey !== params.midiKey) await api.addUpdateFilters(placeable, [params]);
    } else if (current) await api.deleteFilters(placeable, filterId);
  }
}

/* Sequencer (and JB2A through its database) */

interface SequencerEffectBuilder {
  copySprite(token: Token.Implementation): SequencerEffectBuilder;
  file(path: string): SequencerEffectBuilder;
  attachTo(token: Token.Implementation, options?: { bindVisibility?: boolean, bindAlpha?: boolean }): SequencerEffectBuilder;
  persist(): SequencerEffectBuilder;
  name(name: string): SequencerEffectBuilder;
  opacity(value: number): SequencerEffectBuilder;
  scaleToObject(scale?: number): SequencerEffectBuilder;
  spriteOffset(offset: { x: number, y: number }, options?: { gridUnits?: boolean }): SequencerEffectBuilder;
  filter(name: string, data?: Record<string, unknown>): SequencerEffectBuilder;
  loopProperty(target: string, property: string, options: Record<string, unknown>): SequencerEffectBuilder;
  zIndex(value: number): SequencerEffectBuilder;
}
interface SequencerApi {
  EffectManager: {
    getEffects(filter: { object?: Token.Implementation, name?: string }): { data?: { name?: string } }[];
    endEffects(filter: { object?: Token.Implementation, name?: string }): Promise<unknown>;
  };
  Database: { entryExists(path: string): boolean };
}
type SequenceClass = new (options?: { moduleName?: string }) => { effect(): SequencerEffectBuilder, play(): Promise<unknown> };

const SEQ_KINDS = ["duplicates", "blur", "glow", "shield", "shimmer"] as const;
const SEQ_PREFIX = "midi-qol|";
/** JB2A's animations for a kind (the free and Patreon packs both register these paths) */
const JB2A: Record<string, string> = { shield: "jb2a.shield.01.loop", shimmer: "jb2a.shimmer.01" };

/** The file a visual plays: its own, else JB2A's in its colour (blue when that colour isn't there), when Sequencer has it */
export function sequencerFile(visual: TokenVisual, database: SequencerApi["Database"]): string | undefined {
  if (visual.file) return database.entryExists(visual.file) || /\.(webm|webp|png|gif|mp4)$/i.test(visual.file) ? visual.file : undefined;
  const base = JB2A[visual.kind];
  if (!base) return undefined;
  const named = visual.color && /^[a-z_]+$/i.test(visual.color) ? `${base}.${visual.color.toLowerCase()}` : undefined;
  return [named, `${base}.blue`].find((path): path is string => !!path && database.entryExists(path));
}

function sequencerEffects(visual: TokenVisual, placeable: Token.Implementation, sequence: { effect(): SequencerEffectBuilder }, database: SequencerApi["Database"], name: (i: number) => string) {
  const attached = (builder: SequencerEffectBuilder, i: number) => builder.attachTo(placeable, { bindVisibility: true, bindAlpha: false }).persist().name(name(i));
  const glowCopy = (i: number, color: number) => attached(sequence.effect().copySprite(placeable), i).filter("Glow", { color, distance: 10, outerStrength: 4 }).zIndex(-1);
  const file = sequencerFile(visual, database);
  switch (visual.kind) {
    case "duplicates":
      for (let i = 0; i < (visual.count ?? 0); i++) {
        const angle = (2 * Math.PI * i) / (visual.count ?? 1);
        attached(sequence.effect().copySprite(placeable), i).opacity(0.5)
          .spriteOffset({ x: 0.2 * Math.cos(angle), y: 0.12 * Math.sin(angle) }, { gridUnits: true })
          .loopProperty("sprite", "position.x", { from: -0.05, to: 0.05, duration: 1400 + 300 * i, pingPong: true, gridUnits: true });
      }
      return;
    case "blur":
      attached(sequence.effect().copySprite(placeable), 0).filter("Blur", { strength: 4 })
        .loopProperty("alphaFilter", "alpha", { from: 0.6, to: 0.9, duration: 900, pingPong: true });
      return;
    case "glow":
      glowCopy(0, colorOf(visual.color, 0x7fd3ff));
      return;
    case "shield":
    case "shimmer":
      if (file) attached(sequence.effect().file(file), 0).scaleToObject(visual.kind === "shield" ? 1.6 : 1.2);
      else if (visual.kind === "shield") glowCopy(0, colorOf(visual.color, 0x6fa8ff));
      else attached(sequence.effect().copySprite(placeable), 0).loopProperty("alphaFilter", "alpha", { from: 0.2, to: 0.7, duration: 1500, pingPong: true });
      return;
  }
}

async function sequencerShow(token: TokenDocument.Implementation, visuals: readonly TokenVisual[]) {
  const api: SequencerApi | undefined = globalThis.Sequencer;
  const Sequence: SequenceClass | undefined = globalThis.Sequence;
  const placeable = token.object;
  if (!api || !Sequence || !placeable || !game.user?.isActiveGM) return;
  const playing = api.EffectManager.getEffects({ object: placeable }).map(e => e.data?.name).filter((n): n is string => !!n?.startsWith(SEQ_PREFIX));
  const sequence = new Sequence({ moduleName: "midi-qol" });
  let added = false;
  const wanted = new Set<string>();
  for (const visual of visuals) {
    // The name carries what the visual is, so a changed count or colour replaces it
    const tag = `${SEQ_PREFIX}${visual.kind}|${JSON.stringify({ c: visual.count, k: visual.color, f: visual.file })}|`;
    const names = (i: number) => `${tag}${i}`;
    const current = playing.filter(n => n.startsWith(tag));
    if (current.length) { current.forEach(n => wanted.add(n)); continue; }
    sequencerEffects(visual, placeable, sequence, api.Database, i => { wanted.add(names(i)); added = true; return names(i); });
  }
  for (const name of playing) if (!wanted.has(name)) await api.EffectManager.endEffects({ object: placeable, name });
  if (added) await sequence.play();
}

export function registerTokenVisualProviders() {
  tokenVisualsService.register("midi-qol.midi", { kinds: ["duplicates", "blur", "glow"], show: midiShow }, { label: "Midi-QOL (drawn on each client)", priority: 0 });
  tokenVisualsService.register("midi-qol.tokenmagic", { kinds: TM_KINDS, show: tokenMagicShow },
    { label: "Token Magic FX", priority: 20, available: () => !!game.modules.get("tokenmagic")?.active });
  tokenVisualsService.register("midi-qol.sequencer", { kinds: SEQ_KINDS, show: sequencerShow },
    { label: "Sequencer (JB2A where it has an animation)", priority: 10, available: () => !!game.modules.get("sequencer")?.active });
}

