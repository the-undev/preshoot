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
- Local services (llama-server, ComfyUI) are attached by URL first. Managed
  mode, where the app starts them and downloads models, comes per service
  later, llama-server first.
- Runpod: manual copy of prompts first. Then rsync of the project bundle
  over SSH plus ComfyUI HTTP for queueing jobs and pulling outputs. Then
  pod start and stop through the Runpod API.

## Done

1. Welcome screen, project create and open, recent projects, and an empty
   project workspace.
2. Prompt generation: a brief becomes a MiniMax H3 text-to-video prompt
   through llama-server, kept in the project and listed in the workspace.

## Milestones

3. Asset library: people, places, objects, plus picklists for camera
   angle, movement, transition, lighting and style. Reference images and
   RefMod files attached to assets. Description drafted from images by the
   local vision model.
4. Storyboard editor: ordered shots referencing assets and picklists, with
   duration, dialogue and sound notes. Split into clips under 15 seconds,
   chained by last frame to first frame. Prompts generated per clip per
   target model, edited, regenerated and versioned.
5. Runpod link: connect to a pod, pull outputs into the project, show each
   take next to its shot, mark good or bad with notes, export chosen takes.
6. ComfyUI templates: API-format workflow JSON per target with named slots,
   filled and submitted by the app.
7. Local ComfyUI management: model downloads, start and stop, RefMod
   creation if the H3 VAE fits in 8GB with offload (TBD).

## Open items

- Whether Qwen Image at Q4 is usable with RAM offload on this machine.
- Whether RefMod creation fits on 8GB. Import RefMods regardless.
- Image editing (Qwen Image Edit) as a shot type that edits a library image.
- `app.getVersion()` reports the Electron version when run from `out/`
  unpackaged; correct once packaged.
- TypeScript 7, Vite 8 and ESLint 10 are out. The template pins TS 5.9,
  Vite 7 and ESLint 9; upgrade when electron-vite and the toolkit configs
  support them.
- The Electron postinstall silently skipped extracting the binary in this
  environment; the zip was cached and extracted by hand. Check whether a
  clean `pnpm install` on this machine reproduces it.
- The recent projects list drops an entry whose folder is missing when the
  list is read, so a project on an unmounted drive is forgotten rather than
  hidden.
- Only one project is open at a time, for the app rather than per window. A
  second window would need a session per window.
- Testing Library cleanup is registered by hand in the renderer test setup
  because Vitest globals are off. Turning globals on would remove it.
- Streaming tokens to the renderer needs a subscription link over the
  `trpc://` scheme.
- The reference image forms of the H3 prompt (I2VA, FL2VA, L2VA) need the
  alignment line and arrive with the asset library.
- A generation that runs past the two minute timeout is reported as a
  server that could not be reached, which is not what happened.
- Nothing records which system prompt wrote a stored generation, so
  prompts from before a change cannot be told from prompts after it.
