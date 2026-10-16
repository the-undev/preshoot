import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ClipHistory } from "../../core/composition/history"
import { ProjectSession } from "../../core/projects/session"
import { AppSettingsStore } from "../../core/settings/app-settings"
import type { Context } from "../context"
import { appRouter } from "../router"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("library router", () => {
  let dir: string
  let library: string
  let session: ProjectSession
  let settings: AppSettingsStore
  let picked: string[]
  let caller: ReturnType<typeof appRouter.createCaller>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-library-router-"))
    library = join(dir, "library")
    put("characters/Daniel/daniel-cafe.png", "daniel")
    put("characters/Daniel/entry.md", "A man in his late thirties.\n")
    put("scenes/Rainy Street/rainy-street-dusk.png", "street")
    put("prompts/Cafe Introduction/prompt.txt", "A man waits at a bus shelter.")
    put("prompts/one-liner.txt", "A man sits at a cafe window table.")
    session = new ProjectSession()
    settings = new AppSettingsStore(join(dir, "settings.json"))
    settings.setLibraryFolder(library)
    picked = []
    const ctx: Context = {
      versions: { app: "0.0.0", electron: "0", chrome: "0", node: "0" },
      projects: session,
      history: new ClipHistory(),
      settings,
      migrationsFolder,
      dialogs: {
        pickDirectory: async () => null,
        pickFiles: async () => picked,
        saveFile: async () => null,
      },
      openPath: async () => {},
      promptClient: () => {
        throw new Error("the library router does not generate prompts")
      },
      comfyUiClient: () => {
        throw new Error("the library router does not talk to ComfyUI")
      },
    }
    caller = appRouter.createCaller(ctx)
  })

  afterEach(() => {
    session.close()
    rmSync(dir, { recursive: true, force: true })
  })

  /** Writes a file under the library, making the folders on the way. */
  function put(relativePath: string, contents: string): void {
    const path = join(library, relativePath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, contents)
  }

  async function openProject(): Promise<string> {
    const directory = join(dir, "film")
    await caller.projects.create({
      directory,
      name: "Film",
      createDirectory: false,
      allowNonEmpty: false,
    })
    return directory
  }

  it("lists the kinds and entries without a project open", async () => {
    const listing = await caller.library.entries()

    expect(listing.state).toBe("listed")
    if (listing.state !== "listed") return
    expect(
      listing.kinds.map((kind) => [kind.name, kind.entries.map((entry) => entry.name)])
    ).toEqual([
      ["characters", ["Daniel"]],
      ["prompts", ["Cafe Introduction", "one-liner"]],
      ["scenes", ["Rainy Street"]],
    ])
  })

  it("says when no library folder is set", async () => {
    settings.setLibraryFolder(null)

    expect(await caller.library.entries()).toEqual({ state: "unset" })
  })

  it("reads a text file of the library", async () => {
    expect(
      await caller.library.readText({ relativePath: join("prompts", "one-liner.txt") })
    ).toEqual({ text: "A man sits at a cafe window table." })
  })

  it("refuses to read outside the library or a file that is not text", async () => {
    writeFileSync(join(dir, "secret.txt"), "secret")

    await expect(
      caller.library.readText({ relativePath: join("..", "secret.txt") })
    ).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }))
    await expect(
      caller.library.readText({
        relativePath: join("characters", "Daniel", "daniel-cafe.png"),
      })
    ).rejects.toThrow(expect.objectContaining({ code: "BAD_REQUEST" }))
  })

  it("makes a saved subject from an entry, with its pictures copied into the project", async () => {
    const directory = await openProject()

    const subject = await caller.library.addToProject({
      entryPath: join(library, "characters", "Daniel"),
      kind: "person",
      description: "A man in his late thirties.",
    })

    expect(subject).toEqual(
      expect.objectContaining({
        clipId: null,
        kind: "person",
        name: "Daniel",
        description: "A man in his late thirties.",
      })
    )
    expect((await caller.assets.list()).map((asset) => asset.name)).toEqual(["Daniel"])
    const images = await caller.assets.images()
    expect(images).toHaveLength(1)
    const copied = join(directory, "assets", "images", images[0].fileName)
    expect(readFileSync(copied, "utf8")).toBe("daniel")
    expect(readdirSync(join(library, "characters", "Daniel")).sort()).toEqual([
      "daniel-cafe.png",
      "entry.md",
    ])
  })

  it("refuses an entry the library does not hold", async () => {
    await openProject()

    await expect(
      caller.library.addToProject({
        entryPath: join(dir, "elsewhere"),
        kind: "person",
        description: "x",
      })
    ).rejects.toThrow(expect.objectContaining({ code: "NOT_FOUND" }))
  })

  it("asks for a project before making a subject", async () => {
    await expect(
      caller.library.addToProject({
        entryPath: join(library, "characters", "Daniel"),
        kind: "person",
        description: "x",
      })
    ).rejects.toThrow(expect.objectContaining({ code: "PRECONDITION_FAILED" }))
  })

  it("copies a saved subject to the library as a folder with its pictures and an entry.md", async () => {
    await openProject()
    const anna = await caller.assets.create({
      kind: "person",
      name: "Anna",
      description: "A woman in a red coat.",
    })
    const picture = join(dir, "anna.png")
    writeFileSync(picture, "anna")
    picked = [picture]
    await caller.assets.addImages({ assetId: anna.id })

    const written = await caller.library.copySubject({ assetId: anna.id, kind: "characters" })

    const entry = join(library, "characters", "Anna")
    expect(written).toEqual({ path: entry })
    expect(readdirSync(entry).sort()).toEqual(["Anna-1.png", "entry.md"])
    expect(readFileSync(join(entry, "Anna-1.png"), "utf8")).toBe("anna")
    expect(readFileSync(join(entry, "entry.md"), "utf8")).toBe("A woman in a red coat.\n")
  })

  it("copies to a kind typed in that is not there yet", async () => {
    await openProject()
    const lamp = await caller.assets.create({
      kind: "object",
      name: "Lamp",
      description: "A lamp.",
    })

    await caller.library.copySubject({ assetId: lamp.id, kind: "props" })

    expect(readdirSync(join(library, "props", "Lamp"))).toEqual(["entry.md"])
  })

  it("refuses to copy over an entry of the same name and leaves it alone", async () => {
    await openProject()
    const daniel = await caller.assets.create({
      kind: "person",
      name: "Daniel",
      description: "Someone else.",
    })

    await expect(
      caller.library.copySubject({ assetId: daniel.id, kind: "characters" })
    ).rejects.toThrow(
      expect.objectContaining({
        code: "CONFLICT",
        message: "characters already holds an entry called Daniel. Nothing was written.",
      })
    )
    expect(readFileSync(join(library, "characters", "Daniel", "entry.md"), "utf8")).toBe(
      "A man in his late thirties.\n"
    )
  })

  it("asks for a library folder before copying a subject out", async () => {
    await openProject()
    settings.setLibraryFolder(null)
    const anna = await caller.assets.create({ kind: "person", name: "Anna", description: "x" })

    await expect(
      caller.library.copySubject({ assetId: anna.id, kind: "characters" })
    ).rejects.toThrow(expect.objectContaining({ code: "PRECONDITION_FAILED" }))
  })
})
