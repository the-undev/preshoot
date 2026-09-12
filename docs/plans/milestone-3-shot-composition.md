# Milestone 3: shot composition

Simple options become a prompt worth giving to a video model. A clip is a
short ordered list of shots, each carrying a camera move, a transition, a
duration and the things it shows. The local model writes the prose for every
shot in one pass, so a look or a voice carries across a cut, and the app puts
the mechanical parts around it.

Read `CLAUDE.md` and `docs/roadmap.md` first. Work on a branch named
`feature/shot-composition`. One commit per step below, `pnpm check` green
before each commit, no attribution trailers in commit messages. Hand the
branch over for review at the end; do not push or merge.

## Scope

Text only. Assets hold a name and a description, no images and no vision
model. The storyboard stays in milestone 4: clips are a flat list, nothing is
chained by last frame to first frame, and a prompt is versioned only by the
generation history milestone 2 already keeps.

## Behaviour

1. The workspace header gains two tabs under the project name: Clips and
   Library.
2. Library lists the things clips refer to, each with a kind (person, place
   or object), a name and a description. They can be added, edited and
   deleted. Deleting one a shot still uses is refused, naming the clip.
3. Clips lists the project's clips, newest first, with a New clip button.
   Selecting one opens its editor.
4. The clip editor holds the clip's name, its style, its note, its music
   note, its speakers and its shots in order.
5. A shot carries a duration in seconds, a camera motion with amplitude and
   speed, a transition into it, lighting, the library things it shows, what
   happens in free text, its dialogue lines and a sound note. Every field but
   the duration and what happens may be left unset.
6. The first shot has no transition. Shots can be added, removed and
   reordered. The editor shows the running total and says so when the clip
   passes 15 seconds.
7. Generate offers three ways to write the prompt: model prose per shot, the
   default; assembled by the app with no model call; and the brief-only path
   from milestone 2, which uses the clip note and ignores the shots.
8. Each shot has a Regenerate button. It rewrites that shot's prose with the
   rest of the clip as context and leaves the other shots as they were.
9. The result is stored and shown as milestone 2 already does, and the
   history is per clip.
10. Every stored generation records which way it was written and the exact
    composition it was given, so two ways can be compared on the same clip.
11. Closing and reopening the project shows the same clips, library and
    history.

## Shape

Four layers, each knowing only the one under it.

- `src/main/core/composition/` holds the shape of a clip and nothing else. It
  knows no target, no model and no database.
- `src/main/core/prompting/target.ts` holds the `PromptTarget` interface. A
  target owns its vocabularies, its system prompts, the schema it asks the
  model to answer in, how prose becomes its fields, and how those fields
  render as one string. `targets/minimax-h3.ts` is the only implementation.
- `src/main/core/prompting/composers/` holds the `PromptComposer` interface
  and one file per way of asking. A composer knows the target interface and
  the llama-server client, never the database.
- `src/main/trpc/routers/` loads a composition out of the database, hands it
  to a composer, and stores what comes back.

Trying a fourth way of writing a prompt is a new file under `composers/`, a
line in its index, and an option in the picker. Adding Qwen Image is a new
file under `targets/`.

## Data

`src/main/core/db/schema.ts` gains, with foreign keys cascading from clip to
its shots, speakers and dialogue, and `shot_assets.assetId` restricted so a
library entry in use cannot vanish under a clip:

```ts
export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})

export const clips = sqliteTable("clips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  target: text("target").notNull(),
  style: text("style").notNull(),
  note: text("note").notNull(),
  musicNote: text("music_note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})

export const speakers = sqliteTable("speakers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clipId: integer("clip_id").notNull().references(() => clips.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  description: text("description").notNull(),
})

export const shots = sqliteTable("shots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clipId: integer("clip_id").notNull().references(() => clips.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  durationMs: integer("duration_ms").notNull(),
  cameraMotion: text("camera_motion"),
  amplitude: text("amplitude"),
  speed: text("speed"),
  transition: text("transition"),
  lighting: text("lighting"),
  action: text("action").notNull(),
  soundNote: text("sound_note").notNull(),
})

export const shotAssets = sqliteTable("shot_assets", {
  shotId: integer("shot_id").notNull().references(() => shots.id, { onDelete: "cascade" }),
  assetId: integer("asset_id").notNull().references(() => assets.id, { onDelete: "restrict" }),
  position: integer("position").notNull(),
}, (table) => [primaryKey({ columns: [table.shotId, table.assetId] })])

export const dialogueLines = sqliteTable("dialogue_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shotId: integer("shot_id").notNull().references(() => shots.id, { onDelete: "cascade" }),
  speakerId: integer("speaker_id").notNull().references(() => speakers.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  language: text("language").notNull(),
  text: text("text").notNull(),
})
```

