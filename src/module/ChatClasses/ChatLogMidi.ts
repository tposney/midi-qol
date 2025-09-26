import { BaseChatLogClass } from "../../midi-qol.js";
import { forceHideRoll } from "../settings.js";
import { ChatMessageMidi } from "./ChatMessageMidi.js";

// TODO - refactor to be a subclass of ChatLog5e.
// - need to override onFirstRender to set up intersection observer and not call ChatLog.onFirstRender
// - need to override updateMessage to save tray states and not call ChatLog.updateMessage
export class ChatLogMidi extends globalThis.dnd5e.applications.ChatLog5e {
  /**
   * Record visibility of cards as they intersect the viewport.
   * @param {IntersectionObserverEntry[]} entries  The observed elements that have entered or left the viewport.
   */

  #intersections;
  #lastId;
  #renderingBatch = false;
  #renderingQueue = new foundry.utils.Semaphore(1);
  #overflowingDebounce = foundry.utils.debounce(this.#setOverflowing.bind(this), 100);

  /* -------------------------------------------- */

  /** Replace the ChatLog5e _onFirstRender behaviour */
  async _onFirstRender(context, options) {
    const scroll = this.element.querySelector(".chat-scroll");
    const log = this.element.querySelector(".chat-log");
    new MutationObserver(this.#onLogMutated.bind(this)).observe(log as Node, { childList: true });
    this.#intersections = new IntersectionObserver(this.#onCardIntersects.bind(this), { root: scroll });
    const grandParent = Object.getPrototypeOf(BaseChatLogClass);
    grandParent.prototype._onFirstRender.call(this, context, options);
    // return super._onFirstRender(context, options);
  }

  async pruneElement() {
    const scroll = this.element.querySelector(".chat-scroll .chat-log");
    const count = scroll?.children.length ?? 0;
    const maxSize = CONFIG.ChatMessage.batchSize ?? 25;
    if (count > maxSize) {
      for (let index = 0; index < count - maxSize; index++) {
        const messageId = scroll.firstElementChild.dataset.messageId;
        const message = game.messages?.get(messageId);
        if (message) message.logged = false;
        // scroll?.removeChild(scroll.firstElementChild)
        removeElementAndListeners(scroll.firstElementChild)
        this.#lastId = messageId;
      }
    }
  }

  async scrollBottom({ popout = false, waitImages = false, scrollOptions = {} } = {}) {
    this.pruneElement();
    this.popout && this.popout.pruneElement();
    return super.scrollBottom({ popout, waitImages, scrollOptions });
  }


  /* replace the ChatLog5e updateMessage behaviour */
  async updateMessage(message, notify = false) {
    const card = this.element.querySelector(`.message[data-message-id="${message.id}"]`);
    //@ts-ignore
    if (card) message._trayStates = new Map([
      //@ts-expect-error
      ...Array.from(card.querySelectorAll(".card-tray")).map(t => [t.className.replace(" collapsed", ""), t.classList.contains("collapsed")]),
      //@ts-expect-error
      ...Array.from(card.querySelectorAll(ChatMessageMidi.TRAY_TYPES.join(", "))).map(t => [t.tagName, t.open])
    ]);
    const grandParent = Object.getPrototypeOf(BaseChatLogClass);
    grandParent.prototype.updateMessage.call(this, message, notify);
    // await super.updateMessage(message, notify);
  }

  /**
   * Record visibility of cards as they intersect the viewport.
   * @param {IntersectionObserverEntry[]} entries  The observed elements that have entered or left the viewport.
   */
  #onCardIntersects(entries) {
    const selector = ChatMessageMidi.TRAY_TYPES.join(", ");
    for (const { isIntersecting, target } of entries) {
      target.querySelectorAll(selector).forEach(tray => tray.visible = isIntersecting);
    }
  }

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
  async #doRenderBatch(size) {
    if (!this.rendered) {
      this.#renderingBatch = false;
      return;
    }

    const messages = game.messages?.contents;
    if (!messages) return;
    const log = this.element.querySelector(".chat-log");
    if (!log) return;

    // Get the index of the last rendered chat message
    let lastIdx = messages.findIndex(m => m.id === this.#lastId);
    lastIdx = lastIdx > -1 ? lastIdx : messages.length;
    if (!lastIdx) {
      this.#renderingBatch = false;
      return;
    }

    // Get the next batch to render
    const targetIdx = Math.max(lastIdx - size, 0);
    const elements = [];
    for (let i = targetIdx; i < lastIdx; i++) {
      const message = messages[i];
      if (!message.visible) continue;
      message.logged = true;
      try {
        //@ts-expect-error
        elements.push(await this.constructor.renderMessage(message));
      } catch (err) {
        Hooks.onError("ChatLog##doRenderBatch", err as Error, {
          msg: `Chat message ${message.id} failed to render`,
          log: "error"
        });
      }
    }

    // Prepend the HTML
    log.prepend(...elements);
    this.#lastId = messages[targetIdx].id;
    this.#renderingBatch = false;
    if (!this.isPopout) this.#overflowingDebounce();
  }

  #setOverflowing() {
    const scroll = this.element.querySelector(".chat-scroll");
    scroll.classList.toggle("overflowed", scroll.scrollHeight > scroll.offsetHeight);
  }
  async renderBatch(size) {
    if (this.#renderingBatch) return;
    this.#renderingBatch = true;
    return this.#renderingQueue.add(this.#doRenderBatch.bind(this), size);
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