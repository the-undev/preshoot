import { fireEvent, render, screen } from "@testing-library/react"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@renderer/design-system"
import { StubTrpcProvider } from "@renderer/lib/stub-trpc"
import { Route as WelcomeRoute } from "@renderer/routes/index"

/** The welcome screen as the app shows it before a project is open, with main stubbed. */
function renderWelcome(): void {
  const root = createRootRoute({ component: Outlet })
  const welcome = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: WelcomeRoute.options.component,
  })
  const router = createRouter({
    routeTree: root.addChildren([welcome]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  render(
    <StubTrpcProvider
      answers={{
        "system.info": { app: "0.1.0", electron: "0", chrome: "0", node: "0" },
        "projects.recent": [],
        "settings.get": {
          llamaServerUrl: "http://127.0.0.1:8080",
          llamaModel: "",
          comfyUiUrl: "http://127.0.0.1:8188",
          workflowsFolder: null,
          libraryFolder: null,
        },
        "settings.models": { state: "unreachable", models: [] },
        "settings.comfyUiStatus": { state: "unreachable" },
      }}
    >
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </StubTrpcProvider>
  )
}

describe("settings from the welcome screen", () => {
  // The router restores scroll on navigation, which jsdom does not implement.
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined)
  })

  it("opens the app settings with the ComfyUI URL before any project is open", async () => {
    renderWelcome()

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }))

    expect(await screen.findByRole("dialog", { name: "App settings" })).toBeInTheDocument()
    expect(await screen.findByLabelText("ComfyUI URL")).toHaveValue("http://127.0.0.1:8188")
  })
})