`generations` gains `composer` (text, not null), `clipId` (integer, null for
the rows milestone 2 wrote) and `composition` (json, null likewise), and its
`model` column becomes nullable because the assembled way calls no model.
Existing rows take `composer` `"brief"`. Run `pnpm db:generate` and commit
the migration; dropping the not null on `model` rebuilds the table, so read
the generated SQL before committing it.

A speaker's label is its position: speaker 1 is `(S1)`. Nothing stores the
label.

## The H3 mapping

The app owns every closed part of the prompt. Given a clip whose shots have
durations, the cut time of shot N is the sum of the durations before it,
written `mm:ss.mmm`.

```
[Shot 1] <style>, <prose for shot 1>
[Shot 2] At 00:04.500, <transition phrase> <prose for shot 2>
```

`overall_soundscape` and `non_diegetic_music` are clip level. The model
writes them in the same answer as the shot prose. The assembled way joins the
shots' sound notes for the first and uses the clip's music note for the
second.

Camera motion is not inserted by the app. The instruction names the motion,
its amplitude and its speed, and the model writes it into the action sentence
where the guide wants it. Dialogue is the opposite: the line is given to the
model as an exact string it must reproduce, because the guide keeps spoken
words verbatim.

## Step 1: the composition and the target seam

`src/main/core/composition/clip.ts`

- `interface ClipComposition { id: number; name: string; style: string; note: string; musicNote: string; speakers: SpeakerComposition[]; shots: ShotComposition[] }`.
- `interface ShotComposition { id: number; durationMs: number; cameraMotion: CameraMotion | null; amplitude: Amplitude | null; speed: Speed | null; transition: Transition | null; lighting: string | null; things: ThingComposition[]; action: string; dialogue: DialogueComposition[]; soundNote: string }`.
- `interface SpeakerComposition { id: number; label: string; description: string }`,
  `interface ThingComposition { kind: string; name: string; description: string }`,
  `interface DialogueComposition { speakerId: number; language: string; text: string }`.
- `clipDurationMs(composition): number` and `shotStartMs(composition, shotId): number`.
- `MAX_CLIP_MS = 15_000`.

`src/main/core/composition/clip.test.ts`: the first shot starts at zero, a
later shot starts after the durations before it, the clip's duration is their
sum.

`src/main/core/prompting/target.ts`

- `interface ClipProse { shots: { shotId: number; prose: string }[]; soundscape: string; music: string }`.
- `type TargetFields = Record<string, string>`.
- `interface PromptTarget { id: string; name: string; vocabularies: Vocabularies; render(fields: TargetFields): string; brief: BriefStrategy; prose: ProseStrategy }`.
- `interface BriefStrategy { systemPrompt: string; schema: Record<string, unknown>; userMessage(note: string): string; readFields(content: string): TargetFields }`.
- `interface ProseStrategy { systemPrompt: string; schema: Record<string, unknown>; instruction(composition: ClipComposition, scope: ComposeScope): string; readProse(content: string, composition: ClipComposition): ClipProse; assemble(composition: ClipComposition, prose: ClipProse): TargetFields }`.
- `interface Vocabularies { cameraMotions: readonly string[]; amplitudes; speeds; transitions; styles; lightings }`.
- `type ComposeScope = { kind: "all" } | { kind: "shot"; shotId: number; previous: ClipProse }`.

`readFields` and `readProse` throw `PromptServiceError` with code
`bad-response`, so every way of reading a model answer fails the same way.

No test of its own: it is types.

## Step 2: the H3 target

`src/main/core/prompting/targets/minimax-h3.ts` absorbs what milestone 2 put
there and grows the prose strategy. The brief strategy is milestone 2's
system prompt, schema and user message, moved behind the interface.

- `H3_VOCABULARIES`: the twenty camera motions, the two amplitudes, the two
  speeds, the five transition phrases, the seven styles from the guide, and a
  short lighting list written here rather than taken from the guide.
- `prose.instruction(composition, scope)`: the clip's style and note, then
  every speaker as `(S1) <description>`, then one block per shot giving its
  number, its duration, its transition phrase, its camera motion with
  amplitude and speed, its lighting, the name and description of every thing
  it shows, what happens, its sound note, and each dialogue line as the exact
  string to reproduce. When the scope is one shot it names that shot as the
  only one to write and gives the prose already written for the others.
