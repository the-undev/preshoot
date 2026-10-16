import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/design-system"
import {
  useTRPC,
  useTRPCClient,
  type GenerationRequest,
  type ShownSlot,
  type WorkflowShownSlots,
} from "@renderer/lib/trpc"
import { setClipTransfer, type SentSlotValue, type SentValue } from "./clip-transfer"
import { shownName } from "./slot-labels"

/** The choice of a row that sends its piece nowhere, which no slot id can be. */
const NOT_SENT = "not-sent"

/** What a piece of the clip sends, with a picture named by its id until its path is read. */
type PieceSource =
  | { type: "text"; text: string }
  | { type: "number"; value: number }
  | { type: "picture"; imageId: number }

/** One piece of the clip as a row of the mapping step, with the slots it can go to. */
interface Piece {
  key: string
  label: string
  /** What the row shows of the piece under its choice, or null for nothing. */
  detail: string | null
  slots: ShownSlot[]
  /** Whether the piece has to go somewhere, so the row offers no Not sent. */
  required: boolean
  /** The slot the row starts on, for the user to confirm. */
  preselected: number | null
  source: PieceSource
}

/** Whether a slot is the prompt-sized box shown up front, which is offered first. */
function isPromptBox(slot: ShownSlot): boolean {
  return slot.multiline && slot.tier === "basic"
}

/** A workflow's shown text slots, prompt-sized basic ones first and then the rest in graph order. */
function textSlotsOf(workflow: WorkflowShownSlots): ShownSlot[] {
  const textSlots = workflow.slots.filter((slot) => slot.kind === "text")
  return [...textSlots.filter(isPromptBox), ...textSlots.filter((slot) => !isPromptBox(slot))]
}

/** The first slot whose scanned or display name holds the word, ignoring case. */
function firstNamed(slots: ShownSlot[], word: string): number | null {
  const found = slots.find((slot) =>
    [slot.name, slot.displayName ?? ""].some((name) => name.toLowerCase().includes(word))
  )
  return found?.id ?? null
}

/** The clip's prompt, duration and condition pictures as rows, each with the slots it can go to. */
function piecesFor(
  workflow: WorkflowShownSlots,
  text: string,
  request: GenerationRequest
): Piece[] {
  const textSlots = textSlotsOf(workflow)
  const numberSlots = workflow.slots.filter(
    (slot) => slot.kind === "number" || slot.kind === "integer"
  )
  const imageSlots = workflow.slots.filter((slot) => slot.kind === "image")
  return [
    {
      key: "prompt",
      label: "Prompt",
      detail: null,
      slots: textSlots,
      required: true,
      preselected: textSlots[0]?.id ?? null,
      source: { type: "text", text },
    },
    {
      key: "duration",
      label: "Duration",
      detail: `${request.durationSeconds} seconds`,
      slots: numberSlots,
      required: false,
      preselected: firstNamed(numberSlots, "duration"),
      source: { type: "number", value: request.durationSeconds },
    },
    ...request.conditions.map((condition): Piece => {
      const first = condition.at === "first frame"
      return {
        key: first ? "first-frame" : "last-frame",
        label: first ? "First frame" : "Last frame",
        detail: `${condition.fileName}, from ${condition.fromAsset}`,
        slots: imageSlots,
        required: false,
        preselected: firstNamed(imageSlots, first ? "first" : "last"),
        source: { type: "picture", imageId: condition.imageId },
      }
    }),
  ]
}

interface SendClipDialogProps {
  /** The prompt's full text, which fills the text slot picked. */
  text: string
  /** What the clip needs besides its prompt, of which the duration and pictures can be sent. */
  request: GenerationRequest
  /** The clip the pieces came from, which has no name until it is saved. */
  clipName: string | null
  onOpenWorkflow: (workflowId: number) => void
  onOpenWorkflows: () => void
  onCancel: () => void
}

/**
 * Picks one of the project's workflows with a text slot, then which of its slots the clip's prompt,
 * duration and pictures go to, and opens it with them filled, unsaved and unqueued.
 */
