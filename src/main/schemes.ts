import type { CustomScheme } from "electron"

/** Scheme the renderer fetches; the URL the client uses is `trpc://app`. */
export const TRPC_SCHEME = "trpc"

/** Scheme the renderer reads pictures through; a picture's URL is `asset://<id>`. */
export const ASSET_SCHEME = "asset"

/**
 * Every scheme the app serves, as one list.
 *
 * Registering schemes replaces whatever was registered before rather than adding to it, so a
 * second call takes the first call's schemes away. A scheme registered in its own call once left
 * trpc:// without fetch support and the whole renderer unable to reach the main process.
 */
export const PRIVILEGED_SCHEMES: CustomScheme[] = [
  {
    scheme: TRPC_SCHEME,
    // The page origin (file:// packaged, localhost in dev) differs from trpc://, so every request
    // is cross-origin and the scheme has to answer CORS preflights and headers.
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
  {
    scheme: ASSET_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]
