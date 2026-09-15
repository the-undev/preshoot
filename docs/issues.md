# Issues

Bugs, limitations and improvements worth returning to. `docs/roadmap.md`
holds purpose, decisions and what comes next; this holds what is wrong or
missing in what already exists.

An entry says what happens, not what to do about it, unless the fix is
already known. Entries go when they are fixed, and the commit that fixes one
says so.

## Bugs

- The recent projects list drops an entry whose folder is missing when the
  list is read, so a project on an unmounted drive is forgotten rather than
  hidden.
- `app.getVersion()` reports the Electron version when the app runs from
  `out/` unpackaged. It is right once packaged.
- A project made before the schema was squashed to one migration will not
  open. The squash dropped the migrations that would carry it forward, so
  the folder has to be made again.

## Limitations

- Only one project is open at a time, for the app rather than per window. A
  second window would need a session per window.
- Export writes one prompt at a time. There is no way to write out a whole
  clip or a whole project at once.
- A clip has one style for every shot, so it cannot change style at a cut.
- A clip carries no seed, so two generations of the same clip cannot be asked
  to come out the same. The request takes one; nothing holds it.
- The language of a clip is free text rather than a picklist, and so is the
  override on a line.
- The shot editor saves as it is changed, so there is no undo.
- Closing the tab of a clip that was never saved throws the clip away. There
  is no undo and no reopening of a closed tab, only the question asked first.
- The save dialog offers no file type filter, and appends nothing when a
  name is typed without an extension.
- Streaming tokens to the renderer as they arrive needs a subscription link
  over the `trpc://` scheme, which nothing implements yet.
- A tab can be moved only by closing it and opening the clip again, since
  nothing reorders them.

## What the prompt still gets wrong

Checked against the H3 prompt guides, which are linked from
`docs/minimax-h3.md`. The prompt is written from the clip alone, so what is
wrong here is wrong every time rather than some of the time.

- A line of dialogue carried across a cut is not actually split. The app holds
  one line, so it writes the whole line in the shot it belongs to and marks it
  `<scenetrans>`, where the guide splits the words between the two shots and
  marks both halves.
- `<scenetrans>` and `<cutoff>` go after the closing `</d>`, which keeps the
  spoken words exactly as typed. The guide says what the markers mean but
  shows no example placing them against the tag, so this is a choice rather
  than a quotation.
- Unintelligible speech in reference audio is written `[unclear]` rather than
  guessed at. Nothing says so.
- A prompt written from short lines comes out far shorter than the 350 to 500
  words the guide wants for a generation body. The count is shown; nothing
  fills the gap.

## Improvements

- A keyframe condition takes a frame index, which needs a frame rate.
  Nothing holds one, so a picture says which end of the clip it anchors
  rather than which frame.
- Nothing turns the fields into a request body. That wants a real endpoint
  to build against, which arrives with Runpod or ComfyUI.
- A shot or a line is reordered by dragging its handle. From the keyboard that
  means focusing the handle, pressing space to lift it, moving with the arrows
  and pressing space again, which nothing on screen says.
- A line cannot be turned from something that happens into something that is
  said. It has to be removed and written again as the other kind.
- The library screen puts the form on the left and the list on the right,
  which reads backwards: you pick from the list, then edit.
- A library thing cannot be added without leaving the clip that needs it.
- The prompt that describes a picture is a constant in the code, so it cannot
  be tuned without an edit and a rebuild.
- A drafted description replaces whatever is in the box. There is no way to
  keep both and choose.
- A picture is shown at whatever size it was imported at, so a large one is
  read into the page in full to be drawn as a thumbnail.
- Image editing (Qwen Image Edit) as a shot type that edits a library image.
- Saving a branch always makes a new saved clip. There is no way to write one
  back over the clip it came from.
- The tab bar scrolls sideways once there are more tabs than fit, with nothing
  to say that tabs are off screen.

## Environment and tooling

- Squashing the migrations to one broke every project made before it. That
  was acceptable with no users; it will not be again, so the old ones have to
  be kept next time.
- drizzle-kit will generate a table rebuild that reads columns added in the
  same migration, which fails on a fresh database, and it asks an
  interactive question when a column is dropped and another added together.
  Neither can be answered from a script, so a change like that goes in two
  passes.

- Nothing exercises the main process's start-up. Registering a second
  scheme broke every request the renderer makes and no test noticed, because
  the window, the protocol handlers and the context are wired together in
  `index.ts` where nothing can reach them. The menu the app now sets is in the
  same place and is untested for the same reason.

- The multimodal projector has to stay off the GPU on this card. Loaded onto
  it, an image encode aborted inside CUDA while another model held VRAM.
  Whether it fits on the GPU with nothing else loaded is untested.
- Describing one 512x512 picture took 29.5 seconds with the model on the CPU
  while another server held the card. On the GPU it should be far quicker,
  but that is untested, and the two minute limit is not far away for a thing
  with several pictures.
- A vision request needs `enable_thinking` off as much as a text one does,
  or the answer is spent on reasoning before the image is described.
- TypeScript 7, Vite 8 and ESLint 10 are out. The template pins TS 5.9, Vite
  7 and ESLint 9; upgrade when electron-vite and the toolkit configs support
  them.
- Testing Library cleanup is registered by hand in the renderer test setup
  because Vitest globals are off. Turning globals on would remove it.
