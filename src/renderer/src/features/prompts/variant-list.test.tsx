import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { PromptVariant } from "@renderer/lib/trpc"
import { VariantList } from "./variant-list"

const variants: PromptVariant[] = [
  {
    id: "builtin:minimax-h3:prose",
    targetId: "minimax-h3",
    strategy: "prose",
    name: "Built-in, prose per shot",
    systemPrompt: "You write the prose of each shot.",
    editable: false,
  },
  {
    id: "stored:1",
    targetId: "minimax-h3",
    strategy: "prose",
    name: "Terser",
    systemPrompt: "Write it shorter.",
    editable: true,
  },
]

describe("VariantList", () => {
  it("marks the prompts that ship with the target", () => {
    render(
      <VariantList
        variants={variants}
        selectedId={null}
        onSelect={vi.fn()}
        onCopy={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(screen.getByText(/built in/)).toBeInTheDocument()
    expect(screen.getByText("Terser")).toBeInTheDocument()
  })

  it("will not delete a prompt that ships with the target", () => {
    render(
      <VariantList
        variants={variants}
        selectedId={null}
        onSelect={vi.fn()}
        onCopy={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(screen.getByRole("button", { name: "Delete Built-in, prose per shot" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Delete Terser" })).toBeEnabled()
  })

  it("reports the prompt to copy", () => {
    const onCopy = vi.fn()
    render(
      <VariantList
        variants={variants}
        selectedId={null}
        onSelect={vi.fn()}
        onCopy={onCopy}
        onRemove={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Copy Built-in, prose per shot" }))

    expect(onCopy).toHaveBeenCalledWith(variants[0])
  })

  it("reports the prompt to remove", () => {
    const onRemove = vi.fn()
    render(
      <VariantList
        variants={variants}
        selectedId="stored:1"
        onSelect={vi.fn()}
        onCopy={vi.fn()}
        onRemove={onRemove}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Delete Terser" }))

    expect(onRemove).toHaveBeenCalledWith("stored:1")
  })
})
