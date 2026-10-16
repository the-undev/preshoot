import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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
  onCheckComfyUi: ReturnType<typeof vi.fn>
  onPickWorkflowsFolder: ReturnType<typeof vi.fn>
  onPickLibraryFolder: ReturnType<typeof vi.fn>
  onUnload: ReturnType<typeof vi.fn>
} {
  const onSave = vi.fn()
  const onCheck = vi.fn()
  const onCheckComfyUi = vi.fn()
  const onPickWorkflowsFolder = vi.fn(async () => null)
  const onPickLibraryFolder = vi.fn(async () => null)
  const onUnload = vi.fn()
  render(
    <SettingsForm
      llamaServerUrl="http://127.0.0.1:8080"
      llamaModel=""
      comfyUiUrl="http://127.0.0.1:8188"
      workflowsFolder={null}
      libraryFolder={null}
      models={models}
      checkState={null}
      isChecking={false}
      comfyUiStatus={null}
      isCheckingComfyUi={false}
      comfyUiErrorMessage={null}
      isSaving={false}
      isUnloading={false}
      errorMessage={null}
      onCheck={onCheck}
      onCheckComfyUi={onCheckComfyUi}
      onPickWorkflowsFolder={onPickWorkflowsFolder}
      onPickLibraryFolder={onPickLibraryFolder}
      onUnload={onUnload}
      onSave={onSave}
      onCancel={vi.fn()}
      {...over}
    />
  )
  return { onSave, onCheck, onCheckComfyUi, onPickWorkflowsFolder, onPickLibraryFolder, onUnload }
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
    fireEvent.click(screen.getByRole("button", { name: "Check llama-server" }))

    expect(onCheck).toHaveBeenCalledWith("http://192.168.1.20:9000")
  })

  it("saves the first model when none was saved before", () => {
    const { onSave } = renderForm()

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSave).toHaveBeenCalledWith({
      llamaServerUrl: "http://127.0.0.1:8080",
      llamaModel: "qwen",
      comfyUiUrl: "http://127.0.0.1:8188",
      workflowsFolder: null,
      libraryFolder: null,
    })
  })

  it("saves the model that was chosen", () => {
    const { onSave } = renderForm()

    fireEvent.click(screen.getByRole("button", { name: /^other/ }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSave).toHaveBeenCalledWith({
      llamaServerUrl: "http://127.0.0.1:8080",
      llamaModel: "other",
      comfyUiUrl: "http://127.0.0.1:8188",
      workflowsFolder: null,
      libraryFolder: null,
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

  it("shows the saved ComfyUI URL", () => {
    renderForm({ comfyUiUrl: "http://127.0.0.1:8190" })

    expect(screen.getByLabelText("ComfyUI URL")).toHaveValue("http://127.0.0.1:8190")
  })

  it("saves an edited ComfyUI URL and leaves llama-server as it was", () => {
    const { onSave } = renderForm()

    fireEvent.change(screen.getByLabelText("ComfyUI URL"), {
      target: { value: " http://127.0.0.1:8190 " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        llamaServerUrl: "http://127.0.0.1:8080",
        comfyUiUrl: "http://127.0.0.1:8190",
      })
    )
  })

  it("checks the ComfyUI URL as it stands in the box", () => {
    const { onCheck, onCheckComfyUi } = renderForm()

    fireEvent.change(screen.getByLabelText("ComfyUI URL"), {
      target: { value: "http://127.0.0.1:8190" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Check ComfyUI" }))

    expect(onCheckComfyUi).toHaveBeenCalledWith("http://127.0.0.1:8190")
    expect(onCheck).not.toHaveBeenCalled()
  })

  it("says when ComfyUI does not answer", () => {
    renderForm({ comfyUiStatus: { state: "unreachable" } })

    expect(screen.getByText("No answer from ComfyUI at that URL.")).toBeInTheDocument()
  })

  it("names the ComfyUI version when it answers", () => {
    renderForm({ comfyUiStatus: { state: "reachable", version: "0.39.2" } })

    expect(screen.getByText("ComfyUI 0.39.2 answered.")).toBeInTheDocument()
  })

  it("does not save without a ComfyUI URL", () => {
    renderForm({ comfyUiUrl: "" })

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("shows the saved workflows folder", () => {
    renderForm({ workflowsFolder: "/home/someone/workflows" })

    expect(screen.getByLabelText("Workflows folder")).toHaveValue("/home/someone/workflows")
  })

  it("fills the workflows folder from the picker and saves it", async () => {
    const { onSave, onPickWorkflowsFolder } = renderForm()
    onPickWorkflowsFolder.mockResolvedValue("/home/someone/workflows")

    fireEvent.click(screen.getByRole("button", { name: "Browse for the workflows folder" }))

    await waitFor(() =>
      expect(screen.getByLabelText("Workflows folder")).toHaveValue("/home/someone/workflows")
    )
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ workflowsFolder: "/home/someone/workflows" })
    )
  })

  it("keeps the typed folder when the picker is cancelled", async () => {
    const { onPickWorkflowsFolder } = renderForm({ workflowsFolder: "/kept" })

    fireEvent.click(screen.getByRole("button", { name: "Browse for the workflows folder" }))

    await waitFor(() => expect(onPickWorkflowsFolder).toHaveBeenCalled())
    expect(screen.getByLabelText("Workflows folder")).toHaveValue("/kept")
  })

  it("saves an emptied workflows folder as none", () => {
    const { onSave } = renderForm({ workflowsFolder: "/home/someone/workflows" })

    fireEvent.change(screen.getByLabelText("Workflows folder"), { target: { value: "  " } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ workflowsFolder: null }))
  })

  it("shows the saved library folder", () => {
    renderForm({ libraryFolder: "/home/someone/library" })

    expect(screen.getByLabelText("Library folder")).toHaveValue("/home/someone/library")
  })

  it("fills the library folder from the picker and saves it", async () => {
    const { onSave, onPickLibraryFolder } = renderForm()
    onPickLibraryFolder.mockResolvedValue("/home/someone/library")

    fireEvent.click(screen.getByRole("button", { name: "Browse for the library folder" }))

    await waitFor(() =>
      expect(screen.getByLabelText("Library folder")).toHaveValue("/home/someone/library")
    )
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ libraryFolder: "/home/someone/library" })
    )
  })

  it("saves an emptied library folder as none", () => {
    const { onSave } = renderForm({ libraryFolder: "/home/someone/library" })

    fireEvent.change(screen.getByLabelText("Library folder"), { target: { value: "  " } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ libraryFolder: null }))
  })

  it("asks for a check when it has no models to show", () => {
    renderForm({ models: [] })

    expect(
      screen.getByText("Check the server to see which models it can serve.")
    ).toBeInTheDocument()
  })
})
