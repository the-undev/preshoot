import { createTRPCClient, httpBatchLink } from "@trpc/client"
import type { TRPCClientErrorLike } from "@trpc/client"
import { createTRPCContext, createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import type { QueryClient } from "@tanstack/react-query"
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
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
type RouterInputs = inferRouterInputs<AppRouter>

/** A project as the renderer sees it, without the database handle main holds. */
export type ProjectSummary = NonNullable<RouterOutputs["projects"]["current"]>

/** How every procedure call fails, whatever the procedure. */
export type TrpcError = TRPCClientErrorLike<AppRouter>

/** One entry in the recent projects list. */
export type RecentProject = RouterOutputs["projects"]["recent"][number]

/** One model the llama-server can serve. */
export type ServerModel = RouterOutputs["settings"]["checkLlamaServer"]["models"][number]

/** What a server had to say when it was asked. */
export type ServerReport = RouterOutputs["settings"]["checkLlamaServer"]

/** One thing in the project's library. */
export type Asset = RouterOutputs["assets"]["list"][number]

/** One reference picture of a library thing. */
export type AssetImage = RouterOutputs["assets"]["images"][number]

/** Where the renderer reads a picture from. */
export function assetImageUrl(imageId: number): string {
  return `asset://${imageId}`
}

/** What a library thing can be. */
export type AssetKind = RouterInputs["assets"]["create"]["kind"]

/** A clip without its shots. */
export type ClipSummary = RouterOutputs["clips"]["list"][number]

/** The open tabs and which one is being looked at. */
export type Workspace = RouterOutputs["tabs"]["list"]

/** One open tab. A tab with no clip shows the list of clips. */
export type OpenTab = Workspace["tabs"][number]

/** A whole clip: its speakers, its shots, what they show and what is said. */
export type ClipComposition = RouterOutputs["clips"]["composition"]

/** A shape a clip can be generated at. */
export type AspectRatio = RouterOutputs["clips"]["aspectRatios"][number]

/** The prompt a clip makes, or why it cannot make one yet. */
export type ClipPrompt = RouterOutputs["clips"]["prompt"]

/** Everything a generation of a clip needs, the prompt being one field of it. */
export type GenerationRequest = Extract<ClipPrompt, { ready: true }>["request"]

/** A picture a clip is anchored to. */
export type FrameComposition = ClipComposition["frames"][number]

/** One shot of a clip. */
export type ShotComposition = ClipComposition["shots"][number]

/** A voice in a clip. */
export type SpeakerComposition = ClipComposition["speakers"][number]

/** One thing that happens in a shot, which is something done or something said. */
export type LineComposition = ShotComposition["lines"][number]

/** One line as the editor sends it back, which is a stored one without its id or its names. */
export type LineInput = RouterInputs["clips"]["updateShot"]["lines"][number]

/** The words the clip's target accepts, for the pickers in the editor. */
export type Vocabularies = RouterOutputs["clips"]["vocabularies"]
