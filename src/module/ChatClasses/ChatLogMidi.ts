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

  async scrollBottom({popout = false, waitImages=false, srollOptions = {}}={}) {
    const scroll = this.element.querySelector(".chat-scroll .chat-log");
    const count = scroll?.children.length ?? 0;
    const maxSize = CONFIG.ChatMessage.batchSize ?? 100
    if (count > maxSize) {
      for (let index = 0; index  < count - maxSize; index++) {
        //@ts-expect-error
        const mesaggeId = scroll.firstElementChild.dataset.messageId;
        const message = game.messages?.get(mesaggeId);
        if (message) message.logged = false;
        //@ts-expect-error
        scroll?.removeChild(scroll.firstElementChild)
      }
    }
    //@ts-expect-error
    return super.scrollBottom({popout, waitImages, srollOptions});

  }

  /* -------------------------------------------- */
  async updateMessage(message, notify=false) {
    const card = this.element.querySelector(`.message[data-message-id="${message.id}"]`);
    //@ts-ignore
    if ( card ) message._trayStates= new Map([
      ...Array.from(card.querySelectorAll(".card-tray")).map(t => [t.className.replace(" collapsed", ""), t.classList.contains("collapsed")]),
      ...Array.from(card.querySelectorAll(MidiQOL.ChatClasses.ChatMessageMidi.TRAY_TYPES.join(", "))).map(t => [t.tagName, t.open])
    ]);
    //@ts-expect-error
    await super.updateMessage(message, notify);
  }
/*
  async updateMessage(message, notify=false) {
    //@ts-expect-error no dnd5e-types
    const TRAY_TYPES: string[] = CONFIG.ChatMessage.documentClass.TRAY_TYPES.concat(["midi-damage-application"]);
    //@ts-expect-error
    super.updateMessage(message, notify);
    const element = this.element instanceof HTMLElement ? this.element : this.element[0];
    const card = element.querySelector(`.message[data-message-id="${message.id}"]`);
    if (card) {
      const additionalEntries = Array.from(card.querySelectorAll("midi-damage-application"))
      //@ts-expect-error t.open
        ?.map(t => [t.tagName, t.open]);
        if (additionalEntries.length && !message._trayStates) message._trayStates = new Map();
        additionalEntries.forEach(([tagName, open]) => message._trayStates.set(tagName, open));
    }
  }
*/
  /* -------------------------------------------- */

  /**
   * Record visibility of cards as they intersect the viewport.
   * @param {IntersectionObserverEntry[]} entries  The observed elements that have entered or left the viewport.
   */
  #onCardIntersects(entries) {
    for ( const { isIntersecting, target } of entries ) {
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
    for ( const { addedNodes, removedNodes } of records ) {
      for ( const node of addedNodes ) this.#intersections.observe(node);
      for ( const node of removedNodes ) this.#intersections.unobserve(node);
    }
  }
}