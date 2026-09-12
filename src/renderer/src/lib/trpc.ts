import { createTRPCClient, httpBatchLink } from "@trpc/client"
import type { TRPCClientErrorLike } from "@trpc/client"
import { createTRPCContext, createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import type { QueryClient } from "@tanstack/react-query"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "../../../main/trpc/router"

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>()

/** Client that reaches the main process through the trpc:// protocol handler. */
export function createTrpcClient(): ReturnType<typeof createTRPCClient<AppRouter>> {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: "trpc://app" })],
  })
}

/** The same procedure options React sees, for code outside a component such as route loaders. */
export function createTrpcProxy(
  client: ReturnType<typeof createTrpcClient>,
  queryClient: QueryClient
): TrpcProxy {
  return createTRPCOptionsProxy<AppRouter>({ client, queryClient })
}

export type TrpcProxy = ReturnType<typeof createTRPCOptionsProxy<AppRouter>>

type RouterOutputs = inferRouterOutputs<AppRouter>

/** A project as the renderer sees it, without the database handle main holds. */
export type ProjectSummary = NonNullable<RouterOutputs["projects"]["current"]>

/** How every procedure call fails, whatever the procedure. */
export type TrpcError = TRPCClientErrorLike<AppRouter>

/** One entry in the recent projects list. */
export type RecentProject = RouterOutputs["projects"]["recent"][number]

/** One prompt generated in the open project. */
export type GenerationRecord = RouterOutputs["prompts"]["list"][number]
