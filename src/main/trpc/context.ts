/** Values every procedure can reach. Built once per request by the protocol handler. */
export interface Context {
  versions: RuntimeVersions
}

/** Runtime versions shown on the welcome screen and in bug reports. */
export interface RuntimeVersions {
  app: string
  electron: string
  chrome: string
  node: string
}
