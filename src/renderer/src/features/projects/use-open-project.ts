import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useTRPC, type TrpcError } from "@renderer/lib/trpc"

/** Opening a project folder: the call, whether it is in flight, and the last failure. */
export interface OpenProjectAction {
  open(directory: string): void
  isPending: boolean
  error: TrpcError | null
}

/** Opens a project folder and moves to the workspace. Shared by the button, the drop zone and the recent list. */
export function useOpenProject(): OpenProjectAction {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const open = useMutation(
    trpc.projects.open.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.projects.pathKey() })
        await navigate({ to: "/project" })
      },
    })
  )

  return {
    open: (directory) => open.mutate({ directory }),
    isPending: open.isPending,
    error: open.error,
  }
}
