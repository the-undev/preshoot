import type { LibraryFolder } from "@renderer/lib/trpc"

/** A library shaped like a real one: characters, scenes and prompts, with notes on two. */
export const listedLibrary: LibraryFolder = {
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
          notes: "A man in his late thirties.\nNavy jumper.",
          files: [
            {
              name: "daniel-cafe.png",
              path: "/l/characters/Daniel/daniel-cafe.png",
              relativePath: "characters/Daniel/daniel-cafe.png",
              media: "image",
            },
            {
              name: "daniel.safetensors",
              path: "/l/characters/Daniel/daniel.safetensors",
              relativePath: "characters/Daniel/daniel.safetensors",
              media: "refmod",
            },
            {
              name: "sheet.psd",
              path: "/l/characters/Daniel/sheet.psd",
              relativePath: "characters/Daniel/sheet.psd",
              media: "other",
            },
            {
              name: "voice.wav",
              path: "/l/characters/Daniel/voice.wav",
              relativePath: "characters/Daniel/voice.wav",
              media: "audio",
            },
            {
              name: "walk.mp4",
              path: "/l/characters/Daniel/walk.mp4",
              relativePath: "characters/Daniel/walk.mp4",
              media: "video",
            },
          ],
        },
      ],
    },
    {
      name: "prompts",
      entries: [
        {
          kind: "prompts",
          name: "one-liner",
          path: "/l/prompts/one-liner.txt",
          notes: null,
          files: [
            {
              name: "one-liner.txt",
              path: "/l/prompts/one-liner.txt",
              relativePath: "prompts/one-liner.txt",
              media: "text",
            },
          ],
        },
      ],
    },
    {
      name: "scenes",
      entries: [
        {
          kind: "scenes",
          name: "Rainy Street",
          path: "/l/scenes/Rainy Street",
          notes: "A terraced street at dusk.",
          files: [
            {
              name: "rainy-street-dusk.png",
              path: "/l/scenes/Rainy Street/rainy-street-dusk.png",
              relativePath: "scenes/Rainy Street/rainy-street-dusk.png",
              media: "image",
            },
          ],
        },
      ],
    },
  ],
}
