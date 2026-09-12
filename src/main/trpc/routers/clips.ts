import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  clipIdOfShot,
  clipIdOfSpeaker,
  deleteClip,
  deleteShot,
  deleteSpeaker,
  insertClip,
  insertShot,
  insertSpeaker,
  listClips,
  moveShot,
  readClip,
  readComposition,
  setShotDialogue,
  setShotThings,
  updateClip,
  updateShot,
  updateSpeaker,
} from "../../core/composition/clip-store"
import type { ProjectDatabase } from "../../core/db"
import type { PromptTarget } from "../../core/prompting/target"
import { DEFAULT_TARGET_ID, targetById } from "../../core/prompting/targets"
import { asClientError } from "../client-errors"
import { requireProject } from "../project"
import { publicProcedure, router } from "../trpc"

/** The style a new clip starts on, which the guide's own example uses. */
const DEFAULT_STYLE = "Live-action, cinematic"

const clipId = z.number().int()
const shotId = z.number().int()
const description = z.string().trim().min(1)

const shotInput = z.object({
  shotId,
  durationMs: z.number().int().min(100).max(60_000),
  cameraMotion: z.string().nullable(),
  amplitude: z.string().nullable(),
  speed: z.string().nullable(),
  transition: z.string().nullable(),
  lighting: z.string().nullable(),
  action: z.string().trim(),
  soundNote: z.string().trim(),
  things: z.array(z.number().int()),
  dialogue: z.array(
    z.object({
      speakerId: z.number().int(),
      language: z.string().trim().min(1),
      text: z.string().trim().min(1),
    })
  ),
})

/** The target a clip is written for. */
function targetOfClip(db: ProjectDatabase, id: number): PromptTarget {
  return targetById(readClip(db, id).target)
}

/** Refuses a word the target does not know, so nothing outside its grammar reaches the model. */
function fromVocabulary(
  allowed: readonly string[],
  value: string | null,
  what: string
): string | null {
  if (value === null || allowed.includes(value)) {
    return value
  }
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `"${value}" is not a ${what} this target knows.`,
  })
}

export const clipsRouter = router({
  /** The project's clips, newest first. */
  list: publicProcedure.query(({ ctx }) => listClips(requireProject(ctx))),

  /** Starts a clip with no shots. */
  create: publicProcedure
    .input(z.object({ name: z.string().trim().min(1) }))
    .mutation(({ ctx, input }) =>
      insertClip(requireProject(ctx), {
        name: input.name,
        target: DEFAULT_TARGET_ID,
        style: DEFAULT_STYLE,
      })
    ),

  /** Rewrites the clip's own fields. */
  update: publicProcedure
    .input(
      z.object({
        id: clipId,
        name: z.string().trim().min(1),
        style: z.string().trim().min(1),
        note: z.string().trim(),
        musicNote: z.string().trim(),
      })
    )
    .mutation(({ ctx, input }) => {
      try {
        return updateClip(requireProject(ctx), input)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Removes a clip and everything under it, saying how many prompts went with it. */
  remove: publicProcedure.input(z.object({ id: clipId })).mutation(({ ctx, input }) => {
    try {
      return { prompts: deleteClip(requireProject(ctx), input.id) }
    } catch (error) {
      asClientError(error)
    }
  }),

  /** The whole clip: its speakers, its shots, what they show and what is said. */
  composition: publicProcedure.input(z.object({ clipId })).query(({ ctx, input }) => {
    try {
      return readComposition(requireProject(ctx), input.clipId)
    } catch (error) {
      asClientError(error)
    }
  }),

  /** The words this clip's target accepts, for the pickers in the editor. */
  vocabularies: publicProcedure.input(z.object({ clipId })).query(({ ctx, input }) => {
    try {
      return targetOfClip(requireProject(ctx), input.clipId).vocabularies
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Adds an empty shot at the end of the clip. */
  addShot: publicProcedure.input(z.object({ clipId })).mutation(({ ctx, input }) => {
    const db = requireProject(ctx)
    try {
      insertShot(db, input.clipId)
      return readComposition(db, input.clipId)
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Rewrites one shot, the things it shows and what is said in it. */
  updateShot: publicProcedure.input(shotInput).mutation(({ ctx, input }) => {
    const db = requireProject(ctx)
    try {
      const id = clipIdOfShot(db, input.shotId)
      const { vocabularies } = targetOfClip(db, id)
      updateShot(db, {
        id: input.shotId,
        durationMs: input.durationMs,
        cameraMotion: fromVocabulary(
          vocabularies.cameraMotions,
          input.cameraMotion,
          "camera motion"
        ),
        amplitude: fromVocabulary(vocabularies.amplitudes, input.amplitude, "camera amplitude"),
        speed: fromVocabulary(vocabularies.speeds, input.speed, "camera speed"),
        transition: fromVocabulary(vocabularies.transitions, input.transition, "transition"),
        lighting: input.lighting,
        action: input.action,
        soundNote: input.soundNote,
      })
      setShotThings(db, input.shotId, input.things)
      setShotDialogue(db, input.shotId, input.dialogue)
      return readComposition(db, id)
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Puts a shot at `toPosition`, sliding the others around it. */
  moveShot: publicProcedure
    .input(z.object({ shotId, toPosition: z.number().int().min(0) }))
    .mutation(({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        const id = clipIdOfShot(db, input.shotId)
        moveShot(db, input.shotId, input.toPosition)
        return readComposition(db, id)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Removes a shot and closes the gap it leaves. */
  removeShot: publicProcedure.input(z.object({ shotId })).mutation(({ ctx, input }) => {
    const db = requireProject(ctx)
    try {
      const id = clipIdOfShot(db, input.shotId)
      deleteShot(db, input.shotId)
      return readComposition(db, id)
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Adds a voice to the clip. */
  addSpeaker: publicProcedure
    .input(z.object({ clipId, description }))
    .mutation(({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        insertSpeaker(db, input.clipId, input.description)
        return readComposition(db, input.clipId)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Rewrites how a voice is described. */
  updateSpeaker: publicProcedure
    .input(z.object({ speakerId: z.number().int(), description }))
    .mutation(({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        const id = clipIdOfSpeaker(db, input.speakerId)
        updateSpeaker(db, input.speakerId, input.description)
        return readComposition(db, id)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Removes a voice and everything it said. */
  removeSpeaker: publicProcedure
    .input(z.object({ speakerId: z.number().int() }))
    .mutation(({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        const id = clipIdOfSpeaker(db, input.speakerId)
        deleteSpeaker(db, input.speakerId)
        return readComposition(db, id)
      } catch (error) {
        asClientError(error)
      }
    }),
})
