# Roadmap

What preshoot is for, what has been decided, and what comes next. Design
discussion and rejected options live here, not in code comments.

## Purpose

A desktop app for building storyboards and turning them into prompts for
video and image generation models. Generation runs elsewhere (a Runpod pod
running ComfyUI, or a local ComfyUI for small jobs). The app owns the
project, its assets, the shot list, the prompts, and the review of what
comes back.

Targets: MiniMax H3 (text to video, reference to video, first and last
frame), Qwen Image, Qwen Image Edit. New targets are prompt templates
plus a settings schema, not new code paths.

## Machine

RTX 3070 Ti with 8GB VRAM, 31GB RAM. The local LLM for prompt writing is
Qwen3.5-9B at Q4_K_M (5.68GB) with its vision projector (0.92GB), served by
llama-server. H3 itself does not run locally. Qwen Image runs locally only
at Q2 or Q3 with the Lightning LoRA.

## Decisions

- Electron with electron-vite, React, TypeScript, pnpm.
- Tailwind v4 and shadcn/ui. shadcn output lives in
  `src/renderer/src/design-system/ui` and is never edited. App code imports
  from the design-system index, which wraps or re-exports.
- TanStack Router (file-based, hash history) and TanStack Query.
- tRPC v11 between renderer and main, served over a custom `trpc://` scheme
  through Electron's `protocol.handle` and the tRPC fetch adapter.
  electron-trpc was the first choice but has no tRPC v11 release.
- A project is a folder chosen by the user, like a video editor. It holds a
  marker file, a SQLite database (better-sqlite3 with Drizzle), and
  subfolders for assets, outputs and exports. App settings and the recent
  projects list live under `~/.config/preshoot`.
- New Project takes the chosen folder as the project, or as the parent of a
  folder named after the project when asked. A folder that already holds
  something else is refused until the user confirms, so a folder of footage
  can still become a project.
- The app is dark only. The `dark` class is fixed on `<html>` and
  `nativeTheme.themeSource` is dark, so native dialogs match. The light
  tokens stay in the stylesheet, so a theme switch is the class and that
  setting.
- Domain code lives in `src/main/core` and never imports Electron. A lint
  rule enforces it. Tests run under Vitest with a `main` project (Node) and a
  `renderer` project (jsdom).
- Local services (llama-server, ComfyUI) are attached by URL. The app starts
  and stops nothing: llama-server's router mode already hosts every model it
  can find from one process, loads one on demand when a request names it, and
  frees it again on `POST /models/unload`. So the app names its model, shows
  what is loaded, and can hand the card back. Start it once with
  `llama-server --models-dir <dir> --models-max 1 --mmproj-device none`.
- System prompts are data, not constants. Each target ships with one per way
  of writing, a project can hold its own, and every generation keeps the
  prompt it used and that prompt's text, so editing a prompt does not rewrite
  what earlier ones were made with.
- A target owns one model's vocabularies, system prompts and formatting; a
  composer owns how the model is asked. Both are looked up by id, so another
  target or another way of writing a prompt is one file and one line in an
  index. Every stored generation records which composer wrote it and the
  composition it was given, so two ways can be compared on the same clip.
- The app writes the mechanical parts of a prompt itself: shot markers, cut
  times, transition phrases and the dialogue tags. The model writes only the
  prose, in one request per clip so a look or a voice carries across a cut.
- The workspace is a centred band no wider than 1400px, on the ultrawide as
  everywhere else.
- Reference pictures are copied into the project rather than referenced where
  they sit, so a project stays a folder that can be moved, and the renderer
  reads them through an `asset://` scheme that serves only the open project.
- The model's own guides are vendored under `docs/minimax-h3/` and
  `docs/h3-mapping.md` maps what they allow back to the inputs the app holds.
  Prompt work is checked against them rather than against memory of them.
- Describing a picture is not writing a prompt for a particular model, so it
  sits beside the targets rather than inside one, and goes through a client
  call of its own: a vision answer is prose, not JSON.
- Editing a prompt is not a composer. A composer turns a clip into a prompt;
  editing turns a prompt into another prompt, and widening that interface
  would make every composer accept an input it cannot use. An edit is stored
  as an ordinary generation carrying what it came from, so it can be copied,
  judged, compared and edited again with no special cases.
- An exported prompt is a text file holding the prompt and nothing else, so
  it pastes straight into the model's own form, with the clip, the way, the
  variant, the model and any edit instruction in a json beside it.
- A prompt is one field of a generation request, and the app holds the rest:
  the task, the duration, the shape, the short edge, the seed and the
  pictures. They are shown as fields to copy rather than sent anywhere,
  because nothing the app can reach accepts them. The adaptor that would
  turn them into a request belongs with the Runpod or ComfyUI work, built
  against a real endpoint rather than guessed at from a sample.
- Runpod: manual copy of prompts first. Then rsync of the project bundle
  over SSH plus ComfyUI HTTP for queueing jobs and pulling outputs. Then
  pod start and stop through the Runpod API.

## Done

1. Welcome screen, project create and open, recent projects, and an empty
   project workspace.
2. Prompt generation: a brief becomes a MiniMax H3 text-to-video prompt
   through llama-server, kept in the project and listed in the workspace.
3. Shot composition: a text library of people, places and objects, clips
   built from shots with camera moves, cuts, timings and dialogue, and
   three ways of turning one into a prompt.
4. Models and iteration: the model is named per request and chosen from
   what the server offers, system prompts are editable data, and one clip
   can be written several ways at once and the results judged side by side.
5. Editing and export: a finished prompt is rewritten from a change asked
   for in words, edits chain under what they came from, and a prompt can be
   written into the project or saved where the user chooses.
6. Closing the loop: comparison runs are kept and read back, a run that
   fails part way says where it stopped, a verdict and a note are written
   apart, and nothing is deleted without asking.
7. Asset images: reference pictures copied into the project and shown in the
   library, with a description drafted from them by the local vision model.
8. The keyframe forms: a clip says which form it is written for, the image
   forms anchor to pictures from the library, and the prompt opens with the
   line the guide gives for that form.
9. The complete output: a clip holds the shape, the short edge and the seed
   it is generated at, and a result shows every field a generation needs,
   each copyable on its own.

## Milestones

10. Full reference mode: pictures and audio labelled as `<Picture N>` and
    `<Audio N>`, subjects built from them, retention markers chosen rather
    than invented, and a second target whose answer is six sections rather
    than three. `docs/h3-mapping.md` says what is missing before it can be
    built.
11. Storyboard editor: clips in order across a film, chained by last frame
    to first frame, with prompts versioned per clip.
12. Runpod link: connect to a pod, pull outputs into the project, show each
    take next to its shot, mark good or bad with notes, export chosen takes.
13. ComfyUI templates: API-format workflow JSON per target with named slots,
    filled and submitted by the app.
14. Local ComfyUI management: model downloads, start and stop, RefMod
    creation if the H3 VAE fits in 8GB with offload (TBD).

## Open questions

Unanswered, and each one decides a later milestone. Bugs, limitations and
improvements live in `docs/issues.md`.

- Whether Qwen Image at Q4 is usable with RAM offload on this machine.
- Whether RefMod creation fits on 8GB. Import RefMods regardless.
