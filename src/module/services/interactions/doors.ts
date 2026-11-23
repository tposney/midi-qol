import { MODULE_ID } from "../../../midi-qol.js";
import { unTimedExecuteAsGM } from "../../GMAction.js";
import { rollBy } from "../../lib/entries/activityActions.js";
import { tokenFor } from "../../lib/tokenResolver.js";
import { configSettings } from "../../settings.js";
import { getSpeaker } from "../../utils.js";
import { registerInteraction, type InteractionContext } from "./registry.js";

/*
 * M8d (4): doors, locks and traps (user, 2026-11-23), with the Doors and object interactions setting. A door's data is
 * a midi flag on its wall (flags.midi-qol.door), edited in the wall's config: lockDC (thieves' tools to pick it),
 * forceDC (Athletics to force it open, breaking the lock), key (an item's identifier or name that locks and unlocks
 * it), and a trap: findDC (Perception, Investigation or thieves' tools to notice it), disarmDC (thieves' tools), what it
 * does (a save, damage, half on a save) and whether it resets. Opening the door, however it is opened (an
 * interaction, the door control), sets off an armed trap on the creature that opened it; failing to disarm it by 5 or
 * more sets it off too. A trap found is known to the finder's side (its disposition). Door changes a player can't make
 * (locking, unlocking, the trap's state) are made by the GM.
 */

export interface DoorTrap {
  findDC?: number; disarmDC?: number;
  save?: { ability?: string, dc?: number };
  damage?: { formula?: string, type?: string, half?: boolean };
  resets?: boolean;
  /** Dispositions that have found it */
  found?: number[];
  disarmed?: boolean;
}
export interface DoorData { lockDC?: number, forceDC?: number, key?: string, broken?: boolean, trap?: DoorTrap }

const STATES = () => CONST.WALL_DOOR_STATES;
const say = (key: string, data?: Record<string, string>) => (data ? game.i18n?.format(`midi-qol.Interactions.Door.${key}`, data) : game.i18n?.localize(`midi-qol.Interactions.Door.${key}`)) ?? key;
const enabled = () => configSettings.objectInteractions === true;

export function doorData(wall: WallDocument.Implementation): DoorData {
  return (foundry.utils.getProperty(wall, `flags.${MODULE_ID}.door`) as DoorData | undefined) ?? {};
}
const isDoor = (wall: unknown): wall is WallDocument.Implementation => wall instanceof WallDocument && ((wall as WallDocument.Implementation).door ?? 0) > 0;
const wallOf = (context: InteractionContext) => context.target as WallDocument.Implementation;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** A door's state or data changed, by the GM when this user can't (locking, the trap) */
async function updateDoor(wall: WallDocument.Implementation, changes: Record<string, unknown>, options: Record<string, unknown> = {}) {
  if (wall.isOwner) await wall.update(changes, options);
  else await unTimedExecuteAsGM("updateDoor", { wallUuid: wall.uuid, changes, options });
}

type CheckRoll = { total?: number } | undefined;
async function skill(context: InteractionContext, skillId: string, target?: number): Promise<CheckRoll> {
  const actor = context.subject.actor as unknown as { rollSkill(config: object, dialog?: object): Promise<CheckRoll[] | null> };
  return (await actor.rollSkill({ skill: skillId, ...(target ? { target } : {}) }))?.[0];
}
function thievesTools(actor: Actor.Implementation | null | undefined): Item.Implementation | undefined {
  return actor?.items.find(i => (i.type as string) === "tool" && (i.system as { type?: { baseItem?: string } }).type?.baseItem === "thief");
}
async function tools(context: InteractionContext, target?: number): Promise<CheckRoll> {
  const item = thievesTools(context.subject.actor);
  if (!item) return undefined;
  const system = item.system as { ability?: string, bonus?: string, prof?: unknown };
  const actor = context.subject.actor as unknown as { rollToolCheck(config: object, dialog?: object): Promise<CheckRoll[] | null> };
  return (await actor.rollToolCheck({ ability: system.ability, bonus: system.bonus, prof: system.prof, item, tool: "thief", ...(target ? { target } : {}) }))?.[0];
}
function hasKey(actor: Actor.Implementation | null | undefined, key: string | undefined): boolean {
  if (!actor || !key) return false;
  const wanted = key.trim().toLowerCase();
  return actor.items.some(i => (i.system as { identifier?: string }).identifier === wanted || i.name.trim().toLowerCase() === wanted);
}

