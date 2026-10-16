# Roadmap

What preshoot is for, what has been decided, and what comes next. Design
discussion and rejected options live here, not in code comments.

## Purpose

A desktop app that is the user's side of video and image generation:
composition and dispatch over ComfyUI. The user curates a library of
characters, scenes, voices and prompts, composes clips, binds library pieces
into a workflow's inputs, queues runs, and reviews what comes back. ComfyUI
executes. Workflows are made and edited in ComfyUI, never here: the app fills
their inputs and queues them, and builds no graphs to do it.

ComfyUI is workflow-oriented and this app is user-oriented. Once a workflow
works, using it is picking pieces and pressing run, with experiments cheap to
queue and every run recorded with what went into it. ComfyUI's own app mode,
SwarmUI and ViewComfy were looked at and each stops at a form per workflow,
with no library behind the form and no record of what filled it.

Targets: MiniMax H3 (text to video, reference to video, first and last
frame), Qwen Image, Qwen Image Edit. A target owns prompt writing for one
model; new targets are prompt templates plus a settings schema, not new code
paths.

## Machine

RTX 5070 Ti with 16GB VRAM, 93GB RAM. ComfyUI runs through snug, which owns
installs, containers and model pools; the base workflows and notes on running
the models live in the gen-ai-docs vault. One user for now, though nothing is
designed around the machine or the single user. The local model is
Qwen3.5-9B with its vision projector, served by llama-server, and it
describes reference pictures. Nothing else in the app calls a model.

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
  what is loaded, and can hand the card back. Start it with `pnpm llama`.
- The app writes the whole prompt itself, from the clip and nothing else: the
  shot markers, the cut times, the transition phrases, the subjects, what
  happens, the camera moves and the dialogue tags. A model wrote the prose
  once and was taken out again. It produced a good prompt some of the time and
  a mess the rest, it borrowed the characters out of the examples in its own
  system prompt, and an edited prompt was a dead end because nothing carried
  it back to the clip. The builder is the product; a model may come back later
  to improve one field at a time, where its job is small enough to check.
- The prompt is written as a scene rather than as a list of fields: a subject
  is named every time and how it looks is set off by commas the first time it
  is named, because a description standing in for a name leaves the sentence
  with nothing doing the acting, and one written as `wearing a space suit`
  rather than as `a man in a space suit` reads as nonsense on its own. The
  camera
  and the light are sentences rather than labels, and a cut lands on what the
  next shot shows, or is written as a sentence of its own when the shot does
  not open on something to land on. The words of the main field are counted
  against what the guide asks for, because a prompt written from short lines
  comes out far shorter than the model wants.
- The prompt is a function of the clip rather than a thing to produce. It is
  read back after every change and shown beside the editor as it is typed, and
  nothing is stored, because the same clip always writes the same prompt.
- A target owns one model's vocabularies and how its fields are written,
  rendered and read back, and is looked up by id, so another target is one file
  and one line in an index.
- A feature that maps to text does not have to map back. The app offers pieces
  that make a prompt easier to write, and a prompt read back gives plain lines,
  not those pieces again. So a parse is judged on losing nothing, never on
  recovering the structure that wrote it, and no feature is shaped by what it
  would take to invert it.
- What the prompt says, the editor shows. A shot after the first was written
  as `the camera cuts to` whether or not anybody chose it, while the chip that
  sets it read as empty. A shot boundary is a cut, so a shot is given one when
  it is made, which is what lets it be seen and taken away like anything else.
  The prompt invents nothing that is not on the clip.
- The app holds no structure the target has no field for. What is heard was a
  note per shot, joined into the one soundscape field on the way out, which is
  a distinction the prompt cannot carry and nothing can hand back. The clip
  holds one soundscape, as the target does.
- A pasted prompt opens as a clip, and nothing in it is dropped. What the
  format marks is recognised and becomes structure: the fields, the shot
  markers, the cut times, the dialogue tags and their language, the speaker
  labels and the voices in front of them. Nothing is required. A prompt with no
  field labels is all description, one with no shot markers is one shot, and a
  sentence that matches no camera move or lighting stays the sentence it is. So
  a prompt written anywhere else opens as shots of plain lines to work on
  rather than being refused, which is what most pasted prompts will be.
- A clip has no name until it is saved. An unsaved clip is a scratch one that
  lives as long as its tab, so an idea can be tried without being titled and
  without leaving anything behind. Saving names it and puts it in the list an
  empty tab shows. Branching copies any clip into a new scratch clip in its
  own tab, which is how a version is tried without losing what it came from.
  A branch records the saved clip underneath it and nothing further, so there
  is a way back without a history to walk.
