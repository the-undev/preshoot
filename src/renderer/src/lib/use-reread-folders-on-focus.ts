import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { useTRPC } from "./trpc"

/**
 * Reads the workflows folder, the library folder and the open workflow's source again whenever
 * the window gains focus, so a change made in another program shows on coming back.
 */
export function useRereadFoldersOnFocus(): void {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  useEffect(() => {
    const reread = (): void => {
      for (const queryKey of [
        trpc.workflows.files.pathKey(),
        trpc.library.entries.pathKey(),
        trpc.workflows.checkSource.pathKey(),
      ]) {
        void queryClient.invalidateQueries({ queryKey })
      }
    }
    window.addEventListener("focus", reread)
    return () => window.removeEventListener("focus", reread)
  }, [trpc, queryClient])
}
