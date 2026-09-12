# Milestone 2: prompt generation

A brief typed into the open project becomes a MiniMax H3 prompt, written
by the local Qwen model through llama-server, and every result is kept in
the project database. This proves the generation path before the asset
library and storyboard are built on top of it.

Read `CLAUDE.md` and `docs/roadmap.md` first. Work on a branch named
`feature/prompt-generation`. One commit per step below, `pnpm check` green
before each commit, no attribution trailers in commit messages. Hand the
branch over for review at the end; do not push or merge.

## Prerequisites on the machine

llama-server from the Arch `llama-cpp` package with the `ggml-cuda`
backend, running Qwen3.5-9B at Q4_K_M:

```
llama-server -hf unsloth/Qwen3.5-9B-GGUF:Q4_K_M --no-mmproj -c 8192 --port 8080
```

`curl http://127.0.0.1:8080/health` answers `{"status":"ok"}` once the
model is loaded. The app does not start or stop the server in this
milestone. A probe of this setup returned a schema-constrained answer in
about 9 seconds.

## Behaviour

1. The workspace at `/project` shows two columns inside a centred band no
   wider than 1400px. Left: a textarea for the brief and a Generate button,
   with the latest result under them. Right: past generations for this
   project, newest first. Below about 1024px the columns stack.
2. Generate sends the brief to llama-server and, when it answers, shows
   the rendered H3 prompt with a Copy button that puts the text on the
   clipboard. The button and textarea are disabled while a request is in
   flight.
3. A failed request shows an alert with a message the user can act on:
   the server could not be reached at its URL, the server is still
   loading, or the server answered with something the app could not read.
4. Each successful generation is stored in the project database and
   appears at the top of the history list, showing the brief, the time,
   and the rendered prompt. Each entry has its own Copy button.
5. A gear button in the workspace header opens a settings dialog with the
   llama-server URL and a Check button that reports whether the server
   answers. Save writes the URL to app settings. The default URL is
   `http://127.0.0.1:8080`.
6. Closing and reopening the project shows the same history.

## Files on disk

App settings at `<userData>/settings.json` gain one field:

```json
{
  "recentProjects": [],
  "llamaServerUrl": "http://127.0.0.1:8080"
}
```

A settings file without the field reads as the default URL.

## The H3 target

MiniMax H3 takes one text prompt made of three named fields. This
milestone covers only the text-to-video form (T2VA in the guide), which has
no reference image line. The rendered prompt is:

```
integrated_multimodal_description: <field>

overall_soundscape: <field>

non_diegetic_music: <field>
```

The model answers with JSON holding the three fields, constrained by a JSON
schema sent in the request, and the app renders the text. The full guide is
`docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md` in the `MiniMaxAI/MiniMax-H3`
repository on Hugging Face. The system prompt below is distilled from it.

## Step 1: core prompting module

Files under `src/main/core/prompting/`. No Electron imports.

`errors.ts`

- `class PromptServiceError extends Error` with a `code` field of type
  `"unreachable" | "loading" | "bad-response"`. The message names the URL
  for `unreachable`.

`llama-server-client.ts`

- `interface ChatRequest { system: string; user: string; schema: Record<string, unknown>; maxTokens: number }`.
- `interface ChatResult { content: string; model: string }`.
- `class LlamaServerClient` constructed with `{ baseUrl: string; fetch: typeof fetch }`.
  `fetch` is a required parameter so tests inject a fake.
  - `health(): Promise<"ok" | "loading">`. GET `/health`. A 200 with
    `status: "ok"` is `ok`; a 503 is `loading`. A network failure throws
    `unreachable`.
  - `chat(request): Promise<ChatResult>`. POST `/v1/chat/completions` with
    this body, timing out after 120 seconds through `AbortSignal.timeout`:

    ```json
    {
      "messages": [
        { "role": "system", "content": "<system>" },
        { "role": "user", "content": "<user>" }
      ],
      "response_format": {
        "type": "json_schema",
        "json_schema": { "name": "prompt", "schema": {} }
      },
      "chat_template_kwargs": { "enable_thinking": false },
      "max_tokens": 800,
      "temperature": 0.7
    }
    ```

    `enable_thinking: false` stops Qwen3.5 from reasoning before it
    answers, which the schema grammar needs. llama-server caches the
    system prompt prefix between requests by default, so its length costs
    once per server start.

    The response is checked with a zod schema that reads
    `choices[0].message.content` and `model`. A network failure throws
    `unreachable`, a 503 throws `loading`, any other non-2xx status or a
    body that fails the schema throws `bad-response`.

