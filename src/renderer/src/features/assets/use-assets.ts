import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC, type Asset, type AssetKind } from "@renderer/lib/trpc"

/** What a thing holds, without its id. */
export interface AssetFields {
  kind: AssetKind
  name: string
  description: string
  voice: string | null
}

/** The library and the calls that change it. */
export interface AssetsPanel {
  assets: Asset[]
  create(fields: Omit<AssetFields, "voice">): void
  update(id: number, fields: AssetFields): void
  remove(id: number): void
  isSaving: boolean
  errorMessage: string | null
}

/** Reads the project's library and keeps it fresh as it changes. */
export function useAssets(): AssetsPanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const assets = useQuery(trpc.assets.list.queryOptions())

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: trpc.assets.pathKey() })
  }

  const create = useMutation(trpc.assets.create.mutationOptions({ onSuccess: refresh }))
  const update = useMutation(trpc.assets.update.mutationOptions({ onSuccess: refresh }))
  const remove = useMutation(trpc.assets.remove.mutationOptions({ onSuccess: refresh }))

  return {
    assets: assets.data ?? [],
    create: (fields) => create.mutate(fields),
    update: (id, fields) => update.mutate({ id, ...fields }),
    remove: (id) => remove.mutate({ id }),
    isSaving: create.isPending || update.isPending || remove.isPending,
    // The message from main already says what the user can do about it.
    errorMessage: create.error?.message ?? update.error?.message ?? remove.error?.message ?? null,
  }
}
