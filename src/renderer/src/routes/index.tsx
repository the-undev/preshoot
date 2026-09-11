import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@renderer/design-system"
import { useTRPC } from "@renderer/lib/trpc"

export const Route = createFileRoute("/")({
  component: WelcomePage,
})

function WelcomePage(): React.JSX.Element {
  const trpc = useTRPC()
  const info = useQuery(trpc.system.info.queryOptions())

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4">
      <Button>preshoot</Button>
      <p className="text-muted-foreground text-sm">
        {info.isPending && "Connecting to main process"}
        {info.isError && `Main process unreachable: ${info.error.message}`}
        {info.isSuccess &&
          `app ${info.data.app} · electron ${info.data.electron} · node ${info.data.node}`}
      </p>
    </main>
  )
}
