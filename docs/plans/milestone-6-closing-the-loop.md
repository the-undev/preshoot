# Milestone 6: closing the loop

Milestone 4 built comparison and judging, and milestone 5 built editing and
export, but what those produce cannot be read back. A run is visible only
while its mutation result is in hand, marking a result good writes over its
note, and a run that fails part way leaves prompts behind with nothing
saying so. This makes the loop close.

Read `CLAUDE.md`, `docs/roadmap.md` and `docs/issues.md` first. Work on the
branch `feature/prompt-generation`. One commit per step below, `pnpm check`
green before each commit, no attribution trailers. Hand the branch over for
review at the end; do not push or merge.

## Behaviour

1. A clip lists the comparison runs it has, newest first, saying when each
   ran, how many ways were written and how many were marked good.
2. Choosing a run shows its results side by side, whether it ran a minute
   ago or last week.
3. A run that fails part way is kept, marked as stopped, and says which way
   of writing failed and why.
4. Marking a result good or bad leaves its note alone, and writing a note
   leaves its verdict alone.
5. A generation that runs past the two minute limit says so, rather than
   saying the server could not be reached.
6. Deleting a shot, a speaker or a library thing asks first, naming what
   goes.
7. The exports folder opens in the file manager from the clip screen.
8. The shots list says how to reorder a shot from the keyboard.

## Step 1: a timeout is not an unreachable server

`PromptServiceError` gains the code `"timeout"`, raised when the request was
abandoned rather than refused. `LlamaServerClient.send` tells them apart by
the `TimeoutError` an aborted signal throws. `asClientError` maps it to
`TIMEOUT`.

`llama-server-client.test.ts`: an aborted request is a timeout naming the
two minutes, a refused connection is still unreachable.

## Step 2: a verdict and a note are written apart

`judgeGeneration` splits into `setVerdict(db, { id, verdict })` and
`setNote(db, { id, note })`, and `prompts.judge` becomes `prompts.setVerdict`
and `prompts.setNote`. The compare panel calls one or the other.

`generation-store.test.ts` and `prompts.test.ts`: a verdict leaves the note
alone and a note leaves the verdict alone.

## Step 3: a run that stops part way says so

`generations` gains nothing. `prompts.compare` stops throwing: it writes each
pair in turn, and on a failure returns what landed together with the pair
that failed and the message. The result becomes
`{ runId, results, failure: { composerId, variantId, message } | null }`.

`prompts.test.ts`: a failing pair leaves the earlier results under the run
and names itself.

## Step 4: runs are readable

`generation-store.ts` gains `listRuns(db, clipId): RunSummary[]`, where a
`RunSummary` is `{ runId, ranAt, written, good }`, newest first, built from
the generations that carry a run.

`prompts.runs({ clipId })` and `prompts.run({ runId })` expose them.

`generation-store.test.ts` and `prompts.test.ts`: runs are listed newest
first with their counts, and one run reads back in the order it was written.

## Step 5: nothing goes without asking

`src/renderer/src/design-system/confirm-dialog.tsx`, a wrapper over the
dialog: a title, a line saying what goes, and Cancel and Delete. Exported
from the index.

The clip screen's own confirmation moves onto it, and deleting a shot, a
speaker or a library thing asks through it.

`confirm-dialog.test.tsx`: it names what goes, reports a confirmation, and
reports a cancel.

## Step 6: the exports folder, and how to drag

`Context` gains `openPath(path: string): Promise<void>`, `src/main/index.ts`
builds it on Electron's `shell.openPath`, and `prompts.openExports` opens
the project's `exports/prompts`, creating it first so the file manager has
something to open.

The clip screen gains a button for it, and the shots list a line saying that
a shot is reordered from the keyboard by focusing its handle, pressing
space, moving with the arrows and pressing space again.

`prompts.test.ts`: opening the exports folder creates it and asks the system
to open it.

## Step 7: roadmap and issues

Add milestone 6 to "Done", renumber, and take out of `docs/issues.md`
everything this closes.

## Verification

`pnpm check` after every step, and `pnpm build` before handover. Name the
covering test in each commit body.
