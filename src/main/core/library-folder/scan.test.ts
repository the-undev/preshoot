import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mediaOf } from "./media"
import { findEntry, scanLibraryFolder, type LibraryFolder, type LibraryKind } from "./scan"

describe("scanLibraryFolder", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-library-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  /** Writes a file under the library, making the folders on the way. */
  function put(relativePath: string, contents = ""): string {
    const path = join(dir, relativePath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, contents)
    return path
  }

  function kindsOf(listing: LibraryFolder): LibraryKind[] {
    if (listing.state !== "listed") throw new Error(`expected a listing, got ${listing.state}`)
    return listing.kinds
  }

  it("says when no folder is set", () => {
    expect(scanLibraryFolder(null)).toEqual({ state: "unset" })
  })

  it("says when the folder is not there", () => {
    const folder = join(dir, "gone")

    expect(scanLibraryFolder(folder)).toEqual({ state: "missing", folder })
  })

  it("lists each top-level folder as a kind, by name, and passes over loose files and hidden ones", () => {
    mkdirSync(join(dir, "scenes"))
    mkdirSync(join(dir, "characters"))
    mkdirSync(join(dir, ".trash"))
    put("readme.txt")

    expect(kindsOf(scanLibraryFolder(dir))).toEqual([
      { name: "characters", entries: [] },
      { name: "scenes", entries: [] },
    ])
  })

  it("reads an entry folder's files with their media types, and its entry.md as notes", () => {
    put("characters/Daniel/daniel-cafe.png")
    put("characters/Daniel/voice.wav")
    put("characters/Daniel/turnaround.mp4")
    put("characters/Daniel/daniel.safetensors")
    put("characters/Daniel/entry.md", "A man in his late thirties.\n")

    const [characters] = kindsOf(scanLibraryFolder(dir))

    expect(characters.entries).toEqual([
      {
        kind: "characters",
        name: "Daniel",
        path: join(dir, "characters", "Daniel"),
        notes: "A man in his late thirties.",
        files: [
          {
            name: "daniel-cafe.png",
            path: join(dir, "characters", "Daniel", "daniel-cafe.png"),
            relativePath: join("characters", "Daniel", "daniel-cafe.png"),
            media: "image",
          },
          {
            name: "daniel.safetensors",
            path: join(dir, "characters", "Daniel", "daniel.safetensors"),
            relativePath: join("characters", "Daniel", "daniel.safetensors"),
            media: "refmod",
          },
          {
            name: "turnaround.mp4",
            path: join(dir, "characters", "Daniel", "turnaround.mp4"),
            relativePath: join("characters", "Daniel", "turnaround.mp4"),
            media: "video",
          },
          {
            name: "voice.wav",
            path: join(dir, "characters", "Daniel", "voice.wav"),
            relativePath: join("characters", "Daniel", "voice.wav"),
            media: "audio",
          },
        ],
      },
    ])
  })

  it("gives an entry with no entry.md no notes", () => {
    put("scenes/Rainy Street/rainy-street-dusk.png")

    const [scenes] = kindsOf(scanLibraryFolder(dir))

    expect(scenes.entries[0].notes).toBeNull()
  })

  it("keeps a text file other than entry.md as one of the entry's files", () => {
    put("prompts/Cafe Introduction/prompt.txt", "A man at a bus stop.")

    const [prompts] = kindsOf(scanLibraryFolder(dir))

    expect(prompts.entries[0].files.map((file) => [file.name, file.media])).toEqual([
      ["prompt.txt", "text"],
    ])
  })

  it("reads a loose file under a kind as an entry of its own, named by its stem", () => {
    put("prompts/one-liner.txt", "A man sits at a cafe window.")

    const [prompts] = kindsOf(scanLibraryFolder(dir))

    expect(prompts.entries).toEqual([
      {
        kind: "prompts",
        name: "one-liner",
        path: join(dir, "prompts", "one-liner.txt"),
        notes: null,
        files: [
          {
            name: "one-liner.txt",
            path: join(dir, "prompts", "one-liner.txt"),
            relativePath: join("prompts", "one-liner.txt"),
            media: "text",
          },
        ],
      },
    ])
  })

  it("lists a file it does not recognise as other rather than hiding it", () => {
    put("characters/Daniel/sheet.psd")

    const [characters] = kindsOf(scanLibraryFolder(dir))

    expect(characters.entries[0].files.map((file) => file.media)).toEqual(["other"])
  })

  it("lists the files in an entry's own folders by where they sit in the entry", () => {
    put("characters/Daniel/poses/side.png")

    const [characters] = kindsOf(scanLibraryFolder(dir))

    expect(characters.entries[0].files.map((file) => file.name)).toEqual([
      join("poses", "side.png"),
    ])
  })

  it("takes a kind folder of any name, spaces, punctuation and accents included", () => {
    put("Sci-Fi & Fantasy (old)/Ship.png")
    put("Lieux préférés/Café/entry.md", "Un café.")

    const kinds = kindsOf(scanLibraryFolder(dir))

    expect(kinds.map((kind) => kind.name)).toEqual(["Lieux préférés", "Sci-Fi & Fantasy (old)"])
    expect(kinds[0].entries[0]).toEqual(
      expect.objectContaining({ kind: "Lieux préférés", name: "Café", notes: "Un café." })
    )
    expect(kinds[1].entries[0]).toEqual(
      expect.objectContaining({ kind: "Sci-Fi & Fantasy (old)", name: "Ship" })
    )
  })

  it("passes over symbolic links, so nothing listed leads outside the folder", () => {
    const outside = mkdtempSync(join(tmpdir(), "preshoot-outside-"))
    try {
      writeFileSync(join(outside, "secret.png"), "")
      mkdirSync(join(dir, "characters", "Daniel"), { recursive: true })
      symlinkSync(join(outside, "secret.png"), join(dir, "characters", "Daniel", "secret.png"))
      symlinkSync(outside, join(dir, "characters", "Elsewhere"))

      const [characters] = kindsOf(scanLibraryFolder(dir))

      expect(characters.entries).toEqual([expect.objectContaining({ name: "Daniel", files: [] })])
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it("reads the folder again each time, so a new kind is a new folder", () => {
    mkdirSync(join(dir, "characters"))
    expect(kindsOf(scanLibraryFolder(dir)).map((kind) => kind.name)).toEqual(["characters"])

    mkdirSync(join(dir, "voices"))

    expect(kindsOf(scanLibraryFolder(dir)).map((kind) => kind.name)).toEqual([
      "characters",
      "voices",
    ])
  })
})

describe("findEntry", () => {
  it("finds an entry by its path and nothing for a path the listing does not hold", () => {
    const listing: LibraryFolder = {
      state: "listed",
      folder: "/l",
      kinds: [
        {
          name: "characters",
          entries: [
            {
              kind: "characters",
              name: "Daniel",
              path: "/l/characters/Daniel",
              notes: null,
              files: [],
            },
          ],
        },
      ],
    }

    expect(findEntry(listing, "/l/characters/Daniel/")?.name).toBe("Daniel")
    expect(findEntry(listing, "/l/characters/Anna")).toBeNull()
    expect(findEntry({ state: "unset" }, "/l/characters/Daniel")).toBeNull()
  })
})

describe("mediaOf", () => {
  it("reads the media type from the extension whatever its case", () => {
    expect(
      [
        "a.PNG",
        "a.jpeg",
        "a.webp",
        "a.gif",
        "a.flac",
        "a.ogg",
        "a.mp3",
        "a.webm",
        "a.mov",
        "a.md",
      ].map(mediaOf)
    ).toEqual([
      "image",
      "image",
      "image",
      "image",
      "audio",
      "audio",
      "audio",
      "video",
      "video",
      "text",
    ])
  })

  it("calls anything else other", () => {
    expect(mediaOf("a.json")).toBe("other")
    expect(mediaOf("no-extension")).toBe("other")
  })
})
