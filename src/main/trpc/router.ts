import { initTRPC } from "@trpc/server"
import { z } from "zod"
import type { Context } from "./context"

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure

const systemRouter = router({
  /** Runtime versions of the running app. */
  info: publicProcedure.query(({ ctx }) => ctx.versions),
  /** Round-trips a string, used to prove the renderer to main link works. */
  echo: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => ({ text: input.text })),
})

export const appRouter = router({
  system: systemRouter,
})

export type AppRouter = typeof appRouter