- The workspace holds tabs, kept in the project database so reopening a
  project lands where it was left. A tab holds a clip or the list of clips,
  and any tab can go back to the list. Naming, saving and branching sit in a
  bar under the tabs rather than in the editor, because they are about the
  clip as a document rather than about its contents, and a name is only ever
  typed into the dialog that saves or renames one.
- A clip carries a short edge and an aspect ratio, which is what the request
  takes. The controls are an orientation toggle, the ratios drawn in
  proportion, and a row of short edges, so the same controls read either as a
  resolution and an orientation or as a ratio and a short edge. There is no
  mode switch, because there is only one pair of numbers underneath. The
  `auto` ratio is gone: a clip that cannot say what it generates at cannot be
  reproduced. The seed is gone too; the request takes one, so whatever runs
  the generation picks it.
- The people, places and objects of a clip belong to that clip. One with no
  clip is saved in the library as a starting point, and using one copies it, so
  changing a clip's Anna changes nothing anywhere else and saving her is just
  another starting point. A saved shot and a saved clip work the same way, so
  there is one idea rather than three, and the same person dressed differently
  in two clips needs no feature of its own.
- A subject that speaks carries how it sounds beside how it looks, and (S1),
  (S2) follow the order they first speak in. There is no separate list of
  voices: a spoken line names subjects the way an action does.
- Undo is a stack of whole clips held for as long as the app runs. A clip is
  small and is written as it is typed, so putting one back is writing it again
  rather than reversing what was done to it.
- A field explains itself behind a question mark beside its label, never with
  an example inside it. An example in an empty field reads as something the
  clip already holds.
- A shot is nothing but its lines. What it shows, what happens in it and what
  is said in it are one ordered list, so the prompt reads in the order it was
  written. That is what the guide asks for: actions and reactions in order with
  the dialogue among them. A line shows what is on screen, says what someone
  does, or says what someone says. What is heard is not one of them: it goes
  into a field of its own, so the clip holds it rather than any shot. Only a spoken line has to name one of the
  cast: the other two name one when there is one to name and otherwise hold
  the words written on them, so a shot says what it opens on without first
  making a cast member of it. A cut lands on the line a shot opens on when
  that line shows something, and is written as a sentence of its own when the
  shot opens on somebody acting, on the camera or on the light, because
  nothing there reads on from `cuts to`. What a shot showed used to be a separate set of
  library things picked from chips, which meant two places to name a subject
  and two pools to name it from, and a line about a chipped thing pointed at
  something the prompt could not find.
- A shot is written by typing. A shot opens with a line in it, enter makes the
  next line and puts the cursor in it, backspace on an empty line takes it
  away, and the gap under a line lights up and adds one there when the pointer
  is over it, so nothing has to be added at the end and dragged into place.
  Reordering is a handle, removing is a bin.
- A line says what it is above its box rather than beside it. Its type comes
  first and never moves, so changing what a line is is always in the same
  place, and who it is about follows from the type rather than standing in for
  it. The types are called Description, Action and Dialogue. Reading the head
  as a sentence was tried first, `Astronaut says` against `Something happens`,
  and dropped: the words moved about as the type changed, so there was nowhere
  steady to look, and the same type had to be called two things to stay
  grammatical. The box below runs the full width, because the words are what
  the clip is made of and a picker beside them took a third of the room.
- Ctrl and Space on a line opens a menu of everything that can be done from
  where the cursor is: what the line is, who is in it, what the shot is made
  of, and what the library holds. A chord rather than a slash, because it
  cannot collide with what is being typed, needs no rule about where it is
  allowed, and leaves nothing behind when it is dismissed. A slash opens the
  same menu on a line with nothing on it yet, where it is unambiguous, so the
  affordance people expect is still there.
- What is set on a shot reads as a chip and what is not stays behind a plus.
  A shot used to open on six dropdowns holding nothing. The cast reads the
  same way: a strip of chips rather than a stack of boxes to fill in before
  anything can be written.
- A clip is in one language, which a line overrides only when somebody speaks
  another. Every line carrying its own was a field on every row for something
  that almost never varies.
- What a clip generates at lives in a bar under the tabs, as what it is set to
  now and a dialog to change it, because it is set once and then left alone
  while the shots are worked on the whole time.
- Every keyboard shortcut is one entry in one list, which both the bindings
  and the dialog behind `?` read, so a shortcut cannot work without being
  documented or be listed without working. The app sets its own Electron menu,
  leaving out the window menu, because the default one binds Ctrl and W to
  closing the window and the renderer needs it for closing a tab.
- The workspace is a centred band that fills a 1080p screen and stops at
  1920px, so the ultrawide does not stretch a line of a shot across a metre.
  The editor takes two thirds of it and the prompt one, because one is worked
  in and the other is read.
- Reference pictures are copied into the project rather than referenced where
  they sit, so a project stays a folder that can be moved, and the renderer
  reads them through an `asset://` scheme that serves only the open project.
