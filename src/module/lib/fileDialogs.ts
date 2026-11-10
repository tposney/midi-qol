import { i18n } from "../../midi-qol.js";

/**
 * Ask for a JSON file and read it. Resolves to the file's text and name, or null when the dialog is cancelled or
 * closed, or no file was chosen (with a warning).
 */
export async function chooseJsonFile(title: string, hint?: string): Promise<{ text: string, name: string } | null> {
  const content = await foundry.applications.handlebars.renderTemplate("templates/apps/import-data.hbs", { hint1: hint });
  const result: unknown = await foundry.applications.api.DialogV2.wait({
    window: { title },
    position: { width: 400 },
    content,
    rejectClose: false,
    buttons: [
      {
        action: "import",
        icon: "fa-solid fa-file-import",
        label: "midi-qol.Import.Import",
        default: true,
        callback: (_event, _button, dialog) => dialog.element.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0] ?? "noFile"
      },
      { action: "cancel", icon: "fa-solid fa-xmark", label: "Cancel", callback: () => false }
    ]
  });
  // Closed or cancelled: null / false
  if (result === "noFile") ui.notifications?.warn(i18n("midi-qol.Import.NoFile"));
  if (!(result instanceof File)) return null;
  return { text: await foundry.utils.readTextFromFile(result), name: result.name };
}
