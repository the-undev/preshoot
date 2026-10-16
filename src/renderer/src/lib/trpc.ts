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

/** Whether a ComfyUI instance answered, and which version it runs when it did. */
export type ComfyUiStatus = RouterOutputs["settings"]["checkComfyUi"]

/** One thing in the project's library. */
export type Asset = RouterOutputs["assets"]["list"][number]

/** One reference picture of a library thing. */
export type AssetImage = RouterOutputs["assets"]["images"][number]

/**
 * Where the renderer reads a picture from. A width asks for it drawn that wide, so a thumbnail
 * does not read the whole photograph. Only 80, 160 and 320 are offered.
 */
export function assetImageUrl(imageId: number, width?: 80 | 160 | 320): string {
  return width === undefined ? `asset://${imageId}` : `asset://${imageId}/${width}`
}

/** What the library folder holds, or why nothing can be listed. */
export type LibraryFolder = RouterOutputs["library"]["entries"]

/** A top-level folder of the library. */
export type LibraryKind = Extract<LibraryFolder, { state: "listed" }>["kinds"][number]

/** A folder under a kind, or a file directly under one, with its files and its notes. */
export type LibraryEntry = LibraryKind["entries"][number]

/** One file of a library entry. */
export type LibraryFile = LibraryEntry["files"][number]

/** What a library file holds, as far as its extension says. */
export type LibraryMedia = LibraryFile["media"]

/**
 * Where the renderer reads a library file from, by where it sits under the library folder. A
 * width asks for a picture drawn that wide, as `assetImageUrl` does.
 */
export function libraryFileUrl(relativePath: string, width?: 80 | 160 | 320): string {
  const url = `library://file/${encodeURIComponent(relativePath)}`
  return width === undefined ? url : `${url}?width=${width}`
}

/** What a library thing can be. */
export type AssetKind = RouterInputs["assets"]["create"]["kind"]

/** A clip without its shots. */
export type ClipSummary = RouterOutputs["clips"]["list"][number]

/** One shot saved in the library, ready to drop into a clip. */
export type SavedShot = RouterOutputs["clips"]["savedShots"][number]

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

/** One of the people, places or objects a clip holds. */
export type SubjectComposition = ClipComposition["cast"][number]

/** One thing that happens in a shot, which is something done or something said. */
export type LineComposition = ShotComposition["lines"][number]

/** One line as the editor sends it back, which is a stored one without its id or its names. */
export type LineInput = RouterInputs["clips"]["updateShot"]["lines"][number]

/** What a line of a shot is: something shown, something that happens, or something said. */
export type LineKind = LineInput["kind"]

/** The words the clip's target accepts, for the pickers in the editor. */
export type Vocabularies = RouterOutputs["clips"]["vocabularies"]

/** What the workflows folder holds, or why nothing can be listed. */
export type WorkflowFolder = RouterOutputs["workflows"]["files"]

/** One workflow file in the workflows folder. */
export type WorkflowFile = Extract<WorkflowFolder, { state: "listed" }>["files"][number]

/** A workflow the project holds, without its mapping. */
export type WorkflowSummary = RouterOutputs["workflows"]["list"][number]

/** A workflow with its mapping and its guide. */
export type WorkflowDetail = RouterOutputs["workflows"]["get"]

/** One input of a workflow the app can fill. */
export type WorkflowSlot = WorkflowDetail["slots"][number]

/** A workflow with the text slots its form shows, which a prompt can be sent to. */
export type WorkflowTextSlots = RouterOutputs["workflows"]["textSlots"][number]

/** One text slot a prompt can be sent to. */
export type TextSlot = WorkflowTextSlots["slots"][number]

/** Where a slot is shown in the mapping. */
export type SlotTier = WorkflowSlot["tier"]

/** What a slot takes. */
export type SlotKind = WorkflowSlot["kind"]

/** A workflow already in the project whose mapping one just imported could start from. */
export type BaseSuggestion = NonNullable<RouterOutputs["workflows"]["import"]["suggestion"]>

/** How a workflow's source file stands against the project's copy. */
export type SourceStatus = RouterOutputs["workflows"]["checkSource"]

/** How a changed source file would change the slots. */
export type SlotDiff = Extract<SourceStatus, { state: "changed" }>["diff"]

/** The value a slot holds as saved in the workflow, which the run form starts from. */
export type SavedSlotValue = RouterOutputs["runs"]["values"][number]

/** One slot of a run as the form sends it: whether its node runs, and what fills it. */
export type RunBinding = RouterInputs["runs"]["queue"]["bindings"][number]

/** One time a workflow was queued, with how it went and what it wrote. */
export type RunRecord = RouterOutputs["runs"]["list"][number]

/** Where a run stands. */
export type RunState = RunRecord["state"]

/** What a poll of a run found, with its place in the queue while it waits. */
export type RunStatus = RouterOutputs["runs"]["poll"][number]

/** A saved set of values for one workflow's slots. */
export type Configuration = RouterOutputs["configurations"]["list"][number]

/** A configuration's values matched to the workflow's slots as they are now. */
export type LoadedConfiguration = RouterOutputs["configurations"]["load"]

/** One file a run wrote, with the verdict and note it was given. */
export type RunOutput = RunRecord["outputs"][number]

/** What a reviewer said of an output. */
export type Verdict = NonNullable<RunOutput["verdict"]>

/** How many of a workflow's outputs are good, bad, unmarked, and in all. */
export type VerdictCounts = RouterOutputs["review"]["counts"]

/** Which outputs the run list shows. */
export type VerdictFilter = keyof VerdictCounts

/** What exporting the good outputs did. */
export type OutputExport = RouterOutputs["review"]["exportGood"]

/**
 * Where the renderer reads a run's output from, by where it sits in the project. A width asks for
 * a picture drawn that wide, as `assetImageUrl` does.
 */
export function outputFileUrl(path: string, width?: 80 | 160 | 320): string {
  const url = `output://file/${encodeURIComponent(path)}`
  return width === undefined ? url : `${url}?width=${width}`
}
