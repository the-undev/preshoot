# Milestone 5: editing and export

A prompt built from pieces can be rewritten by asking for a change in
words, and the result can leave the app. Those are one milestone because
they are the two ends of the same path: build, edit, export.

Read `CLAUDE.md` and `docs/roadmap.md` first. Work on the branch
`feature/prompt-generation`, which already carries milestones 2, 3 and 4.
One commit per step below, `pnpm check` green before each commit, no
attribution trailers in commit messages. Hand the branch over for review at
the end; do not push or merge.

## Behaviour

1. A generated prompt has an edit box under it. Typing "she is happier" or
   "make the whole scene faster" and pressing Edit writes a new prompt from
   the old one and that instruction.
2. An edit is a generation like any other: it is stored, shown as the newest
   result, can be copied, marked good or bad, compared, and edited again.
3. The history shows an edit under the prompt it came from, with the
   instruction that made it, so a chain reads as a chain.
4. The system prompt behind editing is a variant, listed under Prompts
   beside the ones for prose and brief, and can be copied and tuned.
5. Export writes the prompt being shown into
   `<project>/exports/prompts/`, as a `.txt` holding the prompt and nothing
   else, and a `.json` beside it holding the clip, the way it was written,
   the variant, the model, any edit instruction, and the time.
6. Save asks where to put the same pair through the native dialog, and does
   nothing when the dialog is cancelled.
7. Export and Save act on the prompt in front of you, not on everything the
   clip has.

## Step 1: editing a prompt

`src/main/core/prompting/target.ts` gains:

```ts
export interface EditStrategy {
  systemPrompt: string
  schema: Record<string, unknown>
  userMessage(previous: string, instruction: string): string
  readFields(content: string): TargetFields
}
```

and `PromptTarget` gains `edit: EditStrategy`.

`targets/minimax-h3.ts` implements it, reusing the whole-prompt schema and
reader since an edit answers with the same three fields. Its system prompt
says: the user gives a finished prompt and a change; rewrite the whole
prompt with that change made and everything else left alone; keep the shot
markers, the cut times, the transition phrases and the dialogue tags exactly
as they are unless the change asks otherwise; answer with the three fields.
The user message is the rendered prompt, then the instruction under a line
saying what is being asked for.

`src/main/core/prompting/edit.ts`

- `interface EditRequest { target: PromptTarget; client: LlamaServerClient; model: string; systemPrompt: string; previous: TargetFields; instruction: string }`.
- `editPrompt(request): Promise<ComposedPrompt>`, with `prose` null, since an
  edit rewrites the whole prompt rather than a shot at a time.

Editing is not a `PromptComposer`. A composer turns a clip into a prompt;
this turns a prompt into another prompt, and bending the one interface to
cover both would make every composer accept an input it cannot use.

`variant.ts`: `PromptStrategy` gains `"edit"`, and `builtinVariants` returns
three.

Tests: `edit.test.ts` with a fake client, that the request carries the
rendered prompt and the instruction and that the answer becomes fields and
rendered text; `targets/minimax-h3.test.ts` grows a case for the edit user
message; `variant-store.test.ts` grows the third built-in.

## Step 2: an edit is a generation with a parent

`schema.ts`: `generations` gains `parentId` (integer, null) and
`editInstruction` (text, null). The parent is a plain integer rather than a
foreign key, because a clip's generations are deleted in one statement and a
self-referencing key would have to be checked row by row inside it.

`generation-store.ts`: both fields join `GenerationRecord`.

`prompts.ts` gains `edit`, taking `{ generationId, instruction, variantId }`.
It reads the generation, refuses one with no clip, takes the target from it,
resolves the variant (defaulting to the built-in edit one), calls
`editPrompt`, and stores the result with `composer` `"edit"`, the same clip
and composition, the parent, and the instruction.

`prompts.test.ts`: an edit stores the parent and the instruction, its
rendered text comes from the model, an edit of an edit keeps the chain, an
empty instruction is refused, and editing without a model chosen is refused.

## Step 3: export

`src/main/core/export/prompt-export.ts`

- `promptFileName(input: { clipName: string; createdAt: string }): string`,
  a slug of the clip name and the time, with no separator or dot in it.
- `writePromptFiles(input: { directory: string; baseName: string; rendered: string; meta: Record<string, unknown> }): { textPath: string; metaPath: string }`,
  creating the directory and writing both files.

`src/main/core/projects/marker.ts`: `projectPromptExportsPath(directory)`
returning `<directory>/exports/prompts`.

`src/main/dialogs.ts` and the `Dialogs` interface gain
`saveFile(options: { title: string; defaultPath: string }): Promise<string | null>`.

`prompts.ts` gains `exportToProject` and `exportToFile`, both taking
`{ generationId }`. The first writes into the project and returns the
paths; the second asks where first and returns null when cancelled. Both
refuse when no project is open.

Tests: `prompt-export.test.ts` against a temp directory for the naming and
the two files; `prompts.test.ts` for both procedures, with a fake save
dialog, including the cancelled case.

## Step 4: editing and export in the workspace

`src/renderer/src/features/prompts/prompt-result.tsx` gains, under the
prompt: an edit box with an Edit button, and Export and Save buttons beside
Copy. It stays presentational, taking `onEdit`, `onExport` and `onSave` and
whether each is in flight.

`use-edit-prompt.ts` and `use-export-prompt.ts` wrap the three procedures and
refresh the history.

`prompt-result.test.tsx` is new: the edit box reports the trimmed
instruction, an empty instruction does not call it, Export and Save report
the generation, and the buttons are held while one is in flight.

## Step 5: a chain reads as a chain

`generation-history.tsx` groups an edit under the prompt it came from,
showing the instruction above it and indenting it, however deep the chain
goes. A generation whose parent is not in the list is shown at the top level.

`generation-history.test.tsx` grows: an edit appears under its parent, a
chain of two edits nests twice, and an orphan edit still appears.

## Step 6: roadmap

Add milestone 5 to "Done", renumber, and close the open items this settles.
Add what turned up on the way.

## Verification

`pnpm check` after every step. Name the covering test in each commit body.
Before handover, edit a real prompt against a running llama-server and paste
the result, then say which parts have only test cover.
