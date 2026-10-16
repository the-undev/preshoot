import { render, screen } from "@testing-library/react"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ProjectNav } from "./project-nav"

/** The nav over the project's screens, at `path`, with every screen it links to standing empty. */
function renderAt(path: string): void {
  const root = createRootRoute({
    component: () => (
      <>
        <ProjectNav />
        <Outlet />
      </>
    ),
  })
  const screens = ["/project", "/project/library", "/project/saved", "/project/workflows"].map(
    (screenPath) =>
      createRoute({ getParentRoute: () => root, path: screenPath, component: () => null })
  )
  const router = createRouter({
    routeTree: root.addChildren(screens),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
}

describe("ProjectNav", () => {
  // The router restores scroll on navigation, which jsdom does not implement.
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
  })

  it("names the user's library Library and the project's starting points Saved", async () => {
    renderAt("/project")

    expect(await screen.findByRole("link", { name: "Library" })).toHaveAttribute(
      "href",
      "/project/library"
    )
    expect(screen.getByRole("link", { name: "Saved" })).toHaveAttribute("href", "/project/saved")
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Clips",
      "Library",
      "Saved",
      "Workflows",
    ])
  })

  it("marks the screen being shown", async () => {
    renderAt("/project/saved")

    expect(await screen.findByRole("link", { name: "Saved" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(screen.getByRole("link", { name: "Library" })).not.toHaveAttribute("aria-current")
    expect(screen.getByRole("link", { name: "Clips" })).not.toHaveAttribute("aria-current")
  })
})