/** The trap goes off on the creature: its save, its damage (dnd5e's applyDamage), once unless it resets (on the active GM) */
export async function triggerTrap(wall: WallDocument.Implementation, token: TokenDocument.Implementation | undefined) {
  const trap = doorData(wall).trap;
  if (!trap || trap.disarmed) return;
  if (!trap.resets) await updateDoor(wall, { [`flags.${MODULE_ID}.door.trap.disarmed`]: true });
  const actor = token?.actor;
  if (!actor) return;
  let saved = false;
  if (trap.save?.ability && trap.save.dc) saved = (await rollBy(actor, "save", { ability: trap.save.ability, dc: trap.save.dc } as never, {}, `${token.name}: ${say("trap")}`)) === true;
  let damage = 0;
  if (trap.damage?.formula) {
    const roll = await new Roll(trap.damage.formula).evaluate();
    await roll.toMessage({ speaker: getSpeaker(actor), flavor: say("trapDamage", { name: token.name ?? "" }) });
    damage = saved ? (trap.damage.half ? Math.floor((roll.total ?? 0) / 2) : 0) : roll.total ?? 0;
  }
  if (damage > 0) {
    const applied = [{ value: damage, type: trap.damage?.type || "piercing" }];
    if (actor.isOwner) await (actor as unknown as { applyDamage(d: object[]): Promise<unknown> }).applyDamage(applied);
    else await unTimedExecuteAsGM("applyDamageToActor", { actorUuid: actor.uuid, damages: applied });
  }
  if (!trap.damage?.formula) await ChatMessage.create({ speaker: getSpeaker(actor), content: `<p>${say("trapTriggered", { name: token.name ?? "" })}</p>` });
}

/** Who opened the door: the token the interaction named, else that user's token nearest the door within 10 ft */
function openerOf(wall: WallDocument.Implementation, userId: string, options: { midiOpener?: string }): TokenDocument.Implementation | undefined {
  if (options.midiOpener) return tokenFor(options.midiOpener);
  const user = game.users?.get(userId);
  const scene = wall.parent;
  if (!user || !scene) return undefined;
  const [x0, y0, x1, y1] = wall.c;
  const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const size = scene.grid.size;
  const near = scene.tokens.filter(t => !!t.actor && (user.isGM ? true : t.actor.testUserPermission(user, "OWNER")))
    .map(t => ({ t, d: Math.hypot(t._source.x + (t.width * size) / 2 - mid.x, t._source.y + (t.height * size) / 2 - mid.y) / size * scene.grid.distance }))
    .filter(e => e.d <= 10).sort((a, b) => a.d - b.d);
  return near[0]?.t as TokenDocument.Implementation | undefined;
}

/** A door opened (any way): its armed trap goes off, on the active GM */
function onUpdateWall(wall: WallDocument.Implementation, changes: { ds?: number }, options: { midiOpener?: string }, userId: string) {
  if (!enabled() || !game.user?.isActiveGM || changes.ds !== STATES().OPEN) return;
  const trap = doorData(wall).trap;
  if (!trap || trap.disarmed) return;
  void triggerTrap(wall, openerOf(wall, userId, options)).catch(err => console.error("midi-qol | door trap", err));
}

const found = (context: InteractionContext) => !!doorData(wallOf(context)).trap?.found?.includes(context.subject.disposition);
const armed = (context: InteractionContext) => { const trap = doorData(wallOf(context)).trap; return !!trap && !trap.disarmed; };
const ds = (context: InteractionContext) => wallOf(context).ds;

function door(id: string, definition: Omit<Parameters<typeof registerInteraction>[1], "targets" | "label"> & { relevant: (c: InteractionContext) => boolean }) {
  registerInteraction(`midi-qol.door.${id}`, {
    label: `midi-qol.Interactions.Door.${id}`, targets: "door", range: 5, ...definition,
    relevant: context => enabled() && isDoor(context.target) && definition.relevant(context)
  });
}

