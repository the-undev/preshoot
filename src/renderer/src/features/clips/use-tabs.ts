import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC, type OpenTab, type Workspace } from "@renderer/lib/trpc"

/** The open tabs and everything that changes them. */
export interface TabPanel {
  tabs: OpenTab[]
  active: OpenTab | null
  errorMessage: string | null
  openClip(clipId: number): void
  openEmpty(): void
  showClipList(): void
  activate(tabId: number): void
  close(tabId: number): void
  reopenClosed(): void
  move(tabId: number, toPosition: number): void
  step(by: number): void
  jumpTo(index: number): void
}

/**
 * Reads the open tabs and writes them back. Every mutation answers with the whole workspace, which
 * goes straight into the cache, so the bar never stitches a partial update together itself.
 */
export function useTabs(): TabPanel {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const options = trpc.tabs.list.queryOptions()
  const workspace = useQuery(options)

  const replace = (next: Workspace): void => {
    queryClient.setQueryData(options.queryKey, next)
  }

  const written = { onSuccess: replace }
  const openClip = useMutation(trpc.tabs.openClip.mutationOptions(written))
  const openEmpty = useMutation(trpc.tabs.openEmpty.mutationOptions(written))
  const showClipList = useMutation(trpc.tabs.showClipList.mutationOptions(written))
  const activate = useMutation(trpc.tabs.activate.mutationOptions(written))
  const close = useMutation(trpc.tabs.close.mutationOptions(written))
  const reopenClosed = useMutation(trpc.tabs.reopenClosed.mutationOptions(written))
  const move = useMutation(trpc.tabs.move.mutationOptions(written))

  const writes = [openClip, openEmpty, showClipList, activate, close, reopenClosed, move]
  const tabs = workspace.data?.tabs ?? []
  const active = tabs.find((tab) => tab.id === workspace.data?.activeTabId) ?? null
  const at = active ? tabs.indexOf(active) : -1

  return {
    tabs,
    active,
    // The message from main already says what the user can do about it.
    errorMessage: writes.map((write) => write.error?.message).find(Boolean) ?? null,
    openClip: (clipId) => openClip.mutate({ clipId }),
    openEmpty: () => openEmpty.mutate(),
    showClipList: () => {
      if (active) showClipList.mutate({ tabId: active.id })
    },
    activate: (tabId) => activate.mutate({ tabId }),
    close: (tabId) => close.mutate({ tabId }),
    reopenClosed: () => reopenClosed.mutate(),
    move: (tabId, toPosition) => move.mutate({ tabId, toPosition }),
    // Stepping wraps around, so holding the shortcut walks the whole bar rather than stopping.
    step: (by) => {
      if (tabs.length < 2 || at === -1) return
      const to = (at + by + tabs.length) % tabs.length
      activate.mutate({ tabId: tabs[to].id })
    },
    jumpTo: (index) => {
      const tab = index < 0 ? tabs[tabs.length - 1] : tabs[index]
      if (tab) activate.mutate({ tabId: tab.id })
    },
  }
}
