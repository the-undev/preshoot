# preshoot

A desktop app for building storyboards and turning them into prompts for
video generation models. It writes prompts for MiniMax H3. Generation runs
elsewhere: the app owns the project, its assets, the shot list, the prompts,
and the history of what was written.

A project is a folder you choose, like a video editor. It holds a marker
file, a SQLite database, and subfolders for assets and outputs.

## Status

Early. The schema still changes without a migration path, so a project made
by one build may not open in the next. Only the H3 text and keyframe forms
are implemented, and nothing is submitted anywhere: prompts are copied out
by hand.

## What you need

- Node and pnpm. Developed against Node 26 and pnpm 11.
- A [llama-server](https://github.com/ggml-org/llama.cpp) answering on a URL
  you can reach, serving at least one model. The app attaches to a server,
  it never starts or stops one. `docs/llama-server.md` covers router mode,
  which is what it expects.

## Running

```bash
pnpm install
pnpm dev
```

Open Settings with the gear in the workspace header, press Check, choose a
model, and press Save. Generate refuses until a model is chosen, because a
request that names none is refused by the server.

## Building

`pnpm build:linux` produces an AppImage. `pnpm check` runs lint, format
check, typecheck and tests.

## Documentation

- `docs/roadmap.md` purpose, decisions and what comes next.
- `docs/issues.md` known bugs and limitations.
- `docs/h3-mapping.md` what H3 accepts, and what the app holds to produce it.
- `docs/minimax-h3.md` links to MiniMax's own guides.
- `CLAUDE.md` the layout and the rules the code follows.

## Licence

MIT, in `LICENSE`.

MiniMax H3's documentation is not copied into this repository. Its licence
restricts both the territory it may be distributed in and the terms it may
carry, so `docs/minimax-h3.md` links to it instead.
