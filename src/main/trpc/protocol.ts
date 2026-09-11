import { protocol } from "electron"
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { appRouter } from "./router"
import type { Context } from "./context"

/** Scheme the renderer fetches; the URL the client uses is `trpc://app`. */
export const TRPC_SCHEME = "trpc"

// The page origin (file:// packaged, localhost in dev) differs from trpc://, so every
// request is cross-origin and the scheme must answer CORS preflights and headers.
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, trpc-accept, x-trpc-source",
}

/** Must run before app ready: marks the scheme as fetchable, CORS-capable and streamable. */
export function registerTrpcScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: TRPC_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

/** Routes every trpc:// request through the tRPC fetch adapter. Call after app ready. */
export function handleTrpcRequests(createContext: () => Context): void {
  protocol.handle(TRPC_SCHEME, (request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders })
    }
    return fetchRequestHandler({
      endpoint: "",
      req: request,
      router: appRouter,
      createContext,
      responseMeta: () => ({ headers: corsHeaders }),
    })
  })
}