`targets/minimax-h3.ts`

- `H3_PROMPT_SCHEMA`: JSON schema object with the three required string
  properties and `additionalProperties: false`.
- `h3PromptSchema`: the zod equivalent, type `H3Prompt`.
- `H3_SYSTEM_PROMPT`: the text in the next section.
- `renderH3Prompt(prompt: H3Prompt): string`. Joins the three fields as
  shown under "The H3 target", each on its own line with a blank line
  between.
- `h3UserMessage(brief: string): string`. Returns the brief followed by
  one line: `Target length: one clip under 15 seconds.`

`generate.ts`

- `interface GeneratedPrompt { fields: H3Prompt; rendered: string; model: string }`.
- `generateH3Prompt(client: LlamaServerClient, brief: string): Promise<GeneratedPrompt>`.
  Calls `chat` with the system prompt, user message and schema, parses the
  content with `h3PromptSchema` (failure is `bad-response`), renders it.

Tests:

- `llama-server-client.test.ts` with a fake `fetch`: health ok, health
  loading on 503, chat sends the schema and the thinking flag, chat maps a
  refused connection to `unreachable`, chat maps a malformed body to
  `bad-response`.
- `targets/minimax-h3.test.ts`: render produces the three labelled
  paragraphs in order, the zod schema rejects a missing field.
- `generate.test.ts` with a fake client: returns fields, rendered text and
  model name.

### System prompt

```
You write prompts for the MiniMax H3 video generation model. The user gives
a brief. You turn it into one complete prompt for a single clip.

Answer with JSON holding exactly three string fields:
integrated_multimodal_description, overall_soundscape, non_diegetic_music.

integrated_multimodal_description is the main body. Everything in it must
be visible or audible. Begin with "[Shot 1]" followed by the overall style
(for example Live-action, cinematic, 2D-animated, 3D CG, claymation,
watercolor, vintage film) and the opening composition. Then describe the
subjects, their appearance and position, the scene and key props, the
actions and reactions in order, and any dialogue. Give the first shot no
timestamp. Start each later shot with a sequential number and a strictly
increasing cut time, for example "[Shot 2] At 00:03.500, the camera cuts
to". Use "the camera cuts to", "the shot cuts to", "the shot transitions
to", "the shot changes to" or "the shot switches to". Cut only to show new
information about subject, space, state, viewpoint or time; for a change of
distance or slight angle, move the camera instead. Prefer one or two shots.

Write camera motion as a natural English action inside the shot, using
these motion types: zoom in, zoom out, push in, pull out, pan left, pan
right, truck left, truck right, tilt up, tilt down, pedestal up, pedestal
down, arc shot, tracking shot, static shot, shake slightly, shake strongly,
POV, roll clockwise, roll counterclockwise. Add "with small amplitude" or
"with large amplitude" and "at slow speed" or "at fast speed" only when they
matter. Example: "The camera pushes in with small amplitude at slow speed
toward the folded letter in her hands."

Speakers get stable IDs such as (S1) and (S2), introduced with enough
detail to fix their identity: character type, age, gender, on or off
screen, pitch, timbre, pace or accent. Spoken words go inside <d> with a
language tag, kept verbatim: The young woman with a quiet, breathy voice
(S1) says: <d>[English] I get off at the next station.</d>. Voiceover uses
the exact phrase "says in an off-screen voiceover" and is followed by a
statement that the on-screen character's lips remain closed. Text visible
on screen goes in double quotation marks, verbatim. Diegetic music, radio,
television and phone audio belong here, not in the other two fields.

overall_soundscape is one paragraph of one to four sentences summarising
ambient sound, physical action sounds and non-verbal human sounds across
the whole clip: wind, rain, traffic, footsteps, fabric, impacts, breathing,
laughter. Do not repeat dialogue, singing or diegetic music. Use "N/A" only
when the brief asks for complete silence.

non_diegetic_music is one to three sentences describing music only the
audience hears: instrumentation, tempo, rhythm and changes in dynamics. Do
not use mood words or explain what the music is for. Use "N/A" when there
is no score.

Add scene, character, action and sound detail that stays consistent with
the brief. Keep the whole clip under 15 seconds.

Example answer for the brief "A baker opens the shutters of a small street
bakery before sunrise":

integrated_multimodal_description: [Shot 1] Live-action, cinematic, a
medium-wide shot frames a baker opening the shutters of a small street
bakery before sunrise. The camera pushes in with small amplitude at slow
speed as the middle-aged baker with a calm, slightly raspy voice (S1)
places a fresh loaf on the wooden counter and says: <d>[English] First
batch of the morning.</d> [Shot 2] At 00:05.000, the camera cuts to a
close-up of steam rising from the sliced bread while the baker's final
words carry over from the previous shot.

overall_soundscape: Wooden shutters scrape open over a quiet street as
trays clink softly inside the bakery. The doorbell rings once, followed by
light footsteps and the crisp sound of bread being sliced.

non_diegetic_music: A soft acoustic-guitar pattern at a moderate tempo,
joined by sparse upright-bass notes and a gentle fade at the end.
```

