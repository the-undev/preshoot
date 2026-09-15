import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useShortcuts, type ShortcutHandlers } from "./use-shortcuts"

function Bound({ handlers }: { handlers: ShortcutHandlers }): React.JSX.Element {
  useShortcuts(handlers)
  return <input aria-label="A field" />
}

describe("useShortcuts", () => {
  it("runs the handler when its keys are pressed", () => {
    const newTab = vi.fn()
    render(<Bound handlers={{ newTab }} />)

    fireEvent.keyDown(window, { key: "t", ctrlKey: true })

    expect(newTab).toHaveBeenCalled()
  })

  it("leaves a shortcut with no handler alone", () => {
    const newTab = vi.fn()
    render(<Bound handlers={{ newTab }} />)

    fireEvent.keyDown(window, { key: "w", ctrlKey: true })

    expect(newTab).not.toHaveBeenCalled()
  })

  it("runs a shortcut with a modifier from inside a field", () => {
    const newTab = vi.fn()
    render(<Bound handlers={{ newTab }} />)

    fireEvent.keyDown(screen.getByLabelText("A field"), { key: "t", ctrlKey: true })

    expect(newTab).toHaveBeenCalled()
  })

  it("does not run a bare shortcut from inside a field", () => {
    const showShortcuts = vi.fn()
    render(<Bound handlers={{ showShortcuts }} />)

    fireEvent.keyDown(screen.getByLabelText("A field"), { key: "?", shiftKey: true })

    expect(showShortcuts).not.toHaveBeenCalled()
  })

  it("runs a bare shortcut from outside a field", () => {
    const showShortcuts = vi.fn()
    render(<Bound handlers={{ showShortcuts }} />)

    fireEvent.keyDown(window, { key: "?", shiftKey: true })

    expect(showShortcuts).toHaveBeenCalled()
  })

  it("stops listening once it is off screen", () => {
    const newTab = vi.fn()
    const view = render(<Bound handlers={{ newTab }} />)

    view.unmount()
    fireEvent.keyDown(window, { key: "t", ctrlKey: true })

    expect(newTab).not.toHaveBeenCalled()
  })
})
