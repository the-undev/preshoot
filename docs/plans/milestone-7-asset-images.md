# Milestone 7: asset images

A person, place or object in the library is a name and a description typed by
hand, and every prompt leans on that description. This attaches reference
images to a library thing and lets the local vision model draft the
description from them.

Read `CLAUDE.md`, `docs/roadmap.md` and `docs/issues.md` first. Work on the
branch `feature/prompt-generation`. One commit per step below, `pnpm check`
green before each commit, no attribution trailers. Hand the branch over for
review at the end; do not push or merge.

## Decisions

- Images are copied into the project, under `assets/images/`, rather than
  referenced where they sit. A project is a folder that can be moved or
  copied, and a path into somebody's home directory breaks the moment it is.
- The renderer reads them through a scheme of their own, `asset://`,
  registered the way `trpc://` already is. Reading files into the page as
  data URLs would put every image in the renderer's memory and, worse, in
  the database.
- Describing an image is not writing a prompt for a particular model, so it
  lives beside the targets rather than inside one, and goes through a client
  call of its own rather than through the schema-constrained one. A vision
  answer is prose, not JSON.

## Prerequisite

The projector has to be loaded, which `--no-mmproj` prevents. Run the server
as `docs/llama-server.md` describes:

```
llama-server --models-dir ~/.cache/huggingface/hub --models-max 1 \
  --mmproj-device none --host 127.0.0.1 --port 8080
```

The projector stays off the GPU on this card.

## Behaviour

1. A library thing can have reference images added from a file picker, shown
   as thumbnails, and removed one at a time.
2. Removing an image takes the file with it. Removing the thing takes all of
   them.
3. Draft description asks the local model to write the thing's description
   from its images, and puts what comes back in the description box, where it
   can be edited before it is saved.
4. Drafting says what it is doing while it runs, and says why when the server
   has no model that can see pictures.
5. A shot showing a library thing shows its first image beside the name.
6. Closing and reopening the project shows the same images.

## Step 1: images belong to a library thing

`schema.ts` gains:

```ts
export const assetImages = sqliteTable("asset_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mediaType: text("media_type").notNull(),
  position: integer("position").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
})
```

`src/main/core/composition/image-store.ts`

- `projectImagesPath(directory)`, `assets/images` under the project.
- `IMAGE_MEDIA_TYPES`, the extensions taken and what each is served as.
- `importImage(db, { directory, assetId, sourcePath })`, copying the file
  under a name of its own and inserting the row.
- `listImages(db, assetId)` and `listImagesByAsset(db)` for the library.
- `readImage(db, imageId)`, the row and its path, for the scheme.
- `deleteImage(db, directory, imageId)`, taking the file with the row.
- `deleteImagesOfAsset(db, directory, assetId)`, which `deleteAsset` calls so
  a removed thing leaves no files behind.

`image-store.test.ts` against a temp project: an import copies the file and
keeps its type, a second import of the same file does not overwrite the
first, removing an image removes the file, removing the thing removes them
all, a file that is not an image is refused.

## Step 2: the model describes an image

`llama-server-client.ts` gains `describe(request: DescribeRequest)`, posting
a chat whose user message carries text and image parts. It is a call of its
own: a vision answer is prose, and the schema-constrained path must not
change shape underneath the prompts that already work.

`src/main/core/vision/describe-asset.ts`

- `ASSET_DESCRIPTION_PROMPT`, saying: describe what is in the pictures as it
  would be seen on screen, one paragraph, appearance only, no story and no
  camera language, and when several pictures show the same thing describe the
  thing rather than each picture.
- `describeAsset({ client, model, kind, name, images })`, returning the text.
- A model with no image modality throws `PromptServiceError` `bad-response`
  with a message naming what is wrong, rather than sending pictures to
  something that cannot see them.

`describe-asset.test.ts` with a fake client: the request carries every image
and the thing's name and kind, the answer comes back as text, a model that
cannot see pictures is refused.

## Step 3: the routers

`Dialogs` gains `pickFiles({ title, extensions })`.

`assets.ts` gains `images` (query, by asset), `addImages` (mutation, opening
the picker and importing what is chosen), `removeImage`, and `draft`
(mutation, returning the drafted description without saving it, so it can be
read before it is kept).

`assets.test.ts`: images are listed against their thing, adding returns what
was imported, removing takes the file, drafting asks the model and returns
text without touching the stored description.

## Step 4: the renderer reads images

`src/main/images/protocol.ts`, registering `asset://` privileged and
answering `asset://<id>` with the file from the open project. An id that is
not in the open project answers 404, so a stale page cannot read another
project's files.

## Step 5: the library shows them

`asset-images.tsx`, presentational: thumbnails, Add, Remove, and Draft
description with what it is doing. `use-asset-images.ts` for the calls. The
form gains the drafting button, and `asset-list.tsx` shows the first image
beside each thing.

`asset-images.test.tsx`: thumbnails are shown in order, Add and Remove
report, Draft reports and is held while it runs.

## Step 6: roadmap and issues

Add milestone 7 to "Done", renumber, and record what turned up.

## Verification

`pnpm check` after every step, `pnpm build` before handover, and one real
drafting run against llama-server with the projector loaded, pasted at
handover.
