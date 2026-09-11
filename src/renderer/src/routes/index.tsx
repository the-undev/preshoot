import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@renderer/design-system"

export const Route = createFileRoute("/")({
  component: WelcomePage,
})

function WelcomePage(): React.JSX.Element {
  return (
    <main className="flex h-screen items-center justify-center">
      <Button>preshoot</Button>
    </main>
  )
}
