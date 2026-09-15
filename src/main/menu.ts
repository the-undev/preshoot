import type { MenuItemConstructorOptions } from "electron"

/**
 * The app's menu, which is an accelerator table rather than something to look at: the bar is
 * hidden. The window menu is left out because Electron puts Close Window on Ctrl and W there, and
 * the renderer uses that to close a tab.
 */
export const APP_MENU: MenuItemConstructorOptions[] = [
  { role: "fileMenu" },
  { role: "editMenu" },
  { role: "viewMenu" },
]
