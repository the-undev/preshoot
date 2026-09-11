import { createTRPCClient, httpBatchLink } from "@trpc/client"
import { createTRPCContext } from "@trpc/tanstack-react-query"
import type { AppRouter } from "../../../main/trpc/router"

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>()

/** Client that reaches the main process through the trpc:// protocol handler. */
export function createTrpcClient(): ReturnType<typeof createTRPCClient<AppRouter>> {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: "trpc://app" })],
  })
}