- `prose.schema`: an object with `shots`, an array of `{ shot: number, prose:
  string }`, plus `overall_soundscape` and `non_diegetic_music`.
- `prose.readProse`: parses, checks there is one entry per shot asked for and
  that every dialogue line of those shots appears verbatim, and throws
  `bad-response` otherwise.
- `prose.assemble`: builds the three fields as under "The H3 mapping".
- `prose.systemPrompt`: shorter than the brief one. It says the shots, the
  camera moves, the cuts and the timings are already decided, that the writer
  supplies only the prose of each shot, that shot markers and timestamps must
  not be written, that the named camera motion must appear inside the action
  sentence, that dialogue is reproduced exactly, and that a subject described
  in one shot keeps that description in the next.

`targets/index.ts`: `TARGETS` keyed by id, `targetById(id): PromptTarget`
throwing on an unknown id, `DEFAULT_TARGET_ID = "minimax-h3"`.

`targets/minimax-h3.test.ts` grows: the instruction names every shot and
carries the dialogue verbatim, assemble puts the style on shot 1 only, later
shots start with their number and cut time, the cut time is the sum of the
durations before it, readProse rejects an answer missing a shot, readProse
rejects an answer that drops a dialogue line.

## Step 3: composers

`src/main/core/prompting/composers/composer.ts`

- `interface ComposeInput { composition: ClipComposition; target: PromptTarget; client: LlamaServerClient; scope: ComposeScope }`.
- `interface ComposedPrompt { fields: TargetFields; rendered: string; model: string | null; prose: ClipProse | null }`.
- `interface PromptComposer { id: string; name: string; compose(input: ComposeInput): Promise<ComposedPrompt> }`.

`composers/prose.ts`: one chat call with the target's prose system prompt,
instruction and schema, then `readProse` and `assemble`. Returns the prose so
a later single-shot regeneration has something to keep.

`composers/assembled.ts`: no client call. Builds a `ClipProse` from the
structure alone, one sentence per shot naming the camera move, the things and
what happens, then `assemble`. `model` is null.

`composers/brief.ts`: milestone 2's path behind the interface, using the
clip's note. `generate.ts` folds into this file and its test moves with it.

`composers/index.ts`: `COMPOSERS` keyed by id, `composerById(id)` throwing on
an unknown id, `DEFAULT_COMPOSER_ID = "prose"`.

`composers/prose.test.ts` with a fake client: sends the instruction and the
schema, returns assembled fields and the model name, rejects an answer
missing a shot, and with a shot scope asks for that shot alone while keeping
the prose already written for the others.
`composers/assembled.test.ts`: produces the three fields from a composition
without touching the client.
`composers/brief.test.ts`: milestone 2's tests, moved.

## Step 4: stores

`src/main/core/composition/asset-store.ts`,
`src/main/core/composition/clip-store.ts`.

- Assets: `listAssets`, `insertAsset`, `updateAsset`, `deleteAsset`. Deleting
  one that a shot uses throws `CompositionError` with code `"in-use"`,
  naming the clips.
- Clips: `listClips`, `insertClip`, `updateClip`, `deleteClip`,
  `readComposition(db, clipId): ClipComposition` joining speakers, shots,
  their things and their dialogue in position order.
- Shots: `insertShot`, `updateShot`, `deleteShot`, `moveShot(db, shotId,
  toPosition)`, `setShotThings`, `setShotDialogue`. Positions are
  renumbered from zero after every change, so nothing else has to defend
  against gaps.
- Speakers: `insertSpeaker`, `updateSpeaker`, `deleteSpeaker`.
- `errors.ts`: `class CompositionError extends Error` with a `code` field of
  type `"not-found" | "in-use"`.

`asset-store.test.ts` and `clip-store.test.ts` against a temp database:
reading a composition gives shots in order with their things and dialogue,
moving a shot renumbers the rest, deleting a clip takes its shots and
dialogue with it, deleting an asset in use throws `in-use`, deleting an
unused one works.

`generation-store.ts` grows `composer`, `clipId` and `composition` on the
record, `listGenerations(db, clipId)` filtering to one clip, and a nullable
`model`.

## Step 5: routers

`src/main/trpc/routers/assets.ts`, mounted as `assets`:

| Procedure | Kind     | Input                           | Output    |
| --------- | -------- | ------------------------------- | --------- |
| `list`    | query    | none                            | `Asset[]` |
| `create`  | mutation | `{ kind, name, description }`   | `Asset`   |
| `update`  | mutation | `{ id, name, description }`     | `Asset`   |
| `remove`  | mutation | `{ id }`                        | `void`    |

