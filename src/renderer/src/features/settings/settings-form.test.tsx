import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ServerModel } from "@renderer/lib/trpc"
import { SettingsForm } from "./settings-form"

const models: ServerModel[] = [
  { id: "qwen", state: "loaded", modalities: ["text", "image"] },
  { id: "other", state: "unloaded", modalities: ["text"] },
]

function renderForm(over: Partial<React.ComponentProps<typeof SettingsForm>> = {}): {
  onSave: ReturnType<typeof vi.fn>
  onCheck: ReturnType<typeof vi.fn>
  onUnload: ReturnType<typeof vi.fn>
} {
  const onSave = vi.fn()
  const onCheck = vi.fn()
  const onUnload = vi.fn()
  render(
    <SettingsForm
      llamaServerUrl="http://127.0.0.1:8080"
      llamaModel=""
      models={models}
      checkState={null}
      isChecking={false}
      isSaving={false}
      isUnloading={false}
      errorMessage={null}
      onCheck={onCheck}
      onUnload={onUnload}
      onSave={onSave}
      onCancel={vi.fn()}
      {...over}
    />
  )
  return { onSave, onCheck, onUnload }
}

describe("SettingsForm", () => {
  it("lists the models the server has, with their states", () => {
    renderForm()

    expect(screen.getByText("qwen")).toBeInTheDocument()
    expect(screen.getByText(/^loaded/)).toBeInTheDocument()
    expect(screen.getByText(/sees images/)).toBeInTheDocument()
  })

  it("checks the URL as it stands in the box", () => {
    const { onCheck } = renderForm()

    fireEvent.change(screen.getByLabelText("llama-server URL"), {
      target: { value: " http://192.168.1.20:9000 " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Check" }))

    expect(onCheck).toHaveBeenCalledWith("http://192.168.1.20:9000")
  })

  it("saves the first model when none was saved before", () => {
    const { onSave } = renderForm()

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSave).toHaveBeenCalledWith({
      llamaServerUrl: "http://127.0.0.1:8080",
      llamaModel: "qwen",
    })
  })

  it("saves the model that was chosen", () => {
    const { onSave } = renderForm()

    fireEvent.click(screen.getByRole("button", { name: /^other/ }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSave).toHaveBeenCalledWith({
      llamaServerUrl: "http://127.0.0.1:8080",
      llamaModel: "other",
    })
  })

  it("keeps the saved model when the server offers others", () => {
    const { onSave } = renderForm({ llamaModel: "other" })

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ llamaModel: "other" }))
  })

  it("frees a loaded model and leaves an unloaded one alone", () => {
    const { onUnload } = renderForm()

    expect(screen.getByRole("button", { name: "Unload other" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Unload qwen" }))

    expect(onUnload).toHaveBeenCalledWith("qwen")
  })

  it("says what the check found", () => {
    renderForm({ checkState: "unreachable" })

    expect(screen.getByText("No answer at that URL.")).toBeInTheDocument()
  })

  it("asks for a check when it has no models to show", () => {
    renderForm({ models: [] })

    expect(
      screen.getByText("Check the server to see which models it can serve.")
    ).toBeInTheDocument()
  })
})