export function registerDoorInteractions() {
  door("open", { icon: "fa-solid fa-door-open", cost: { object: 1 }, priority: 20,
    relevant: c => ds(c) === STATES().CLOSED,
    run: c => updateDoor(wallOf(c), { ds: STATES().OPEN }, { midiOpener: c.subject.uuid }) });
  door("close", { icon: "fa-solid fa-door-closed", cost: { object: 1 }, priority: 19,
    relevant: c => ds(c) === STATES().OPEN,
    run: c => updateDoor(wallOf(c), { ds: STATES().CLOSED }) });
  door("unlock", { icon: "fa-solid fa-key", cost: { object: 1 }, priority: 18,
    relevant: c => ds(c) === STATES().LOCKED && !!doorData(wallOf(c)).key,
    available: c => hasKey(c.subject.actor, doorData(wallOf(c)).key) ? undefined : say("noKey"),
    run: c => updateDoor(wallOf(c), { ds: STATES().CLOSED }) });
  door("lock", { icon: "fa-solid fa-lock", cost: { object: 1 }, priority: 17,
    relevant: c => ds(c) === STATES().CLOSED && !!doorData(wallOf(c)).key && !doorData(wallOf(c)).broken,
    available: c => hasKey(c.subject.actor, doorData(wallOf(c)).key) ? undefined : say("noKey"),
    run: c => updateDoor(wallOf(c), { ds: STATES().LOCKED }) });
  door("pick", { icon: "fa-solid fa-unlock-keyhole", cost: { action: 1 }, priority: 16,
    relevant: c => ds(c) === STATES().LOCKED && num(doorData(wallOf(c)).lockDC) !== undefined,
    available: c => thievesTools(c.subject.actor) ? undefined : say("noTools"),
    run: async c => {
      const dc = doorData(wallOf(c)).lockDC!;
      const roll = await tools(c, dc);
      if (!roll) return false;
      if ((roll.total ?? 0) >= dc) await updateDoor(wallOf(c), { ds: STATES().CLOSED });
    } });
  door("force", { icon: "fa-solid fa-hammer", cost: { action: 1 }, priority: 15,
    relevant: c => ds(c) === STATES().LOCKED && num(doorData(wallOf(c)).forceDC) !== undefined,
    run: async c => {
      const dc = doorData(wallOf(c)).forceDC!;
      const roll = await skill(c, "ath", dc);
      if (!roll) return false;
      if ((roll.total ?? 0) >= dc) await updateDoor(wallOf(c), { ds: STATES().OPEN, [`flags.${MODULE_ID}.door.broken`]: true }, { midiOpener: c.subject.uuid });
    } });
  door("findTrap", { icon: "fa-solid fa-magnifying-glass", cost: { action: 1 }, priority: 14,
    relevant: c => armed(c) && !found(c) && num(doorData(wallOf(c)).trap?.findDC) !== undefined,
    run: async c => {
      const trap = doorData(wallOf(c)).trap!;
      const skills = (c.subject.actor?.system as { skills?: Record<string, { total?: number }> }).skills ?? {};
      const best = (skills.inv?.total ?? 0) > (skills.prc?.total ?? 0) ? "inv" : "prc";
      const roll = thievesTools(c.subject.actor) && c.options.useTools ? await tools(c, trap.findDC) : await skill(c, best, trap.findDC);
      if (!roll) return false;
      if ((roll.total ?? 0) < trap.findDC!) return;
      await updateDoor(wallOf(c), { [`flags.${MODULE_ID}.door.trap.found`]: [...new Set([...(trap.found ?? []), c.subject.disposition])] });
      await ChatMessage.create({ speaker: getSpeaker(c.subject.actor!), content: `<p>${say("trapFound", { name: c.subject.name ?? "" })}</p>`,
        whisper: [game.user!.id, ...game.users!.filter(u => u.isGM).map(u => u.id)] });
    } });
  door("disarm", { icon: "fa-solid fa-screwdriver-wrench", cost: { action: 1 }, priority: 13,
    relevant: c => armed(c) && found(c),
    available: c => thievesTools(c.subject.actor) ? undefined : say("noTools"),
    run: async c => {
      const wall = wallOf(c);
      const trap = doorData(wall).trap!;
      const dc = num(trap.disarmDC) ?? 15;
      const roll = await tools(c, dc);
      if (!roll) return false;
      const total = roll.total ?? 0;
      if (total >= dc) await updateDoor(wall, { [`flags.${MODULE_ID}.door.trap.disarmed`]: true });
      else if (total <= dc - 5) await triggerTrap(wall, c.subject);
    } });
  Hooks.on("updateWall", (wall, changes, options, userId) => onUpdateWall(wall, changes as never, options as never, userId));
  Hooks.on("renderWallConfig", (app, html) => onRenderWallConfig(app as never, html as HTMLElement));
}

