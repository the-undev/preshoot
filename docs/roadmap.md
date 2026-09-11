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

## Milestones

2. Asset library: people, places, objects, plus picklists for camera
   angle, movement, transition, lighting and style. Reference images and
   RefMod files attached to assets. Description drafted from images by the
   local vision model.
3. Storyboard editor: ordered shots referencing assets and picklists, with
   duration, dialogue and sound notes. Split into clips under 15 seconds,
   chained by last frame to first frame.
4. Prompt generation per clip per target model using the official prompt
   guides as templates. Edit, regenerate, version every prompt.
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
- Dark theme default. The shadcn CSS supports it through the `dark` class.
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
- Whether the New Project picker can create a folder on Linux. Electron
  documents `createDirectory` as a macOS property; the GTK folder chooser
  may offer it regardless.
- Only one project is open at a time, for the app rather than per window. A
  second window would need a session per window.
- Testing Library cleanup is registered by hand in the renderer test setup
  because Vitest globals are off. Turning globals on would remove it.
