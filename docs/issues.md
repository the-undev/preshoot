# Issues

Bugs, limitations and improvements worth returning to. `docs/roadmap.md`
holds purpose, decisions and what comes next; this holds what is wrong or
missing in what already exists.

An entry says what happens, not what to do about it, unless the fix is
already known. Entries go when they are fixed, and the commit that fixes one
says so.

## Bugs

- A verdict and its note are written together, so marking a comparison
  result good or bad also writes whatever the note box holds at that moment,
  including an empty box.
- A generation that runs past the two minute timeout is reported as a server
  that could not be reached, which is not what happened.
- Everything milestone 2 generated before clips existed has no clip, and the
  history is read per clip, so those prompts cannot be reached from the app.
- An edit can rewrite dialogue. Asked to make a character happier as a bus
  arrived, the model changed "It is late again." to "It's here!", leaving the
  clip holding a line its own prompt no longer says. Arguably the better
  prompt, but the two now disagree. The built-in edit prompt says spoken
  words stay word for word; tightening it is a copy and an edit in the
  Prompts tab rather than a code change.
- A comparison run stops at the first way of writing that fails. What
  already landed is kept under the run and shown as a short row of results,
  with nothing saying the run was cut short.
- The recent projects list drops an entry whose folder is missing when the
  list is read, so a project on an unmounted drive is forgotten rather than
  hidden.
- `app.getVersion()` reports the Electron version when the app runs from
  `out/` unpackaged. It is right once packaged.

## Limitations

- Only one project is open at a time, for the app rather than per window. A
  second window would need a session per window.
- Only the newest comparison run is shown, and only inside the clip it
  belongs to. Older runs are in the database and out of reach.
- Export writes one prompt at a time. There is no way to write out a whole
  clip or a whole project at once.
- An edit is made from the prompt as it was, not from the clip as it is now,
  so editing an old prompt after changing its clip keeps the old wording.
  That is what makes an edit chain readable, but it will surprise someone.
- A clip has one style for every shot, so it cannot change style at a cut.
- The language of a line of dialogue is free text rather than a picklist.
- The shot editor saves as it is changed, so there is no undo.
- Nothing checks that the prose the model returns holds the camera motion it
  was given, only that it holds the dialogue.
- Deleting a library thing, a shot or a speaker happens without asking. Only
  deleting a clip asks first.
- The save dialog offers no file type filter, and appends nothing when a
  name is typed without an extension.
- Streaming tokens to the renderer as they arrive needs a subscription link
  over the `trpc://` scheme, which nothing implements yet.

## Improvements

- A shot is reordered by dragging its handle. From the keyboard that means
  focusing the handle, pressing space to lift it, moving with the arrows and
  pressing space again, which nothing on screen says.
- The history and the compare panel share one scrolling pane, so reaching the
  comparison still means scrolling past every prompt the clip has.
- Every entry in the history carries its own edit box, Export and Save, so a
  long history is a long column of controls. The actions may belong behind
  one control per entry.
- The `brief` column on `generations` holds the clip's note, and an edit
  copies its parent's, so the name no longer says what the column holds.
- `readVariant` lists every variant of a target to find one of them.
- The reference image forms of the H3 prompt (I2VA, FL2VA, L2VA) need the
  alignment line. They arrive with the asset images milestone.
- Image editing (Qwen Image Edit) as a shot type that edits a library image.

## Environment and tooling

- The multimodal projector has to stay off the GPU on this card. Loaded onto
  it, an image encode aborted inside CUDA while another model held VRAM.
  Whether it fits on the GPU with nothing else loaded is untested.
- A vision request needs `enable_thinking` off as much as a text one does,
  or the answer is spent on reasoning before the image is described.
- drizzle-kit generated a table rebuild that read columns added in the same
  migration, which would have failed on a fresh database. The change was
  split into two migrations. Read the generated SQL whenever a column
  changes and columns are added together.
- The Electron postinstall silently skipped extracting the binary in this
  environment; the zip was cached and extracted by hand. Check whether a
  clean `pnpm install` on this machine reproduces it.
- TypeScript 7, Vite 8 and ESLint 10 are out. The template pins TS 5.9, Vite
  7 and ESLint 9; upgrade when electron-vite and the toolkit configs support
  them.
- Testing Library cleanup is registered by hand in the renderer test setup
  because Vitest globals are off. Turning globals on would remove it.
