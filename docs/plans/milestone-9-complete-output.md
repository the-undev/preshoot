# Milestone 9: the complete output

A prompt is one field of a generation request. The app holds most of the
rest and shows none of it, so what leaves the app cannot be acted on without
remembering what it was meant to be generated at.

This makes a result show every field a generation needs, as something that
can be copied one field at a time into whatever runs the model, and gives a
clip the settings the model takes that nothing in the app decides.

The request shape is recorded in `docs/h3-mapping.md`, taken from the
scripts vendored in `docs/minimax-h3/`. Nothing here submits anything: there
is no endpoint to submit to yet, and the adaptor that would build one
belongs with the Runpod work.

Read `CLAUDE.md`, `docs/roadmap.md`, `docs/issues.md` and
`docs/h3-mapping.md` first. Work on the branch `feature/prompt-generation`.
One commit per step, `pnpm check` green before each, no attribution
trailers.

## Behaviour

1. The picker that chooses between text to video, image to video, first and
   last frame and last frame says that is what it is, and names each with
   the code the model uses, such as `i2va`.
2. A clip holds the size it is meant to be generated at: a shape chosen from
   a list, a short edge, and a seed.
3. The result shows every field of a generation: the type, the prompt, the
   duration, the shape, the short edge, the seed, and every picture with
   what it is for.
4. Each field copies on its own, and the whole thing copies as one block.
5. Export writes the same fields beside the prompt.

## Step 1: the clip says how it should be generated

`clips` gains `shortEdge` (integer, default 768), `aspectRatio` (text,
default `auto`) and `seed` (integer, default 0). `ClipSummary` and
`ClipComposition` carry them, and `clips.update` takes them.

`src/main/core/composition/aspect.ts`: `ASPECT_RATIOS`, each with the value
the model takes and the name a person reads, being `auto`, `16:9`, `9:16`,
`1:1`, `4:3`, `3:4` and `21:9`. The router accepts nothing else.

## Step 2: what a generation needs

`src/main/core/composition/request.ts`

- `interface GenerationCondition { type: "image"; uri: string; role: "keyframe"; at: string }`,
  where `at` says which end of the clip it anchors, since the frame index
  the model takes needs a frame rate nothing holds.
- `interface GenerationRequest { task: string; prompt: string; durationSeconds: number; shortEdge: number; aspectRatio: string; seed: number; conditions: GenerationCondition[] }`.
- `buildRequest(composition, rendered): GenerationRequest`, with `task`
  taken from the form as the model names it: `t2va`, `i2va`, `fl2va`,
  `l2va`.

`request.test.ts`: the task follows the form, the duration is the sum of the
shots in seconds, a keyframe form carries one condition per picture with
which end it anchors, text to video carries none.

## Step 3: it is stored with the result

`generations` gains `request` (json, null for what was written before it).
`prompts.generate`, `compare` and `edit` store it. Export writes it into the
json beside the prompt.

## Step 4: the result shows it

`src/renderer/src/features/prompts/generation-fields.tsx`, presentational: a
row per field, each with what it is, its value, and a button that copies
that value. A button at the top copies every field as one block.

`generation-fields.test.tsx`: every field is shown, copying a field asks for
that value alone, copying everything asks for a block holding all of them.

## Step 5: roadmap and issues

Add milestone 9 to "Done", renumber, and record what turned up. Full
reference mode moves behind it.

## Verification

`pnpm check` after every step, `pnpm build` before handover.