export function SendClipDialog({
  text,
  request,
  clipName,
  onOpenWorkflow,
  onOpenWorkflows,
  onCancel,
}: SendClipDialogProps): React.JSX.Element {
  const trpc = useTRPC()
  const list = useQuery(trpc.workflows.shownSlots.queryOptions())
  const [pickedId, setPickedId] = useState<number | null>(null)
  const errorMessage = list.error?.message ?? null
  const targets = (list.data ?? []).filter((workflow) => textSlotsOf(workflow).length > 0)
  const picked = targets.find((workflow) => workflow.id === pickedId) ?? null

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send to workflow</DialogTitle>
          <DialogDescription>
            {picked
              ? "Pick the slot each piece of the clip goes to. The workflow opens with them filled, to edit, save or queue there."
              : "Pick the workflow, then the slots the clip's prompt, duration and pictures go to."}
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription className="break-words">{errorMessage}</AlertDescription>
          </Alert>
        )}

        {picked ? (
          <PieceMapping
            key={picked.id}
            workflow={picked}
            pieces={piecesFor(picked, text, request)}
            clipName={clipName}
            onOpenWorkflow={onOpenWorkflow}
            onBack={() => setPickedId(null)}
            onCancel={onCancel}
          />
        ) : (
          <>
            {list.isPending ? (
              <p className="text-sm text-muted-foreground">Reading the workflows…</p>
            ) : targets.length > 0 ? (
              <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
                {targets.map((workflow) => (
                  <li key={workflow.id} aria-label={workflow.name}>
                    <Button
                      variant="ghost"
                      className="h-auto w-full justify-start py-2"
                      onClick={() => setPickedId(workflow.id)}
                    >
                      <span className="truncate">{workflow.name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              !errorMessage && (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-muted-foreground">
                    {list.data?.length === 0
                      ? "This project has no workflows yet. Import one on the Workflows page, and its slots are offered here."
                      : "None of this project's workflows has a text slot in its form. A slot set to hidden in a workflow's mapping is not offered."}
                  </p>
                  <Button variant="outline" size="sm" onClick={onOpenWorkflows}>
                    Open Workflows
                  </Button>
                </div>
              )
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface PieceMappingProps {
  workflow: WorkflowShownSlots
  pieces: Piece[]
  clipName: string | null
  onOpenWorkflow: (workflowId: number) => void
  onBack: () => void
  onCancel: () => void
}

/** The mapping step: a choice of slot for each piece, then Send, which reads the picture paths. */
function PieceMapping({
  workflow,
  pieces,
  clipName,
  onOpenWorkflow,
  onBack,
  onCancel,
}: PieceMappingProps): React.JSX.Element {
  const client = useTRPCClient()
  const [choices, setChoices] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(pieces.map((piece) => [piece.key, piece.preselected]))
  )
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const chosenSlotIds = pieces.flatMap((piece) => {
    const slotId = choices[piece.key]
    return slotId === null ? [] : [slotId]
  })
  const sharesSlot = new Set(chosenSlotIds).size !== chosenSlotIds.length

  const sentValue = async (source: PieceSource): Promise<SentValue> => {
    if (source.type !== "picture") return source
    return {
      type: "file",
      path: await client.assets.picturePath.query({ imageId: source.imageId }),
    }
  }

  const send = async (): Promise<void> => {
    setSendError(null)
    setIsSending(true)
    try {
      const values: SentSlotValue[] = await Promise.all(
        pieces.flatMap((piece) => {
          const slotId = choices[piece.key]
          if (slotId === null) return []
          return [sentValue(piece.source).then((value) => ({ slotId, value }))]
        })
      )
      setClipTransfer({ workflowId: workflow.id, clipName, values })
      onOpenWorkflow(workflow.id)
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error))
      setIsSending(false)
    }
  }

  return (
    <>
      <div className="flex min-w-0 flex-col gap-3">
        <p className="truncate text-sm font-medium">{workflow.name}</p>
        {pieces.map((piece) => {
          const choice = choices[piece.key]
          const id = `send-piece-${piece.key}`
          return (
            <div
              key={piece.key}
              className="grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1"
            >
              <Label htmlFor={id}>{piece.label}</Label>
              <Select
                value={choice === null ? NOT_SENT : String(choice)}
                onValueChange={(value) =>
                  setChoices((current) => ({
                    ...current,
                    [piece.key]: value === NOT_SENT ? null : Number(value),
                  }))
                }
              >
                <SelectTrigger id={id} className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {piece.slots.map((slot) => (
                    <SelectItem key={slot.id} value={String(slot.id)}>
                      {shownName(slot)}
                    </SelectItem>
                  ))}
                  {!piece.required && <SelectItem value={NOT_SENT}>Not sent</SelectItem>}
                </SelectContent>
              </Select>
              {piece.detail && (
                <p className="col-start-2 truncate text-xs text-muted-foreground">{piece.detail}</p>
              )}
            </div>
          )
        })}
        {sharesSlot && (
          <p className="text-sm text-destructive">
            Two pieces go to the same slot. Send one of them to another slot, or set it to Not sent.
          </p>
        )}
        {sendError && (
          <Alert variant="destructive">
            <AlertDescription className="break-words">
              Nothing was sent. {sendError}
            </AlertDescription>
          </Alert>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={sharesSlot || isSending} onClick={() => void send()}>
          Send
        </Button>
      </DialogFooter>
    </>
  )
}