Store it as a template literal without the hard line wraps, one paragraph
per line.

## Step 2: generations table

`src/main/core/db/schema.ts` gains:

```ts
export const generations = sqliteTable("generations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  target: text("target").notNull(),
  brief: text("brief").notNull(),
  fields: text("fields", { mode: "json" }).$type<Record<string, string>>().notNull(),
  rendered: text("rendered").notNull(),
  model: text("model").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})
```

Run `pnpm db:generate` and commit the new file under `resources/migrations`.

`src/main/core/prompting/generation-store.ts`

- `interface GenerationRecord { id: number; target: string; brief: string; fields: Record<string, string>; rendered: string; model: string; createdAt: string }`
  with `createdAt` as an ISO string, since it crosses to the renderer.
- `insertGeneration(db: ProjectDatabase, input: Omit<GenerationRecord, "id" | "createdAt">): GenerationRecord`.
- `listGenerations(db: ProjectDatabase): GenerationRecord[]`, newest first.

`generation-store.test.ts` against a temp database opened with
`openProjectDatabase`, as `db/index.test.ts` does: insert then list returns
the row first, list on a fresh database is empty.

## Step 3: settings, context and routers

`src/main/core/settings/app-settings.ts`

- `appSettingsSchema` gains `llamaServerUrl: z.url().default("http://127.0.0.1:8080")`.
- `AppSettingsStore.llamaServerUrl(): string` and
  `setLlamaServerUrl(url: string): void`, which reads, replaces the field
  and writes. Extend `app-settings.test.ts`: default when the field is
  missing, set then read.

`src/main/trpc/context.ts`: extend `Context` with

```ts
promptClient(): LlamaServerClient
```

`src/main/index.ts` builds it as
`() => new LlamaServerClient({ baseUrl: settings.llamaServerUrl(), fetch: globalThis.fetch })`,
so a URL change in settings applies to the next request without a restart.

`src/main/trpc/routers/settings.ts`, mounted as `settings`:

| Procedure          | Kind     | Input                     | Output                               |
| ------------------ | -------- | ------------------------- | ------------------------------------ |
| `get`              | query    | none                      | `{ llamaServerUrl: string }`         |
| `update`           | mutation | `{ llamaServerUrl: url }` | `{ llamaServerUrl: string }`         |
| `checkLlamaServer` | mutation | `{ url: url }`            | `"ok" \| "loading" \| "unreachable"` |

