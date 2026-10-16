import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useTRPC,
  useTRPCClient,
  type Configuration,
  type LoadedConfiguration,
  type RunBinding,
} from "@renderer/lib/trpc"

/** A workflow's configurations and the calls that save, load and change them. */
export interface ConfigurationsPanel {
  configurations: Configuration[]
  load(configurationId: number): Promise<LoadedConfiguration>
  saveNew(name: string, bindings: RunBinding[]): Promise<Configuration>
  update(configurationId: number, bindings: RunBinding[]): Promise<Configuration>
  rename(configurationId: number, name: string): void
  duplicate(configurationId: number): void
  remove(configurationId: number): void
  errorMessage: string | null
}

/** Lists a workflow's configurations and changes them, keeping the list and the runs current. */
export function useConfigurations(workflowId: number): ConfigurationsPanel {
  const trpc = useTRPC()
  const client = useTRPCClient()
  const queryClient = useQueryClient()
  const list = useQuery(trpc.configurations.list.queryOptions({ workflowId }))
  // The run list shows each run's configuration by name, so it is read again too.
  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: trpc.configurations.list.pathKey() })
    await queryClient.invalidateQueries({ queryKey: trpc.runs.list.pathKey() })
  }
  const save = useMutation(trpc.configurations.save.mutationOptions({ onSuccess: refresh }))
  const update = useMutation(trpc.configurations.update.mutationOptions({ onSuccess: refresh }))
  const rename = useMutation(trpc.configurations.rename.mutationOptions({ onSuccess: refresh }))
  const duplicate = useMutation(
    trpc.configurations.duplicate.mutationOptions({ onSuccess: refresh })
  )
  const remove = useMutation(trpc.configurations.delete.mutationOptions({ onSuccess: refresh }))

  return {
    configurations: list.data ?? [],
    load: (configurationId) => client.configurations.load.query({ configurationId }),
    saveNew: (name, bindings) => save.mutateAsync({ workflowId, name, bindings }),
    update: (configurationId, bindings) => update.mutateAsync({ configurationId, bindings }),
    rename: (configurationId, name) => rename.mutate({ configurationId, name }),
    duplicate: (configurationId) => duplicate.mutate({ configurationId }),
    remove: (configurationId) => remove.mutate({ configurationId }),
    errorMessage:
      rename.error?.message ??
      duplicate.error?.message ??
      remove.error?.message ??
      list.error?.message ??
      null,
  }
}
