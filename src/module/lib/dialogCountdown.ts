/**
 * The countdown on a midi dialog that answers itself when time runs out (reactions, optional bonuses, effect choice):
 * a bar under the window header that drains from green to red, the seconds left, and a button to pause it when the
 * user needs more time. One timer owns the expiry, so pausing really stops it.
 */

import { i18n } from "../../midi-qol.js";

export interface CountdownOptions {
  /** Seconds before the dialog answers itself; 0 or less: no countdown. */
  seconds: number;
  /** Time ran out. */
  onExpire: () => void;
  /** The user paused or resumed it (e.g. pause the matching timer on the client waiting for the answer). */
  onPause?: (paused: boolean) => void;
}

const TICK_MS = 200;

/** Countdowns created for a dialog that opens later (a roll dialog), by id: see dialogCountdownOptions. */
const pending = new Map<string, DialogCountdown>();

export class DialogCountdown {
  readonly id = foundry.utils.randomID();
  readonly #total: number;
  #remaining: number;
  #deadline = 0;
  #interval: number | undefined;
  #paused = false;
  #done = false;
  #element: HTMLElement | undefined;
  readonly #options: CountdownOptions;

  constructor(options: CountdownOptions) {
    this.#options = options;
    this.#total = Math.max(0, options.seconds) * 1000;
    this.#remaining = this.#total;
    if (this.#total > 0) this.#start();
  }

  get paused() { return this.#paused; }
  get secondsLeft() { return Math.ceil(this.#remaining / 1000); }

  #start() {
    this.#deadline = Date.now() + this.#remaining;
    this.#interval = window.setInterval(() => this.#tick(), TICK_MS);
  }

  #tick() {
    if (this.#paused || this.#done) return;
    this.#remaining = Math.max(0, this.#deadline - Date.now());
    this.#draw();
    if (this.#remaining > 0) return;
    this.stop();
    this.#options.onExpire();
  }

  pause() {
    if (this.#paused || this.#done || !this.#total) return;
    this.#remaining = Math.max(0, this.#deadline - Date.now());
    window.clearInterval(this.#interval);
    this.#interval = undefined;
    this.#paused = true;
    this.#draw();
    this.#options.onPause?.(true);
  }

  resume() {
    if (!this.#paused || this.#done) return;
    this.#paused = false;
    this.#start();
    this.#draw();
    this.#options.onPause?.(false);
  }

  /** The dialog was answered or closed: no more ticking, and no expiry. */
  stop() {
    pending.delete(this.id);
    this.#done = true;
    window.clearInterval(this.#interval);
    this.#interval = undefined;
  }

  /** Show the countdown at the top of the dialog's content (again after a re-render). */
  attach(dialog: HTMLElement | null | undefined) {
    if (!dialog || !this.#total) return;
    const content = dialog.querySelector<HTMLElement>(".window-content") ?? dialog;
    let element = content.querySelector<HTMLElement>(":scope > .midi-qol-countdown");
    if (!element) {
      element = document.createElement("div");
      element.className = "midi-qol-countdown";
      element.setAttribute("role", "timer");
      element.innerHTML = `<div class="track"><div class="bar"></div></div><span class="label"></span>`
        + `<button type="button" class="pause icon fa-solid fa-pause"></button>`;
      element.querySelector("button")!.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (this.#paused) this.resume();
        else this.pause();
      });
      content.prepend(element);
    }
    this.#element = element;
    this.#draw();
  }

  #draw() {
    const element = this.#element;
    if (!element?.isConnected) return;
    const fraction = this.#total ? this.#remaining / this.#total : 0;
    const bar = element.querySelector<HTMLElement>(".bar")!;
    bar.style.width = `${(fraction * 100).toFixed(1)}%`;
    // Green (120) at the start to red (0) at the end
    bar.style.backgroundColor = `hsl(${Math.round(120 * fraction)} 70% 42%)`;
    element.querySelector(".label")!.textContent = this.#paused ? i18n("midi-qol.Countdown.Paused") : `${this.secondsLeft}s`;
    const button = element.querySelector<HTMLButtonElement>("button.pause")!;
    button.classList.toggle("fa-pause", !this.#paused);
    button.classList.toggle("fa-play", this.#paused);
    button.dataset.tooltip = i18n(this.#paused ? "midi-qol.Countdown.Resume" : "midi-qol.Countdown.Pause");
    button.setAttribute("aria-label", button.dataset.tooltip);
    element.classList.toggle("paused", this.#paused);
    element.classList.toggle("urgent", !this.#paused && fraction <= 0.25);
  }
}

/**
 * Show this countdown on a dnd5e roll dialog opened later (a save the player is asked for): pass the result as the roll's
 * `dialog.options`, which dnd5e hands to the dialog. Works for any roll configuration dialog (dnd5e's or midi's).
 */
export function dialogCountdownOptions(countdown: DialogCountdown): { midiCountdownId: string } {
  pending.set(countdown.id, countdown);
  return { midiCountdownId: countdown.id };
}

export function setupDialogCountdowns() {
  Hooks.on("renderRollConfigurationDialog", (app: foundry.applications.api.ApplicationV2, element: HTMLElement) => {
    const id = (app.options as { midiCountdownId?: string }).midiCountdownId;
    if (id) pending.get(id)?.attach(element);
  });
}