/** The door's midi fields in the wall's config (a fieldset after the door configuration), saved with its form */
function onRenderWallConfig(app: { document?: WallDocument.Implementation }, html: HTMLElement) {
  const wall = app.document;
  if (!enabled() || !wall || !((wall.door ?? 0) > 0)) return;
  const data = doorData(wall);
  const body = html.querySelector(".standard-form.scrollable") ?? html.querySelector("form");
  if (!body || body.querySelector("[data-midi-door]")) return;
  const name = (path: string) => `flags.${MODULE_ID}.door.${path}`;
  const numberRow = (path: string, label: string, value: unknown) =>
    `<div class="form-group"><label>${say(`Field.${label}`)}</label><div class="form-fields"><input type="number" name="${name(path)}" value="${num(value) ?? ""}" min="0" step="1"></div></div>`;
  const textRow = (path: string, label: string, value: unknown) =>
    `<div class="form-group"><label>${say(`Field.${label}`)}</label><div class="form-fields"><input type="text" name="${name(path)}" value="${foundry.utils.escapeHTML(String(value ?? ""))}"></div></div>`;
  const checkRow = (path: string, label: string, value: unknown) =>
    `<div class="form-group"><label>${say(`Field.${label}`)}</label><div class="form-fields"><input type="checkbox" name="${name(path)}" ${value ? "checked" : ""}></div></div>`;
  const abilities = Object.entries((CONFIG as unknown as { DND5E: { abilities: Record<string, { label: string }> } }).DND5E.abilities);
  const damageTypes = Object.entries((CONFIG as unknown as { DND5E: { damageTypes: Record<string, { label: string }> } }).DND5E.damageTypes);
  const select = (path: string, label: string, value: unknown, options: [string, { label: string }][]) =>
    `<div class="form-group"><label>${say(`Field.${label}`)}</label><div class="form-fields"><select name="${name(path)}"><option value=""></option>${options.map(([id, o]) => `<option value="${id}" ${id === value ? "selected" : ""}>${o.label}</option>`).join("")}</select></div></div>`;
  const trap = data.trap ?? {};
  const fieldset = document.createElement("fieldset");
  fieldset.dataset.midiDoor = "true";
  fieldset.innerHTML = `<legend>${say("Field.legend")}</legend>
    ${numberRow("lockDC", "lockDC", data.lockDC)}${numberRow("forceDC", "forceDC", data.forceDC)}${textRow("key", "key", data.key)}
    ${numberRow("trap.findDC", "findDC", trap.findDC)}${numberRow("trap.disarmDC", "disarmDC", trap.disarmDC)}
    ${select("trap.save.ability", "saveAbility", trap.save?.ability, abilities)}${numberRow("trap.save.dc", "saveDC", trap.save?.dc)}
    ${textRow("trap.damage.formula", "damage", trap.damage?.formula)}${select("trap.damage.type", "damageType", trap.damage?.type, damageTypes)}
    ${checkRow("trap.damage.half", "half", trap.damage?.half)}${checkRow("trap.resets", "resets", trap.resets)}${checkRow("trap.disarmed", "disarmed", trap.disarmed)}`;
  const doorFieldset = Array.from(body.querySelectorAll("fieldset")).find(f => f.querySelector("[name='door']"));
  if (doorFieldset) doorFieldset.after(fieldset);
  else body.append(fieldset);
}
