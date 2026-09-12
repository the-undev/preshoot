import { app, protocol, shell, BrowserWindow, nativeTheme } from "electron"
import { join } from "path"
import { electronApp, optimizer, is } from "@electron-toolkit/utils"
import icon from "../../resources/icon.png?asset"
import { LlamaServerClient } from "./core/prompting/llama-server-client"
import { ProjectSession } from "./core/projects/session"
import { AppSettingsStore } from "./core/settings/app-settings"
import { createDialogs } from "./dialogs"
import { handleAssetRequests } from "./images/protocol"
import { PRIVILEGED_SCHEMES } from "./schemes"
import { handleTrpcRequests } from "./trpc/protocol"
import type { Context } from "./trpc/context"

// Once, before app ready: a second registration would replace these rather than add to them.
protocol.registerSchemesAsPrivileged(PRIVILEGED_SCHEMES)

const projects = new ProjectSession()

/** Migrations ship beside the app once packaged and come from the repo in development. */
function migrationsFolder(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "migrations")
    : join(app.getAppPath(), "resources", "migrations")
}

/** Builds the values every procedure reaches. Folder pickers open over `window`. */
function createContext(window: BrowserWindow): () => Context {
  const settings = new AppSettingsStore(join(app.getPath("userData"), "settings.json"))
  const context: Context = {
    versions: {
      app: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    projects,
    settings,
    migrationsFolder: migrationsFolder(),
    dialogs: createDialogs(window),
    // Built per request, so a URL saved in settings applies to the next generation without a restart.
    promptClient: (baseUrl) => new LlamaServerClient({ baseUrl, fetch: globalThis.fetch }),
    openPath: async (path) => {
      await shell.openPath(path)
    },
  }
  return () => context
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    // Matches the dark --background token, so the window does not flash white before first paint.
    backgroundColor: "#0a0a0a",
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

  // The app is dark whatever the desktop is set to, native dialogs included.
  nativeTheme.themeSource = "dark"

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // The window exists before the page loads so the protocol handler is ready for its first request.
  const mainWindow = createWindow()
  handleTrpcRequests(createContext(mainWindow))
  handleAssetRequests(projects)
  loadRenderer(mainWindow)

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) loadRenderer(createWindow())
  })
})

app.on("window-all-closed", () => {
  projects.close()
  app.quit()
})
