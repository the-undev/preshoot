# Milestone 4: models and iteration

The app stops caring how llama-server was started, and starts being able to
tell one way of writing a prompt from another. Those are one milestone
because both are main process work that can be checked against a local
server without anyone watching the screen.

Read `CLAUDE.md` and `docs/roadmap.md` first. Work on the branch
`feature/prompt-generation`, which already carries milestones 2 and 3. One
commit per step below, `pnpm check` green before each commit, no attribution
trailers in commit messages. Hand the branch over for review at the end; do
not push or merge.

## What was found on the running server

llama-server b10809 has a router mode, and this was checked against it
rather than taken from the documentation:

- `llama-server --models-dir <dir>` serves every model it can find from one
  process, and it reads the HuggingFace cache as well as the directory. It
  loads a model on demand by spawning a child llama-server and proxying to
  it, and killing the router kills the children.
- A request must name its model. Without one the answer is
  `400 model name is missing from the request`.
- `GET /v1/models` gives each model an id, a status of `loaded` or
  `unloaded`, the arguments its child would run with, and its modalities.
- `POST /models/unload` with `{ "model": "<id>" }` frees a model and ends its
  child.
- A model whose projector sits beside it gets vision with no extra flag. On
  this machine the projector has to stay off the GPU (`--mmproj-device none`)
  or the image encode aborts inside CUDA while anything else holds the card.

So the app manages no processes. It names a model, sees what is loaded, and
can unload to hand the card to ComfyUI later.

## Behaviour

1. Settings hold a llama-server URL and a model. Check lists what the server
   has, with each model marked loaded or unloaded, and picks the first when
   nothing is saved yet.
2. A loaded model can be unloaded from the settings dialog, which is how the
   card is freed without stopping the server.
3. Generating with no model chosen says so and asks for one, rather than
   sending a request the server will refuse.
4. The system prompt behind each way of writing becomes a variant that can be
   read, copied and edited inside the project. The built-in ones are listed
   but cannot be changed.
5. Generate writes with the chosen variant. Every stored generation keeps the
   variant it used and the exact system prompt text, so an edit later does
   not rewrite what happened.
6. Compare runs one clip through several pairs of way and variant in one go,
   and shows the results side by side under a single run.
7. Each result can be marked good or bad and carry a note, which is kept with
   it.
8. Deleting a clip takes its prompts with it, and says how many will go
   before it does.

## Step 1: the client names its model

`src/main/core/prompting/llama-server-client.ts`

- `ChatRequest` gains `model: string`, sent as `model` in the body.
- `interface ServerModel { id: string; state: "loaded" | "unloaded" | "unknown"; modalities: string[] }`.
- `models(): Promise<ServerModel[]>`. GET `/v1/models`. A server that is not
  a router answers without a status, which reads as `unknown`.
- `unload(modelId: string): Promise<void>`. POST `/models/unload`. A 404 is
  a server that is not a router, and throws `bad-response`.

`llama-server-client.test.ts` grows: chat sends the model, models reads ids
and states, a model without a status reads as `unknown`, unload posts the id,
unload against a server that does not know the route is a bad response.

## Step 2: settings hold the model

`src/main/core/settings/app-settings.ts`

- `appSettingsSchema` gains `llamaModel: z.string().default("")`.
- `llamaModel()` and `setLlamaModel(id)`, both over the merging update.

`src/main/trpc/context.ts`: `promptClient(baseUrl)` is unchanged, since the
model now travels with the request rather than the client.

`src/main/trpc/routers/settings.ts`

| Procedure          | Kind     | Input                            | Output                             |
| ------------------ | -------- | -------------------------------- | ---------------------------------- |
| `get`              | query    | none                             | `{ llamaServerUrl, llamaModel }`   |
| `update`           | mutation | `{ llamaServerUrl, llamaModel }` | the same                           |
| `checkLlamaServer` | mutation | `{ url }`                        | `{ state, models: ServerModel[] }` |
| `unloadModel`      | mutation | `{ url, modelId }`               | `{ models: ServerModel[] }`        |

`checkLlamaServer` keeps returning `unreachable` rather than throwing, and
carries an empty model list with it.

`app-settings.test.ts` and `settings.test.ts` grow: the model defaults to
empty, saving one reads it back, a check reports the models the server has,
unload asks the server and reports what is left.

## Step 3: the settings dialog picks a model

`src/renderer/src/features/settings/settings-dialog.tsx`: the URL row keeps
its Check button. Under it, the models the last check found, each with its
state, the chosen one selected, and an Unload button against a loaded one.
Save writes both fields. When nothing is saved and the check finds models,
the first is chosen.

