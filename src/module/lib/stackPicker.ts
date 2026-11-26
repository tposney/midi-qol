import { i18n, MODULE_ID } from "../../midi-qol.js";
import { insideWhom } from "../services/interactions/carried.js";

/*
 * Picking one of a stack of tokens (a creature swallowed by another, a rider, a crowded square), those inside another
 * first, then top to bottom. Client setting stackPicker.
 *  - Selecting (a left click): the tokens there the user can select. Two or more: their portraits beside the cursor
 *    (click: select, Shift: add; right-click: target; double-click: its sheet). One: that one is selected, so a
 *    player's creature under a swallower they can't control is theirs with one click (core gives that click to the
 *    token layer, not a token: the layer's click is wrapped too).
 *  - Targeting (the target tool's click, a double right-click): every token there the user sees. Two or more: the
 *    portraits (click: target, Shift: add). One: core has targeted it.
 * Only tokens the user sees are listed: a swallowed creature hidden from a player (lib/insideLook.ts) never shows.
 */

type TokenObject = foundry.canvas.placeables.Token;
type Mode = "select" | "target";

const PICKER_ID = "midi-qol-stack-picker";

function pickerOn(): boolean {
  try { return game.settings?.get(MODULE_ID, "stackPicker") !== false; }
  catch { return true; }
}

/** The tokens at a canvas point the user sees (for "select", only those they can select), in the picker's order */
export function tokenStack(point: { x: number, y: number }, mode: Mode): TokenObject[] {
  const user = game.user;
  if (!user) return [];
  const here = (canvas?.tokens?.placeables ?? []).filter(token => token.visible && token.bounds.contains(point.x, point.y)
    && (mode === "target" || token.can(user, "control")));
  const inside = (token: TokenObject) => token.document && insideWhom(token.document) ? 1 : 0;
  return here.sort((a, b) => (inside(b) - inside(a)) || ((b.document.sort ?? 0) - (a.document.sort ?? 0)));
}

export function closeStackPicker() {
  document.getElementById(PICKER_ID)?.remove();
}

function portrait(token: TokenObject, mode: Mode): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "midi-qol-stack-token";
  button.dataset.tokenId = token.id ?? "";
  const img = document.createElement("img");
  img.src = token.document.texture.src ?? token.actor?.img ?? "icons/svg/mystery-man.svg";
  img.alt = "";
  const name = document.createElement("span");
  name.textContent = token.name ?? "";
  button.append(img, name);
  const status = token.document && insideWhom(token.document) ? (token.actor?.statuses.has("engulfed") ? "engulfed" : "swallowed") : undefined;
  if (status) {
    const badge = document.createElement("span");
    badge.className = "midi-qol-stack-inside";
    badge.textContent = i18n(`midi-qol.Status.${status}`);
    button.append(badge);
  }
  if (mode === "select" ? token.controlled : token.isTargeted) button.classList.add("chosen");
  return button;
}

/** Show the stack's portraits at the screen point (none for a single token) */
export function showStackPicker(stack: TokenObject[], screen: { x: number, y: number }, mode: Mode) {
  closeStackPicker();
  if (stack.length < 2) return;
  const picker = document.createElement("div");
  picker.id = PICKER_ID;
  picker.className = "midi-qol-stack-picker";
  picker.dataset.mode = mode;
  picker.title = i18n(mode === "select" ? "midi-qol.StackPicker.Hint" : "midi-qol.StackPicker.TargetHint");
  for (const token of stack) picker.append(portrait(token, mode));
  picker.style.left = `${screen.x + 12}px`;
  picker.style.top = `${screen.y + 12}px`;
  const tokenOf = (event: Event) => {
    const id = (event.target as HTMLElement).closest<HTMLElement>(".midi-qol-stack-token")?.dataset.tokenId;
    return id ? canvas?.tokens?.get(id) : undefined;
  };
  const target = (token: TokenObject, add: boolean) => token.setTarget(add ? !token.isTargeted : true, { releaseOthers: !add });
  picker.addEventListener("click", event => {
    const token = tokenOf(event);
    if (!token) return;
    if (mode === "select") token.control({ releaseOthers: !event.shiftKey });
    else target(token, event.shiftKey);
    closeStackPicker();
  });
  picker.addEventListener("contextmenu", event => {
    event.preventDefault();
    const token = tokenOf(event);
    if (!token) return;
    target(token, event.shiftKey);
    closeStackPicker();
  });
  if (mode === "select") picker.addEventListener("dblclick", event => { void tokenOf(event)?.actor?.sheet?.render(true); });
  document.body.append(picker);
  // Kept on screen
  const box = picker.getBoundingClientRect();
  if (box.right > window.innerWidth) picker.style.left = `${Math.max(0, window.innerWidth - box.width - 4)}px`;
  if (box.bottom > window.innerHeight) picker.style.top = `${Math.max(0, window.innerHeight - box.height - 4)}px`;
}

type ClickEvent = { clientX?: number, clientY?: number, shiftKey?: boolean, getLocalPosition?(target: unknown): { x: number, y: number } };

/** After a click that selects or targets: the picker on a stack; selecting, the one token there the user can select */
export function stackPickerAfterClick(event: ClickEvent, mode: Mode = game.activeTool === "target" ? "target" : "select") {
  if (!pickerOn() || !canvas?.tokens || !event.getLocalPosition) return;
  const stack = tokenStack(event.getLocalPosition(canvas.tokens), mode);
  if (stack.length === 1) {
    if (mode === "select" && !stack[0].controlled) stack[0].control({ releaseOthers: !event.shiftKey });
    return;
  }
  showStackPicker(stack, { x: event.clientX ?? 0, y: event.clientY ?? 0 }, mode);
}

/** The token layer's left click (on no token the user can control): the one there that is theirs, or the picker */
export function tokenLayerClickWrapper(this: unknown, wrapped: (event: ClickEvent) => unknown, event: ClickEvent) {
  const result = wrapped(event);
  if (!canvas?.tokens?._draggedToken && !canvas?.controls?.ruler?.active) stackPickerAfterClick(event);
  return result;
}

export function registerStackPicker() {
  game.settings?.register(MODULE_ID, "stackPicker", {
    name: i18n("midi-qol.StackPicker.Name"),
    hint: i18n("midi-qol.StackPicker.SettingHint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => closeStackPicker()
  });
  // Gone with a click elsewhere, Escape, the canvas moving or redrawn
  document.addEventListener("pointerdown", event => {
    if (!(event.target as HTMLElement | null)?.closest?.(`#${PICKER_ID}`)) closeStackPicker();
  }, { capture: true });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeStackPicker(); });
  Hooks.on("canvasPan", () => closeStackPicker());
  Hooks.on("canvasTearDown", () => closeStackPicker());
}