`src/main/trpc/routers/clips.ts`, mounted as `clips`:

| Procedure     | Kind     | Input                                   | Output            |
| ------------- | -------- | --------------------------------------- | ----------------- |
| `list`        | query    | none                                    | `ClipSummary[]`   |
| `create`      | mutation | `{ name }`                              | `ClipSummary`     |
| `update`      | mutation | `{ id, name, style, note, musicNote }`  | `ClipSummary`     |
| `remove`      | mutation | `{ id }`                                | `void`            |
| `composition` | query    | `{ clipId }`                            | `ClipComposition` |
| `addShot`     | mutation | `{ clipId }`                            | `ClipComposition` |
| `updateShot`  | mutation | the shot's fields                       | `ClipComposition` |
| `moveShot`    | mutation | `{ shotId, toPosition }`                | `ClipComposition` |
| `removeShot`  | mutation | `{ shotId }`                            | `ClipComposition` |
| `addSpeaker`, `updateSpeaker`, `removeSpeaker` | mutation | speaker fields | `ClipComposition` |

Every mutation returns the whole composition, so the renderer holds one query
and never stitches partial updates together.

`prompts.ts` changes: `generate` takes `{ clipId, composerId }`, reads the
composition, picks the target from the clip and the composer from the id,
composes, and stores the record with the composition and the composer id.
`regenerateShot` takes `{ generationId, shotId }`, reads the stored
composition and prose, composes with a shot scope, and stores a new record.
`list` takes `{ clipId }`.

`assets.test.ts`, `clips.test.ts` and the grown `prompts.test.ts` through
`appRouter.createCaller`: a clip is created and its composition read back, a
shot is added and moved, generate stores the composition and the composer id,
generate with the assembled composer stores a row with no model, regenerating
one shot keeps the other shots' prose, an in-use asset refuses to be deleted
with `CONFLICT`.

## Step 6: renderer, the library

Design system: add `select`, `tabs` and `textarea` if missing, with the
shadcn CLI, and export them from the index.

`src/renderer/src/features/assets/`:

- `asset-form.tsx`: kind, name and description, presentational, calling
  `onSubmit`.
- `asset-list.tsx`: the library grouped by kind, each row with Edit and
  Delete.
- `use-assets.ts`: the queries and mutations, invalidating
  `trpc.assets.pathKey()`.

`asset-form.test.tsx` and `asset-list.test.tsx` with props: the form reports
what was typed, the list shows every asset under its kind and reports which
was deleted.

`src/renderer/src/routes/project.library.tsx` holds the list and the form.

## Step 7: renderer, the clip editor

`src/renderer/src/features/clips/`:

- `clip-list.tsx`: the project's clips with New clip.
- `shot-row.tsx`: one shot, with the duration, the camera motion, amplitude,
  speed, transition and lighting pickers, the things it shows, what happens,
  its dialogue lines, its sound note, and Regenerate, Move and Remove.
  Presentational, taking the shot, the vocabularies and the library.
- `clip-editor.tsx`: the clip's own fields, its speakers, its shots in order,
  the running total with a warning past fifteen seconds, the composer picker
  and Generate.
- `use-clip.ts` and `use-generate-prompt.ts`: the composition query and the
  mutations, invalidating the composition and the history.

`shot-row.test.tsx` and `clip-editor.test.tsx` with props: a shot reports
every field it changes, the first shot offers no transition, the total is the
sum of the durations, the warning appears only past fifteen seconds, Generate
reports the composer that was picked.

`src/renderer/src/routes/project.tsx` becomes the clips route: the clip list
beside the editor, with the generation history for the open clip under the
result, inside the same centred 1400px band. The tabs live in the header.

## Step 8: roadmap

In `docs/roadmap.md`: add milestone 3 to "Done" as one line, renumber what is
left, and cut from the storyboard milestone what this one already does. Add
open items found on the way. Three are known now:

- Nothing checks that the prose the model returns actually contains the
  camera motion it was given.
- A clip has one style for every shot, so a clip cannot change style at a cut.
- Dialogue language is a free string per line rather than a picklist.

## Verification

`pnpm check` after every step. Name the covering test in each commit body
when a step adds behaviour. The six behaviours of milestone 2 and the eleven
above need a pass in `pnpm dev` with llama-server running, which waits for
the machine's owner; say at handover which parts have only test cover.