- The model's own guides are linked from `docs/minimax-h3.md`, and
  `docs/h3-mapping.md` maps what they allow back to the inputs the app holds.
  Prompt work is checked against them rather than against memory of them.
  They are not copied in: their licence restricts both the territory they may
  be distributed in and the terms they may carry.
- Describing a picture is not writing a prompt for a particular model, so it
  sits beside the targets rather than inside one, and goes through a client
  call of its own: a vision answer is prose, not JSON.
- An exported prompt is a text file holding the prompt and nothing else, so
  it pastes straight into the model's own form, with the clip, its note, the
  target and the request fields in a json beside it. It is written from the
  clip as it stands at the moment it is asked for.
- Generation goes through ComfyUI's HTTP API: a workflow queued with
  `POST /prompt`, followed by polling `/queue` and `/history`, outputs read
  from `/history` and fetched with `/view`. A websocket would push progress
  per node; polling was built because it needs no push channel and the
  queue position and done states are what the run list shows.
  Everything higher level is a template workflow, named values patched into
  it, and a queue of posts, so dispatch needs no custom node. The request
  fields the app used to show as things to copy, because nothing it could
  reach accepted them, become bound inputs of whatever workflow runs the
  clip.
- A backend is a ComfyUI instance named by a base URL. Local through snug
  first; a Runpod pod is the same code path with a different URL and a
  transport for reading saved workflows, since there is no shared folder.
  The earlier plan of rsync over SSH went: ComfyUI already serves outputs
  and user files over HTTP.
- The library is a folder of files the user owns, pointed at in app settings
  and read again each time its screen is shown. Top-level folders give the
  kind (characters, scenes, prompts), a folder per entry, a file directly
  under a kind an entry of its own, media type read from the file extension,
  and an optional `entry.md` beside the files for notes. Kinds are shelf
  labels for browsing: no code branches on them, so a new kind is a folder,
  not a feature. The database holds nothing of it, so leaving the app keeps
  the collection. The renderer reads its pictures through a `library://`
  scheme that serves only files inside the folder, links resolved first.
- The app reads the user's collections and copies from them, and writes to
  them only on an explicit save or export. Using a library entry in a project
  clones it in, as copy-on-use already required, so projects stay portable
  and a deleted entry breaks nothing that used it.
- A prompt in the library is a file: plain text for one written anywhere, a
  JSON composition for one built here, whose text is written on demand
  because it is a function of the composition. A foreign text prompt still
  opens as a clip, so other people's prompts are curated by dropping them
  into the folder.
- A workflow enters a project by copy, with a link back to the source file.
  When the source changes, the update applies silently if no inputs changed
  and shows the diff when they did, and the project copy changes only when
  the user accepts. The user's workflow collection is read-only to the app.
  snug already mounts the instance's saved workflows as a local folder, so
  saving in ComfyUI is the import gesture.
- A mapping is a workflow's input surface: slots scanned from node type and
  title, typed by media (text, image, audio, number, boolean, seed, lora
  stack, bypass toggle), each slot basic, advanced or hidden, with the
  workflow's own `How to use` note shown as its guide. The scan recognises
  node types and takes names from titles, never one workflow's shape, so
  what is specific to a model stays in the workflow and the target. A slot
  takes an image and does not know it is a character: meaning is bound at
  configuration time and recorded, not pushed into the workflow.
- Re-import matches slots by node id and node type, and the diff is literal:
  kept, added, removed, with a changed title shown as a rename. A removed
  slot flags every configuration that bound it, and no guess is made that an
  added slot is a removed one come back; reconnecting is the user's call.
  Node ids are stable within a workflow file's lifetime, which is what makes
  the id match safe.
- A configuration is a saved binding of library items and literals to one
  workflow's slots. It is duplicated rather than abstracted: moving work to
  another workflow is rebinding the same library items there, not
  translating a scenario between workflows whose inputs do not mean the same
  thing. Queueing one configuration several times over several seeds is the
  experiment loop. A binding takes a library entry, a file picked or dragged
  from anywhere, or a literal typed in; a file from outside the library is
  copied into the project as reference pictures are, so the library is a
  convenience, never a gate.
- A run records the bindings, the workflow snapshot it ran with, the seed
  and its outputs, so any output can say what made it even after the
  project's copy of the workflow has moved on.
- Dispatch resolves the graph-format JSON to API format against the live
  instance's `/object_info`, applies the bypasses, patches the bound values
  and posts the result. This is the riskiest piece of the design, so it is
  built first and against a real instance.
- `pnpm-workspace.yaml` overrides `yauzl` to 3.x. Electron unpacks its binary
  with `extract-zip`, whose `yauzl@2` stalls part-way through the zip on
  current Node and exits 0 without writing `path.txt`, so a fresh install
  reports success and `pnpm dev` fails with "Electron uninstall". Only
  Electron's installer uses `yauzl`, and CI runs the binary after install so
  the failure cannot pass silently again.

