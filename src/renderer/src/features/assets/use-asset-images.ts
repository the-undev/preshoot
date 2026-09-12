import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC, type AssetImage } from "@renderer/lib/trpc"

/** The pictures of the library, and the calls that change them. */
export interface AssetImagesPanel {
  images: AssetImage[]
  imagesOf(assetId: number): AssetImage[]
  add(assetId: number): void
  remove(imageId: number): void
  draft(assetId: number): void
  drafted: string | null
  isAdding: boolean
  isDrafting: boolean
  errorMessage: string | null
  forget(): void
}

/** Reads every picture in the library and keeps them fresh as they change. */
export function useAssetImages(): AssetImagesPanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const images = useQuery(trpc.assets.images.queryOptions())

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: trpc.assets.pathKey() })
  }

  const add = useMutation(trpc.assets.addImages.mutationOptions({ onSuccess: refresh }))
  const remove = useMutation(trpc.assets.removeImage.mutationOptions({ onSuccess: refresh }))
  const draft = useMutation(trpc.assets.draft.mutationOptions())

  return {
    images: images.data ?? [],
    imagesOf: (assetId) => (images.data ?? []).filter((image) => image.assetId === assetId),
    add: (assetId) => add.mutate({ assetId }),
    remove: (imageId) => remove.mutate({ imageId }),
    draft: (assetId) => draft.mutate({ assetId }),
    drafted: draft.data?.description ?? null,
    isAdding: add.isPending || remove.isPending,
    isDrafting: draft.isPending,
    errorMessage: add.error?.message ?? remove.error?.message ?? draft.error?.message ?? null,
    forget: () => draft.reset(),
  }
}
