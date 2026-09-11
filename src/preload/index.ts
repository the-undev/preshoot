import { contextBridge, webUtils } from "electron"
import { electronAPI } from "@electron-toolkit/preload"

// Application calls go over tRPC on the trpc:// scheme, so the bridge only carries toolkit helpers.
contextBridge.exposeInMainWorld("electron", electronAPI)

// A dropped folder arrives as a File with no usable path; webUtils is the only way to resolve it.
contextBridge.exposeInMainWorld("preshoot", {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})
