import { z } from "zod"
import { publicProcedure, router } from "../trpc"

export const systemRouter = router({
  /** Runtime versions of the running app. */
  info: publicProcedure.query(({ ctx }) => ctx.versions),
  /** Round-trips a string, used to prove the renderer to main link works. */
  echo: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => ({ text: input.text })),
})
