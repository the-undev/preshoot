# What H3 accepts, and what the app must hold to produce it

Worked backwards from the H3 prompt guides, which `docs/minimax-h3.md`
links: every feature they describe, and the input the app needs before it
can write it. Read before planning anything that touches the H3 prompt.

RefMod is out of scope and not covered here.

## The five forms

| Form           | What it takes                            | Opening line the prompt must carry                                                                                                                                                                                     |
| -------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T2VA           | Text only                                | None. The prompt begins with the three fields.                                                                                                                                                                         |
| I2VA           | One picture, the first frame             | `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.`                                                                                                        |
| FL2VA          | Two pictures, first and last frame       | `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.` |
| L2VA           | One picture, the last frame              | `How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the S.SS-second mark of the target video.`                                                                           |
| Full reference | Pictures, video and audio, each labelled | No opening line. Six sections instead of three.                                                                                                                                                                        |

`S.SS` is the clip's duration to exactly two decimal places, and `N` is the
index of the final shot. The instruction is the first line, then one blank
line, then the fields.

The guide writes the FL2VA line without angle brackets and the L2VA line
with them. That is how it is published, so that is what the app writes.

So the app needs one new input for the keyframe forms: the clip's form, and
one or two pictures bound to its first and last frames. Everything else it
already holds.

## The three core fields

The app writes these today and the guide agrees with what it produces:
`integrated_multimodal_description`, `overall_soundscape`,
`non_diegetic_music`, with the style opening `[Shot 1]`, no timestamp on the
first shot, and strictly increasing cut times after it.

Full reference renames the main field to `detailed_description`, moves the
style to one or two sentences before `[Shot 1]`, and adds three sections in
front of it. That is a different shape of answer, not a variation on this
one.

## Feature by feature

| What the guide allows                               | What the app needs                                         | Where it stands                                       |
| --------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| Style opening shot 1                                | A clip style                                               | Have it                                               |
| Shot numbers and cut times                          | Shot order and durations                                   | Have it                                               |
| Camera motion, amplitude, speed                     | The vocabularies                                           | Have it, and the router refuses anything outside them |
| Cuts: the five phrases                              | The transition vocabulary                                  | Have it                                               |
| Cross-dissolve, fade, wipe when asked for           | Three more transitions, allowed but not offered by default | Missing                                               |
| Speaker IDs `(S1)`                                  | Speakers on a clip                                         | Have it                                               |
| Compound IDs `(S1,S2)` for people speaking together | A line that can name more than one speaker                 | Missing: a line has exactly one                       |
| `<d>[Language] ...</d>`, verbatim                   | Dialogue lines with a language                             | Have it                                               |
| Voiceover, plus the lips-closed sentence            | A flag on a line saying it is off-screen                   | Missing                                               |
| `<scenetrans>` for a line crossing a cut            | A flag on a line saying it continues into the next shot    | Missing                                               |
| `<cutoff>` for speech the video ends over           | A flag on a line saying it is cut off                      | Missing                                               |
| `[unclear]` for unintelligible reference audio      | Nothing, it is typed                                       | Have it                                               |
| On-screen text in double quotes                     | Nothing, it is typed into what happens                     | Have it                                               |
| 350 to 500 words for a generation body              | A count, and something that says when it is short          | Missing                                               |

## Full reference mode

Four label kinds, assigned once and used the same way in every section:
`<Subject N>` for reusable visible content, `<Picture N>`, `<Video N>` and
`<Audio N>` for the assets themselves.

| What the guide allows                                        | What the app needs                                                                                                                                                                                                        | Where it stands                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `<Subject N>` defined from one or more assets                | A library thing, and which of its pictures define it                                                                                                                                                                      | Have the thing and its pictures; nothing says which picture defines what |
| `<Picture N>`                                                | Pictures on a library thing                                                                                                                                                                                               | Have it                                                                  |
| `<Audio N>`                                                  | Audio files, on a library thing for a voice and on a clip for music or ambience                                                                                                                                           | Missing entirely                                                         |
| `<Video N>`, for editing or continuing a source video        | A video input                                                                                                                                                                                                             | Out of scope: the app generates rather than edits                        |
| `<Subject 2> (S1)` when a referenced subject speaks          | A speaker that points at a library thing                                                                                                                                                                                  | Missing: speakers and library things are unconnected                     |
| `subject_definitions`, one line per label                    | The above, written by the model from it                                                                                                                                                                                   | Follows once the inputs exist                                            |
| `summary` with a task-type prefix                            | The task types, some derivable from what is attached                                                                                                                                                                      | Derivable, except which of reuse or reference an audio asset is          |
| `retention_analysis`, one line per label with a fixed marker | A marker per asset, chosen by the user: `fully_preserved`, `partially_preserved`, `attribute_transfer`, `weak_reference` for visible content, and `fully_copy`, `partially_copy`, `reference`, `weak_reference` for audio | Missing. This is intent, not something the model should invent           |

## What a generation request actually takes

From the request scripts in the model repo, vendored beside the guides. The
prompt is one field of several, and the rest is not in the app at all.

```json
{
  "task": "t2va | i2va | fl2va | l2va | ref2va",
  "prompt": "<the instruction line, a blank line, then the three fields>",
  "conditions": [
    { "type": "image", "uri": "...", "role": "keyframe", "frame_index": 0 },
    { "type": "audio", "uri": "...", "role": "reference" },
    { "type": "video", "uri": "...", "role": "reference" }
  ],
  "target": { "short_edge": 768, "aspect_ratio": "auto", "duration_seconds": 8 },
  "seed": 0
}
```

| Field                         | Where it comes from                                                                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `task`                        | The clip's form. Have it.                                                                                                                     |
| `prompt`                      | What the app writes. Have it, and it is the right shape.                                                                                      |
| `conditions[].type` and `uri` | A picture or audio file. Have pictures; audio is missing.                                                                                     |
| `conditions[].role`           | `keyframe` for the image forms, `reference` for full reference. Derivable from the form.                                                      |
| `conditions[].frame_index`    | Which frame a keyframe lands on. Derivable for the first frame; the last frame needs the frame count, which needs a frame rate nothing holds. |
| `target.duration_seconds`     | The clip's duration. Have it, and never show it.                                                                                              |
| `target.short_edge`           | Missing. A resolution nothing in the app decides.                                                                                             |
| `target.aspect_ratio`         | Missing.                                                                                                                                      |
| `seed`                        | Missing.                                                                                                                                      |

So a finished prompt is not enough to generate from. The app holds most of
the rest and shows none of it.

## What this means for the work

1. The keyframe forms are small. A clip gains a form and one or two frame
   pictures, and the target writes one more line. Everything else is there.
2. Full reference is a second target, not a mode of the first. Six fields
   against three means a different schema, a different render and a different
   system prompt, which is what the target seam is for.
3. Three gaps have to be closed in the shared model whichever comes first: a
   dialogue line that can name several speakers and carry its off-screen,
   crossing and cut-off flags; audio as a kind of reference asset; and a
   speaker that can point at a library thing.
4. The retention markers are inputs, not outputs. A person decides whether a
   subject is fully preserved or only loosely referenced, and the model is
   told which.
