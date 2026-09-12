import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { TooltipProvider } from "@renderer/design-system"
import type { RouterContext } from "@renderer/lib/router-context"

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

function RootLayout(): React.JSX.Element {
  return (
    <TooltipProvider>
      <Outlet />
      {import.meta.env.DEV && (
        <>
          <TanStackRouterDevtools position="bottom-right" />
          <ReactQueryDevtools buttonPosition="bottom-left" />
        </>
      )}
    </TooltipProvider>
  )
}
