import { ChatMessageMidi } from "./ChatMessageMidi.js";

export class ChatLogMidi extends foundry.applications.sidebar.tabs.ChatLog {
  /**
   * Record visibility of cards as they intersect the viewport.
   * @param {IntersectionObserverEntry[]} entries  The observed elements that have entered or left the viewport.
   */

  #intersections;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    const scroll = this.element.querySelector(".chat-scroll");
    const log = this.element.querySelector(".chat-log");
    new MutationObserver(this.#onLogMutated.bind(this)).observe(log as Node, { childList: true });
    this.#intersections = new IntersectionObserver(this.#onCardIntersects.bind(this), { root: scroll });
    return super._onFirstRender(context, options);
  }

  async pruneElement() {
    const scroll = this.element.querySelector(".chat-scroll .chat-log");
    const count = scroll?.children.length ?? 0;
    const maxSize = CONFIG.ChatMessage.batchSize ?? 15;
    if (count > maxSize) {
      for (let index = 0; index < count - maxSize; index++) {
        //@ts-expect-error
        const messageId = scroll.firstElementChild.dataset.messageId;
        const message = game.messages?.get(messageId);
        if (message) message.logged = false;
        //@ts-expect-error
        // scroll?.removeChild(scroll.firstElementChild)
        removeElementAndListeners(scroll.firstElementChild)
      }
    }
  }

  async scrollBottom({ popout = false, waitImages = false, scrollOptions = {} } = {}) {
    this.pruneElement();
    this.popout && this.popout.pruneElement();
    //@ts-expect-error
    return super.scrollBottom({ popout, waitImages, scrollOptions });
  }


  /* -------------------------------------------- */
  async updateMessage(message, notify = false) {
    const card = this.element.querySelector(`.message[data-message-id="${message.id}"]`);
    //@ts-ignore
    if (card) message._trayStates = new Map([
      ...Array.from(card.querySelectorAll(".card-tray")).map(t => [t.className.replace(" collapsed", ""), t.classList.contains("collapsed")]),
      ...Array.from(card.querySelectorAll(MidiQOL.ChatClasses.ChatMessageMidi.TRAY_TYPES.join(", "))).map(t => [t.tagName, t.open])
    ]);
    //@ts-expect-error
    await super.updateMessage(message, notify);
  }

  /**
   * Record visibility of cards as they intersect the viewport.
   * @param {IntersectionObserverEntry[]} entries  The observed elements that have entered or left the viewport.
   */
  #onCardIntersects(entries) {
    for (const { isIntersecting, target } of entries) {
      const trays = target.querySelectorAll("damage-application, effect-application, midi-damage-application");
      trays.forEach(tray => tray.visible = isIntersecting);
    }
  }

  /* -------------------------------------------- */

  /**
   * React to changes in the chat log.
   * @param {MutationRecord[]} records  The change list.
   */
  #onLogMutated(records) {
    for (const { addedNodes, removedNodes } of records) {
      for (const node of addedNodes) this.#intersections.observe(node);
      for (const node of removedNodes) this.#intersections.unobserve(node);
    }
  }
}


const origAdd = EventTarget.prototype.addEventListener;
const origRemove = EventTarget.prototype.removeEventListener;

EventTarget.prototype.addEventListener = function (type, fn, opts) {
  if (this) {
    if (!this._listeners) this._listeners = [];
    this._listeners.push({ type, fn, opts });
  }
  return origAdd.call(this, type, fn, opts);
};

EventTarget.prototype.removeEventListener = function (type, fn, opts) {
  if (this) {
    if (this._listeners) {
      this._listeners = this._listeners.filter(
        l => l.type !== type || l.fn !== fn || l.opts !== opts
      );
    }
  }
  return origRemove.call(this, type, fn, opts);
};

function removeElementAndListeners(el) {
  if (!el) return;
  if (el._listeners) {
    for (const { type, fn, opts } of el._listeners) {
      el.removeEventListener(type, fn, opts);
    }
    el._listeners = [];
  }
  if (el.parentNode) {
    el.parentNode.removeChild(el);
  }
}