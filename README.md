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

- Node 22.12, 24 or 26 and pnpm 11. `engines` in `package.json` carries the
  same range, which comes from the narrowest the toolchain declares.
- A [llama-server](https://github.com/ggml-org/llama.cpp) answering on a URL
  you can reach, serving at least one model. The app attaches to a server,
  it never starts or stops one.

## Running

```bash
pnpm install
pnpm llama    # the model server, in its own terminal
pnpm dev      # the app
```

`pnpm llama` starts llama-server in router mode: every model under
`~/.cache/huggingface/hub`, one loaded at a time, the vision projector off the
GPU, listening on `http://127.0.0.1:8080`, which is where the app looks by
default. Arguments are passed through, so `pnpm llama --port 9000` moves it.
`docs/llama-server.md` says what each flag is for and how to reach a server
somewhere else.

Then open Settings with the gear in the workspace header, press Check, choose
a model, and press Save. Generate refuses until a model is chosen, because a
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
