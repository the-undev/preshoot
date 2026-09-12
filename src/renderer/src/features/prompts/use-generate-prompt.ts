import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTRPC } from "@renderer/lib/trpc"

/** Generating a prompt: the call, whether it is in flight, and what to show when it fails. */
export interface GeneratePromptAction {
  generate(brief: string): void
  isPending: boolean
  errorMessage: string | null
}

/** Sends a brief to be turned into a prompt and refreshes the project's history when it lands. */
export function useGeneratePrompt(): GeneratePromptAction {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const generate = useMutation(
    trpc.prompts.generate.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.prompts.pathKey() })
      },
    })
  )

  return {
    generate: (brief) => generate.mutate({ brief }),
    isPending: generate.isPending,
    // The message from main already says what the user can do about it.
    errorMessage: generate.error?.message ?? null,
  }
}