`settings-dialog.test.tsx` is new and takes props rather than the router:
split the form into `settings-form.tsx` so it can be tested without a
provider. It shows the models it is given, reports the model chosen, and
disables Unload on a model that is not loaded.

## Step 4: prompt variants

`src/main/core/prompting/variant.ts`

- `interface PromptVariant { id: string; targetId: string; strategy: "prose" | "brief"; name: string; systemPrompt: string; editable: boolean }`.
- Built-in variants come from the target and have ids like
  `builtin:minimax-h3:prose`. Stored ones have ids like `stored:7`.
- `builtinVariants(target): PromptVariant[]`.

`src/main/core/db/schema.ts` gains:

```ts
export const promptVariants = sqliteTable("prompt_variants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  targetId: text("target_id").notNull(),
  strategy: text("strategy").notNull(),
  name: text("name").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})
```

`generations` gains `runId` (text, null), `promptVariantId` (text, null),
`systemPrompt` (text, null), `verdict` (text, null) and `note` (text, not
null, default `""`). Run `pnpm db:generate` and read the SQL before
committing it.

`src/main/core/prompting/variant-store.ts`

- `listVariants(db, target): PromptVariant[]`, built-ins first.
- `insertVariant(db, input)`, `updateVariant(db, input)`, `deleteVariant(db, id)`.
- `readVariant(db, target, id): PromptVariant`, which resolves a built-in id
  from the target and a stored id from the table, and throws
  `CompositionError` `not-found` for anything else.

`variant-store.test.ts` against a temp database: the built-ins are listed
without being stored, a stored variant is listed after them, a built-in
cannot be rewritten or deleted, reading an unknown id fails.

## Step 5: writing with a variant

`ComposeInput` gains `systemPrompt: string`, and the prose and brief
composers use it in place of the target's own. The target keeps its built-in
text, which is where the built-in variant comes from.

`src/main/trpc/routers/prompts.ts`

- `generate` takes `{ clipId, composerId, variantId }` and stores the variant
  id and the system prompt text with the result.
- `regenerateShot` reuses the variant the earlier generation recorded.
- A generate with no model in settings throws `BAD_REQUEST` naming what to
  do.
- New `variants` query taking `{ clipId }`, returning the variants for that
  clip's target, and `saveVariant` / `removeVariant` mutations.

`prompts.test.ts` grows: a generation records the variant and the prompt
text, a stored variant's text reaches the server, generating without a model
is refused, rewriting one shot reuses the variant.

## Step 6: comparison runs

`prompts.compare` takes `{ clipId, runs: { composerId, variantId }[] }`,
writes the clip once per pair in order, stores each result with a shared
`runId`, and returns them. A failure part way through keeps what already
landed and reports which pair failed.

`prompts.judge` takes `{ generationId, verdict, note }` and stores them.

`listGenerations` keeps its order, and a new `listRun(db, runId)` reads one
run.

`prompts.test.ts` grows: a comparison stores one row per pair under one run,
the rows carry their own composer and variant, a verdict and a note are kept.

## Step 7: the variant editor

`src/renderer/src/features/prompts/variant-list.tsx` and
`variant-form.tsx`, both presentational, and `use-variants.ts` for the
queries. A built-in shows its text read-only with a Copy to edit button that
stores a copy. A stored one can be renamed, rewritten and deleted.

`variant-list.test.tsx` and `variant-form.test.tsx` with props: built-ins
cannot be edited or deleted, a copy reports the text it came from, the form
reports what was typed.

## Step 8: comparing in the workspace

The clips screen gains a Compare panel: the pairs of way and variant to run,
a Run button, and the results of the newest run side by side, each with its
way, its variant, Copy, and good or bad with a note.

`compare-panel.test.tsx` with props: it lists the pairs chosen, reports a
run, shows one column per result, and reports a verdict.

## Step 9: a deleted clip takes its prompts

`deleteClip` removes the clip's generations rather than leaving them with no
clip, which is what the `set null` did. The clips router answers `remove`
with how many prompts went, and the renderer asks first, naming the number.

`clip-store.test.ts` and `clips.test.ts` grow.

## Step 10: roadmap

Add milestone 4 to "Done", renumber, and record what the router findings mean
for the asset images milestone: vision needs no separate launch, but the
projector has to stay off the GPU on this card. Close the open items this
milestone settles and add what turned up on the way.

## Verification

`pnpm check` after every step. Name the covering test in each commit body.
Before handover, run the prose composer and one comparison against a router
started as
`llama-server --models-dir ~/.cache/huggingface/hub --models-max 1 --mmproj-device none`,
and say which parts have only test cover.
