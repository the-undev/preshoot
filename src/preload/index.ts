import { contextBridge } from "electron"
import { electronAPI } from "@electron-toolkit/preload"

// Application calls go over tRPC on the trpc:// scheme, so the bridge only carries toolkit helpers.
contextBridge.exposeInMainWorld("electron", electronAPI)
