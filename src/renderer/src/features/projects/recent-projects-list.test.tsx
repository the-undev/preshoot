import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { RecentProject } from "@renderer/lib/trpc"
import { RecentProjectsList } from "./recent-projects-list"

const projects: RecentProject[] = [
  { directory: "/films/first", name: "First film", lastOpenedAt: "2026-09-11T19:00:00.000Z" },
  { directory: "/films/second", name: "Second film", lastOpenedAt: "2026-09-10T19:00:00.000Z" },
]

describe("RecentProjectsList", () => {
  it("shows each project's name and folder", () => {
    render(<RecentProjectsList projects={projects} onOpen={vi.fn()} />)

    expect(screen.getByText("First film")).toBeInTheDocument()
    expect(screen.getByText("/films/first")).toBeInTheDocument()
    expect(screen.getByText("Second film")).toBeInTheDocument()
    expect(screen.getByText("/films/second")).toBeInTheDocument()
  })

  it("reports the folder of the project that was clicked", () => {
    const onOpen = vi.fn()
    render(<RecentProjectsList projects={projects} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole("button", { name: /Second film/ }))

    expect(onOpen).toHaveBeenCalledWith("/films/second")
  })

  it("says so when there is nothing to list", () => {
    render(<RecentProjectsList projects={[]} onOpen={vi.fn()} />)

    expect(screen.getByText("No projects opened yet.")).toBeInTheDocument()
  })
})
