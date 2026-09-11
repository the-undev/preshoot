import { ElectronAPI } from "@electron-toolkit/preload"

declare global {
  interface Window {
    electron: ElectronAPI
    preshoot: {
      /** Absolute path of a file or folder the user dropped on the window. */
      getPathForFile(file: File): string
    }
  }
}
