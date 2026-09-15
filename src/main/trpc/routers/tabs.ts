import { z } from "zod"
import {
  activateTab,
  closeTab,
  moveTab,
  openClipInTab,
  openEmptyTab,
  readWorkspace,
  reopenClosedTab,
  showClipListInTab,
} from "../../core/composition/tab-store"
import { asClientError } from "../client-errors"
import { requireOpenProject, requireProject } from "../project"
import { publicProcedure, router } from "../trpc"

const tabId = z.number().int()

export const tabsRouter = router({
  /** Every open tab and which one is being looked at. */
  list: publicProcedure.query(({ ctx }) => readWorkspace(requireProject(ctx))),

  /** Opens a clip, bringing it forward when it is already open and filling an empty tab in place. */
  openClip: publicProcedure
    .input(z.object({ clipId: z.number().int() }))
    .mutation(({ ctx, input }) => {
      try {
        return openClipInTab(requireProject(ctx), input.clipId)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Opens an empty tab, which shows the list of clips. */
  openEmpty: publicProcedure.mutation(({ ctx }) => openEmptyTab(requireProject(ctx))),

  /** Puts the list of clips back into a tab, in place of the clip it held. */
  showClipList: publicProcedure.input(z.object({ tabId })).mutation(({ ctx, input }) => {
    try {
      return showClipListInTab(requireProject(ctx), input.tabId)
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Looks at one of the open tabs. */
  activate: publicProcedure.input(z.object({ tabId })).mutation(({ ctx, input }) => {
    try {
      return activateTab(requireProject(ctx), input.tabId)
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Opens the last tab to close again, when the clip it held is still in the project. */
  reopenClosed: publicProcedure.mutation(({ ctx }) => reopenClosedTab(requireProject(ctx))),

  /** Puts a tab at `toPosition`, sliding the others around it. */
  move: publicProcedure
    .input(z.object({ tabId, toPosition: z.number().int().min(0) }))
    .mutation(({ ctx, input }) => {
      try {
        return moveTab(requireProject(ctx), input.tabId, input.toPosition)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Closes a tab and looks at whichever took its place. */
  close: publicProcedure.input(z.object({ tabId })).mutation(({ ctx, input }) => {
    const project = requireOpenProject(ctx)
    try {
      return closeTab(project.db, project.directory, input.tabId)
    } catch (error) {
      asClientError(error)
    }
  }),
})
