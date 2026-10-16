import { readFileSync } from "node:fs"
import { z } from "zod"
import { ASSET_KINDS, insertAsset, readAsset } from "../../core/composition/asset-store"
import { CompositionError } from "../../core/composition/errors"
import { importImages, listImages, readImage } from "../../core/composition/image-store"
import { LibraryError } from "../../core/library-folder/errors"
import { resolveLibraryFile } from "../../core/library-folder/guard"
import { mediaOf } from "../../core/library-folder/media"
import { findEntry, scanLibraryFolder } from "../../core/library-folder/scan"
import { writeLibraryEntry } from "../../core/library-folder/write"
import { asClientError } from "../client-errors"
import { requireOpenProject } from "../project"
import { publicProcedure, router } from "../trpc"

export const libraryRouter = router({
  /** What the library folder named in settings holds now, read again on every call. */
  entries: publicProcedure.query(({ ctx }) => scanLibraryFolder(ctx.settings.libraryFolder())),

  /** The words in one text file of the library, for opening it as a clip. */
  readText: publicProcedure
    .input(z.object({ relativePath: z.string().min(1) }))
    .query(({ ctx, input }) => {
      try {
        const path = resolveLibraryFile(ctx.settings.libraryFolder(), input.relativePath)
        if (path === null) throw LibraryError.notFound(input.relativePath)
        if (mediaOf(path) !== "text") throw LibraryError.notText(input.relativePath)
        return { text: readFileSync(path, "utf8") }
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Opens one picture of the library in the app the system gives pictures. */
  openFile: publicProcedure
    .input(z.object({ relativePath: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const path = resolveLibraryFile(ctx.settings.libraryFolder(), input.relativePath)
        if (path === null) throw LibraryError.notFound(input.relativePath)
        if (mediaOf(path) !== "image") throw LibraryError.notImage(input.relativePath)
        await ctx.openPath(path)
      } catch (error) {
        asClientError(error)
      }
    }),

  /**
   * Makes a saved subject in the open project from a library entry, named after it, with its
   * pictures copied in, all at once or not at all. The entry is read again first, so only what is
   * in the library now is used.
   */
  addToProject: publicProcedure
    .input(
      z.object({
        entryPath: z.string().min(1),
        kind: z.enum(ASSET_KINDS),
        description: z.string().trim().min(1),
      })
    )
    .mutation(({ ctx, input }) => {
      const project = requireOpenProject(ctx)
      try {
        const folder = ctx.settings.libraryFolder()
        if (folder === null) throw LibraryError.unset()
        const entry = findEntry(scanLibraryFolder(folder), input.entryPath)
        if (!entry) throw LibraryError.notFound(input.entryPath)

        const pictures = entry.files.filter((candidate) => candidate.media === "image")
        return project.db.transaction((tx) => {
          const subject = insertAsset(tx, {
            clipId: null,
            kind: input.kind,
            name: entry.name,
            description: input.description,
          })
          importImages(tx, {
            directory: project.directory,
            assetId: subject.id,
            sourcePaths: pictures.map((file) => file.path),
          })
          return subject
        })
      } catch (error) {
        asClientError(error)
      }
    }),

  /**
   * Copies a subject out to the library as a new entry under `kind`, with its pictures and its
   * description as the entry's notes. An entry of that name already there is refused.
   */
  copySubject: publicProcedure
    .input(z.object({ assetId: z.number().int(), kind: z.string().trim().min(1) }))
    .mutation(({ ctx, input }) => {
      const project = requireOpenProject(ctx)
      try {
        const subject = readAsset(project.db, input.assetId)
        if (!subject) throw CompositionError.notFound(`Subject ${input.assetId}`)
        return writeLibraryEntry({
          folder: ctx.settings.libraryFolder(),
          kind: input.kind,
          name: subject.name,
          notes: subject.description,
          pictures: listImages(project.db, subject.id).map(
            (image) => readImage(project.db, project.directory, image.id).path
          ),
        })
      } catch (error) {
        asClientError(error)
      }
    }),
})
