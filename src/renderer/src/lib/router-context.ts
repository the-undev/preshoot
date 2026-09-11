import type { QueryClient } from "@tanstack/react-query"
import type { TrpcProxy } from "./trpc"

/** What every route can reach, supplied when the router is created. */
export interface RouterContext {
  queryClient: QueryClient
  trpc: TrpcProxy
}