`checkLlamaServer` builds a client for the given URL rather than the saved
one, so the dialog can check before saving. It returns `unreachable` rather
than throwing, since a down server is an answer, not a failure.

`src/main/trpc/routers/prompts.ts`, mounted as `prompts`:

| Procedure  | Kind     | Input               | Output               |
| ---------- | -------- | ------------------- | -------------------- |
| `generate` | mutation | `{ brief: string }` | `GenerationRecord`   |
| `list`     | query    | none                | `GenerationRecord[]` |

Both require an open project and throw `TRPCError` `PRECONDITION_FAILED`
without one. `generate` trims the brief and rejects an empty one through
zod. It calls `generateH3Prompt`, inserts the record with target
`"minimax-h3"`, and returns it. `PromptServiceError` is rethrown as
`TRPCError` with the original message, code `SERVICE_UNAVAILABLE` for
`unreachable` and `loading`, `BAD_GATEWAY` for `bad-response`.

`prompts.test.ts` through `appRouter.createCaller(ctx)` with a temp
project and a fake `promptClient` whose `chat` returns a fixed JSON
string: generate stores and returns a record, list returns it, generate
without a project throws, an `unreachable` client error surfaces as
`SERVICE_UNAVAILABLE`.

## Step 4: renderer

Design system: add with the shadcn CLI and export from the index:
`textarea`, `scroll-area`, `tooltip`. Do not edit the generated files.

Feature code under `src/renderer/src/features/prompts/`:

- `brief-form.tsx`: textarea and Generate button, disabled while pending.
  Takes `onGenerate(brief)` and `isPending`. Presentational, tested with
  props in `brief-form.test.tsx`: submit calls `onGenerate` with the
  trimmed text, an empty brief does not call it.
- `prompt-result.tsx`: shows a `GenerationRecord` as the rendered prompt in
  a `pre` with wrapped text, and a Copy button calling
  `navigator.clipboard.writeText`. Shows "Copied" for two seconds after.
- `generation-history.tsx`: takes `generations` and renders a
  `PromptResult` per entry with the brief and time as its heading.
  Tested with props in `generation-history.test.tsx`: renders each brief,
  newest first as given.
- `use-generate-prompt.ts`: hook wrapping `prompts.generate`, invalidating
  `trpc.prompts.pathKey()` on success and exposing the error message.

`src/renderer/src/features/settings/settings-dialog.tsx`: URL input
seeded from `settings.get`, Check calls `checkLlamaServer` with the field
value and shows the result inline, Save calls `settings.update` and closes.

`src/renderer/src/routes/project.tsx`: header gains the gear button
opening the settings dialog. The main area becomes the two-column layout
from behaviour 1: `mx-auto grid w-full max-w-[1400px] gap-8 p-8 lg:grid-cols-2`.
Left column: `BriefForm`, the error alert, `PromptResult` for the latest
generation. Right column: `GenerationHistory` from `prompts.list`.

Errors: the tRPC error message from `generate` goes straight into the
alert. Messages from `PromptServiceError` already say what to do.

## Step 5: roadmap

In `docs/roadmap.md`: add milestone 2 to "Done" as one line, renumber the
remaining milestones, and fold the old milestone 4 into a line about
generating per clip from the storyboard, since the single-brief path now
exists. Add open items found on the way. Two are known now:

- Streaming tokens to the renderer needs a subscription link over the
  `trpc://` scheme.
- The reference image forms of the H3 prompt (I2VA, FL2VA, L2VA) need the
  alignment line and arrive with the asset library.

## Verification

`pnpm check` after every step. Name the covering test in each commit body
when a step adds behaviour. Before handover, with llama-server running as
in the prerequisites, run `pnpm dev` once and confirm the six behaviours
above by hand, then say which ones were checked and paste one generated
prompt.
