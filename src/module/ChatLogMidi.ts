export class ChatLogMidi extends CONFIG.ui.chat {
  async updateMessage(message, notify=false) {
    //@ts-expect-error
    await super.updateMessage(message, {notify: ui.chat._shouldShowNotifications()});
  }
}