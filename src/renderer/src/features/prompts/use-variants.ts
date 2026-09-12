import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC, type PromptVariant } from "@renderer/lib/trpc"

/** What a system prompt holds, without its id. */
export interface VariantFields {
  strategy: PromptVariant["strategy"]
  name: string
  systemPrompt: string
}

/** The system prompts for one target and the calls that change them. */
export interface VariantsPanel {
  variants: PromptVariant[]
  create(fields: VariantFields): void
  update(id: string, fields: VariantFields): void
  remove(id: string): void
  isSaving: boolean
  errorMessage: string | null
}

/** Reads the prompts that can write for `targetId` and keeps them fresh as they change. */
export function useVariants(targetId: string): VariantsPanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const variants = useQuery(trpc.prompts.variants.queryOptions({ targetId }))

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: trpc.prompts.pathKey() })
  }

  const save = useMutation(trpc.prompts.saveVariant.mutationOptions({ onSuccess: refresh }))
  const remove = useMutation(trpc.prompts.removeVariant.mutationOptions({ onSuccess: refresh }))

  return {
    variants: variants.data ?? [],
    create: (fields) => save.mutate({ id: null, targetId, ...fields }),
    update: (id, fields) => save.mutate({ id, targetId, ...fields }),
    remove: (id) => remove.mutate({ id }),
    isSaving: save.isPending || remove.isPending,
    errorMessage: save.error?.message ?? remove.error?.message ?? null,
  }
}