## What the app does

1. Projects: a welcome screen, create and open, and a recent list.
2. The people, places and objects a project refers to, with reference
   pictures copied in and a description drafted from them by the local
   vision model.
3. Clips built from shots, with camera moves, cuts, timings, subjects, sound,
   and one ordered list per shot of what happens and what is said, including
   who speaks, off-screen voices, lines carried across a cut and lines the clip
   ends over.
4. The four H3 forms. A clip says which one it is written for, the image forms
   anchor to pictures from the library, and the prompt opens with the line the
   guide gives for that form.
5. The complete output: the prompt beside the width, the height, the aspect
   ratio and the duration a generation needs, each copyable on its own, with
   the prompt's length against what the guide wants, rewritten as the clip is
   edited, and exportable into the project or to a chosen file.
6. A workspace of tabs holding scratch clips, saved clips and branches of
   either, with keyboard shortcuts and a list of them behind `?`, and undo
   per clip.
7. Saved starting points: clips, shots and subjects kept under Saved, each
   copied when it is used rather than shared.
8. A ComfyUI backend attached by URL in settings, with whether it answers
   and its version shown. The app starts and stops nothing; snug owns the
   instance.
9. Workflow intake: the workflows folder named in settings and read in
   place, a workflow imported into the project as a copy with a link back
   to its source, its inputs scanned into a mapping of tiered slots, its
   notes shown as its guide, and a literal kept, renamed, added and removed
   diff when the source changes, applied silently when no slot changed and
   naming the configurations that bind a removed slot when one did. Each
   slot can carry a shown name and a note, and importing a workflow that
   resembles a mapped one offers to copy its mapping.
10. Dispatch: the graph resolved to API format against the instance's
    `/object_info`, bound values patched in, picked files uploaded, the run
    queued and followed by polling, its outputs pulled into the project,
    and the run recorded with its bindings and its seed. A run can be
    cancelled, opened in its folder, read slot by slot behind a Details
    fold, and deleted with its files, and an imported workflow can be
    removed with everything that hangs off it.
11. The library: a folder of files the user owns, named in settings, read
    as kinds, entries, files and notes, served read-only over `library://`,
    with copy-on-use into subjects, image slots and clips, and one explicit
    write back, copying a saved subject out as a new entry. A library
    entry with a picture joins a clip's cast in one flow from the cast
    strip or the command menu.
12. Configurations: named bindings saved per workflow with their picked
    files copied into the project, loaded back with anything stale named,
    renamed, duplicated and deleted, and queued as a batch with fresh seeds.
13. Review: outputs previewed beside their run, marked good or bad with a
    note, filtered with counts, and the good ones exported together to a
    chosen folder.
14. The run form filled from outside itself: pictures, sounds and saved
    prompt files picked from the library, a file dropped straight onto a
    slot, and a clip's prompt, duration and frame pictures sent onto the
    slots of a chosen workflow, each slot confirmed in the send dialog,
    arriving as typed values and chosen files to edit, save or queue.

## Milestones

15. H3 prompt builder overhaul: the clip editor as the editor behind a
    prompt slot, library prompts offered as starting points, and the
    confusions of the ComfyUI builder it replaces addressed rather than
    copied.

## Later

In rough order, none started and none assuming the others:

- A route or node on the ComfyUI side that sends things back: "export into
  preshoot" for a prompt or an output worth keeping.
- LoRA Manager: its loader node is already in the base workflows; read its
  metadata and recipe routes before designing the lora slot.
- Runpod: a backend at a remote URL, saved workflows read over the userdata
  routes instead of a watched folder, outputs pulled down over HTTP, pod
  start and stop through the Runpod API.
- Naming a subject inline while typing, the way `@` works in a chat app, so
  naming someone in a line is what puts them in the shot.
- Improving a field with a model: an enhance action on one text field at a
  time, which is a job small enough to check.
- Full reference mode: pictures and audio labelled as `<Picture N>` and
  `<Audio N>`, subjects built from them, retention markers, and a second
  target whose prompt is six sections rather than three.
  `docs/h3-mapping.md` says what is missing before it can be built.
- Storyboard editor: clips in order across a film, chained by last frame to
  first frame.

## Open questions

Unanswered, and each one decides a later milestone. Bugs, limitations and
improvements live in `docs/issues.md`.

- Whether a prompt slot binds a composed clip by copy or by reference: by
  reference the prompt follows the clip as it is edited, by copy a
  configuration stays reproducible. As built, a text slot holds a literal,
  so a configuration keeps its prompt by copy, and a sent prompt arrives as
  typed text; binding a composed clip is milestone 15's decision.
- The exact shapes of the userdata routes, pinned against a live instance
  when the Runpod work starts.
