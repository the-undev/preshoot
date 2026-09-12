import type { PromptTarget } from "./target"

/** Which kind of system prompt a variant replaces. */
export type PromptStrategy = "prose" | "brief"

/** One system prompt that can be written with, whether it ships with the app or was written here. */
export interface PromptVariant {
  id: string
  targetId: string
  strategy: PromptStrategy
  name: string
  systemPrompt: string
  editable: boolean
}

/** The id of the prompt that ships with a target. */
export function builtinVariantId(targetId: string, strategy: PromptStrategy): string {
  return `builtin:${targetId}:${strategy}`
}

/** The id of a prompt written in this project. */
export function storedVariantId(id: number): string {
  return `stored:${id}`
}

/** The row behind a stored id, or nothing when the id is not one. */
export function storedVariantRowId(id: string): number | null {
  const match = /^stored:(\d+)$/.exec(id)
  return match ? Number(match[1]) : null
}

/** The prompts a target ships with, which can be read and copied but not changed. */
export function builtinVariants(target: PromptTarget): PromptVariant[] {
  return [
    {
      id: builtinVariantId(target.id, "prose"),
      targetId: target.id,
      strategy: "prose",
      name: "Built-in, prose per shot",
      systemPrompt: target.prose.systemPrompt,
      editable: false,
    },
    {
      id: builtinVariantId(target.id, "brief"),
      targetId: target.id,
      strategy: "brief",
      name: "Built-in, brief only",
      systemPrompt: target.brief.systemPrompt,
      editable: false,
    },
  ]
}
