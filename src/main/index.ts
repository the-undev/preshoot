import { app, shell, BrowserWindow } from "electron"
import { join } from "path"
import { electronApp, optimizer, is } from "@electron-toolkit/utils"
import icon from "../../resources/icon.png?asset"
import { ProjectSession } from "./core/projects/session"
import { AppSettingsStore } from "./core/settings/app-settings"
import { createDialogs } from "./dialogs"
import { handleTrpcRequests, registerTrpcScheme } from "./trpc/protocol"
import type { Context } from "./trpc/context"

registerTrpcScheme()

const projects = new ProjectSession()

/** Migrations ship beside the app once packaged and come from the repo in development. */
function migrationsFolder(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "migrations")
    : join(app.getAppPath(), "resources", "migrations")
}

/** Builds the values every procedure reaches. Folder pickers open over `window`. */
function createContext(window: BrowserWindow): () => Context {
  const context: Context = {
    versions: {
      app: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    projects,
    settings: new AppSettingsStore(join(app.getPath("userData"), "settings.json")),
    migrationsFolder: migrationsFolder(),
    dialogs: createDialogs(window),
  }
  return () => context
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  })

  mainWindow.on("ready-to-show", () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: "deny" }
  })

  return mainWindow
}

/** Loads the dev server when it is running and the built page otherwise. */
function loadRenderer(window: BrowserWindow): void {
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    window.loadURL(process.env["ELECTRON_RENDERER_URL"])
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("dev.theundev.preshoot")

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // The window exists before the page loads so the protocol handler is ready for its first request.
  const mainWindow = createWindow()
  handleTrpcRequests(createContext(mainWindow))
  loadRenderer(mainWindow)

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) loadRenderer(createWindow())
  })
})

app.on("window-all-closed", () => {
  projects.close()
  app.quit()
})
