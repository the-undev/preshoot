import { describe, expect, it } from "vitest"
import { h3PromptSchema, h3UserMessage, renderH3Prompt } from "./minimax-h3"

const prompt = {
  integrated_multimodal_description: "[Shot 1] Live-action, a baker opens the shutters.",
  overall_soundscape: "Wooden shutters scrape open over a quiet street.",
  non_diegetic_music: "A soft acoustic-guitar pattern at a moderate tempo.",
}

describe("renderH3Prompt", () => {
  it("labels the three fields in order, one paragraph each", () => {
    expect(renderH3Prompt(prompt)).toBe(
      [
        "integrated_multimodal_description: [Shot 1] Live-action, a baker opens the shutters.",
        "",
        "overall_soundscape: Wooden shutters scrape open over a quiet street.",
        "",
        "non_diegetic_music: A soft acoustic-guitar pattern at a moderate tempo.",
      ].join("\n")
    )
  })
})

describe("h3PromptSchema", () => {
  it("accepts all three fields", () => {
    expect(h3PromptSchema.safeParse(prompt).success).toBe(true)
  })

  it("rejects an answer with a field missing", () => {
    const withoutMusic = {
      integrated_multimodal_description: prompt.integrated_multimodal_description,
      overall_soundscape: prompt.overall_soundscape,
    }

    expect(h3PromptSchema.safeParse(withoutMusic).success).toBe(false)
  })

  it("rejects an empty field", () => {
    expect(h3PromptSchema.safeParse({ ...prompt, overall_soundscape: "" }).success).toBe(false)
  })
})

describe("h3UserMessage", () => {
  it("follows the brief with the clip length", () => {
    const message = h3UserMessage("A baker opens the shutters.")

    expect(message.startsWith("A baker opens the shutters.")).toBe(true)
    expect(message.trimEnd().endsWith("Target length: one clip under 15 seconds.")).toBe(true)
  })
})
