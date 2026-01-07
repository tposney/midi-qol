export class ChatLogMidi extends globalThis.dnd5e.applications.ChatLog5e {
  #lastId: string | undefined;
  #renderingBatch = false;
  #renderingQueue = new foundry.utils.Semaphore(1);
  #overflowingDebounce = foundry.utils.debounce(this.#setOverflowing.bind(this), 100);
  #pruneDebounce = foundry.utils.debounce(this.#doPrune.bind(this), 100);
  #renderedIds = new Set<string>(); // Track rendered messages per-instance

  #doPrune() {
    const scroll = this.element?.querySelector(".chat-scroll .chat-log");
    const count = scroll?.children.length ?? 0;
    const maxSize = CONFIG.ChatMessage.batchSize ?? 25;
    if (count >= maxSize * 2) {
      for (let index = 0; index < count - maxSize; index++) {
        const firstChild = scroll?.firstElementChild;
        const messageId = firstChild?.dataset?.messageId;
        // Update per-instance tracking
        if (messageId) this.#renderedIds.delete(messageId);
        // Only main sidebar updates message.logged for compatibility
        if (!this.isPopout && messageId) {
          const message = game.messages?.get(messageId);
          if (message) message.logged = false;
        }
        firstChild?.remove();
        this.#lastId = messageId;
      }
    }
  }

  async pruneElement() {
    this.#pruneDebounce();
  }

  async scrollBottom({ popout = false, waitImages = false, scrollOptions = {} } = {}) {
    if (!this.rendered) return;
    // Each instance prunes its own DOM independently
    this.pruneElement();
    return super.scrollBottom({ popout, waitImages, scrollOptions });
  }

  /** @inheritDoc */
  async close(options = {}) {
    // Clear per-instance state so reopening renders fresh
    this.#renderedIds.clear();
    this.#lastId = undefined;
    return super.close(options);
  }

  async #doRenderBatch(size: number) {
    if (!this.rendered) {
      this.#renderingBatch = false;
      return;
    }

    const messages = game.messages?.contents;
    if (!messages) return;
    const log = this.element?.querySelector(".chat-log");
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
    const elements: HTMLElement[] = [];
    for (let i = targetIdx; i < lastIdx; i++) {
      const message = messages[i];
      if (!message.visible) continue;
      // Use per-instance tracking to prevent duplicate rendering
      // This allows main log and popout to render independently
      if (this.#renderedIds.has(message.id!)) continue;
      this.#renderedIds.add(message.id!);
      // Update message.logged for main sidebar only (for compatibility with core/other modules)
      if (!this.isPopout) message.logged = true;
      try {
        //@ts-expect-error renderMessage exists on constructor
        elements.push(await this.constructor.renderMessage(message));
      } catch (err) {
        Hooks.onError("ChatLog#doRenderBatch", err as Error, {
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
    const scroll = this.element?.querySelector(".chat-scroll");
    scroll?.classList.toggle("overflowed", scroll.scrollHeight > scroll.offsetHeight);
  }

  async renderBatch(size: number) {
    if (this.#renderingBatch) return;
    this.#renderingBatch = true;
    return this.#renderingQueue.add(this.#doRenderBatch.bind(this), size);
  }
}
