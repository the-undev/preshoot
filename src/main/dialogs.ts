import { BrowserWindow, dialog } from "electron"
import type { Dialogs } from "./trpc/context"

/** Native pickers, shown over `window`. */
export function createDialogs(window: BrowserWindow): Dialogs {
  return {
    async pickDirectory({ title, allowCreate }) {
      const result = await dialog.showOpenDialog(window, {
        title,
        properties: allowCreate ? ["openDirectory", "createDirectory"] : ["openDirectory"],
      })
      return result.filePaths[0] ?? null
    },

    async pickFiles({ title, extensions }) {
      const result = await dialog.showOpenDialog(window, {
        title,
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "Pictures", extensions }],
      })
      return result.filePaths
    },

    async saveFile({ title, defaultPath }) {
      const result = await dialog.showSaveDialog(window, { title, defaultPath })
      return result.canceled ? null : (result.filePath ?? null)
    },
  }
}
