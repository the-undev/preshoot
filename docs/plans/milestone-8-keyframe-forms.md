# Milestone 8: the keyframe forms

A clip says which form it is written for, and the keyframe forms carry the
pictures they anchor to. The mapping behind this is `docs/h3-mapping.md`;
the guides themselves are in `docs/minimax-h3/`.

Full reference is not in this milestone. It is a second target with six
fields rather than three, and it needs audio, subject labels and retention
markers that do not exist yet. This one closes the gaps the shared model has
either way, and lands the three forms that need nothing new but a picture.

Read `CLAUDE.md`, `docs/roadmap.md`, `docs/issues.md` and `docs/h3-mapping.md`
first. Work on the branch `feature/prompt-generation`. One commit per step,
`pnpm check` green before each, no attribution trailers. Hand the branch over
at the end; do not push or merge.

## Behaviour

1. A clip is written for one of four forms: text to video, image to video,
   first and last frame, or last frame. Text to video is what a new clip
   starts as.
2. A form that needs a picture asks for one, chosen from the library's
   pictures, and says so until it has one. First and last frame asks for two.
3. The prompt opens with the alignment line the guide gives for that form,
   word for word, with the clip's duration to two decimal places and the
   final shot's number. Text to video carries no line.
4. Export writes the chosen pictures beside the prompt, since the prompt
   names pictures the model has to be given.
5. A line of dialogue can be spoken by more than one speaker at once, and
   comes out as `(S1,S2)`.
6. A line can be marked as off-screen, as carrying across the cut that
   follows it, or as cut off by the end of the clip, and comes out with the
   voiceover phrasing, `<scenetrans>` or `<cutoff>` accordingly.
7. Cross-dissolve, fade and wipe can be chosen as transitions.
8. The editor says how long the written body is, and says when it is short
   of the 350 words a generation body wants.

## Step 1: what a line of dialogue can say

`dialogue_lines` gains `speakerIds` as json rather than one `speakerId`,
`offScreen`, `crossesCut` and `cutOff`, all boolean. The composition's
`DialogueComposition` follows. Existing rows keep their single speaker.

`targets/minimax-h3.ts` writes what the guide asks for: `(S1,S2)` for a line
with several speakers, `says in an off-screen voiceover` followed by the
lips-closed sentence, `<scenetrans>` on both sides of a cut a line crosses,
and `<cutoff>` on a line the clip ends over. The three extra transitions join
the vocabulary.

`minimax-h3.test.ts` and `clip-store.test.ts` grow a case each.

## Step 2: a clip has a form

`clips` gains `form`, defaulting to `t2v`. `ClipComposition` carries it.

`clip_frames` binds a picture to a clip:

```ts
export const clipFrames = sqliteTable("clip_frames", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clipId: integer("clip_id")
    .notNull()
    .references(() => clips.id, { onDelete: "cascade" }),
  imageId: integer("image_id")
    .notNull()
    .references(() => assetImages.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
})
```

`role` is `first` or `last`. A clip holds at most one of each.

`clip-store.ts` gains `setClipFrame(db, { clipId, role, imageId })` and
`clearClipFrame(db, { clipId, role })`, and `readComposition` returns the
frames with their pictures.

## Step 3: the alignment line

`target.ts`: `ProseStrategy.assemble` already returns the fields. The line
goes in front of them, so `PromptTarget` gains
`instructionLine(composition): string`, empty for text to video, and
`render` puts it above the fields with one blank line between.

`targets/minimax-h3.ts` writes the four forms exactly as
`docs/h3-mapping.md` records them, including the FL2VA line's missing angle
brackets, which is how the guide publishes it.

A form whose pictures are missing throws `CompositionError`
`nothing-to-write`, naming what it wants.

`minimax-h3.test.ts`: each form's line, the duration to two decimal places,
the final shot's number, and a refusal when a picture is missing.

## Step 4: the routers

`clips.update` takes the form. `clips.setFrame` and `clips.clearFrame` bind
and unbind a picture. `prompts.exportToProject` and `exportToFile` copy the
clip's frame pictures beside the prompt and name them in the json.

`clips.test.ts` and `prompts.test.ts` grow.

## Step 5: the editor

The clip editor gains a form picker and, for the forms that need them, the
first and last frame pictures chosen from the library, each shown as a
thumbnail with the thing it came from. It says what is missing rather than
letting Generate fail.

The shot's dialogue rows gain the speaker multi-select and the three flags.

`clip-editor.test.tsx` and `shot-dialogue.test.tsx` grow.

## Step 6: how long the body is

The result panel says the word count of `integrated_multimodal_description`
and says when it is under 350, which is what the guide asks of a generation
body.

`prompt-result.test.tsx` grows.

## Step 7: roadmap and issues

Add milestone 8 to "Done", renumber, and close what this settles in
`docs/issues.md`. Record full reference as the milestone after it.

## Verification

`pnpm check` after every step, `pnpm build` before handover, and one real
generation of each form against llama-server, pasted at handover. The
pictures cannot be checked against H3 itself from here; what is verified is
that the prompt carries the line the guide asks for.
