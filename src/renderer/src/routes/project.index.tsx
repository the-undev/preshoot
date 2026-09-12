import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/project/")({
  component: Clips,
})

function Clips(): React.JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">The clip editor arrives next.</p>
    </main>
  )
}
