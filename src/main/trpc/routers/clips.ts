import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { ASPECT_RATIOS } from "../../core/composition/aspect"
import { CLIP_FORMS, LINE_KINDS, type ClipForm, type LineKind } from "../../core/composition/clip"
import {
  branchClip,
  clearClipFrame,
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
  saveClip,
  setShotLines,
  setShotThings,
  updateClip,
  updateShot,
  setClipFrame,
  updateSpeaker,
} from "../../core/composition/clip-store"
import type { ProjectDatabase } from "../../core/db"
import { composeClip } from "../../core/prompting/compose"
import type { PromptTarget } from "../../core/prompting/target"
import { DEFAULT_TARGET_ID, targetById } from "../../core/prompting/targets"
import { asClientError } from "../client-errors"
import { requireProject } from "../project"
import { publicProcedure, router } from "../trpc"

/** The style a new clip starts on, which the guide's own example uses. */
const DEFAULT_STYLE = "Live-action, cinematic"

const clipId = z.number().int()
const shotId = z.number().int()

/**
 * Nothing the editor writes as it is typed is trimmed. Trimming runs on every keystroke, so a
 * space typed at the end of a word never survives the round trip and cannot be typed at all.
 * What is written is trimmed where it is used instead.
 */
const shotInput = z.object({
  shotId,
  durationMs: z.number().int().min(100).max(60_000),
  cameraMotion: z.string().nullable(),
  amplitude: z.string().nullable(),
  speed: z.string().nullable(),
  transition: z.string().nullable(),
  lighting: z.string().nullable(),
  soundNote: z.string(),
  things: z.array(z.number().int()),
  lines: z.array(
    z.object({
      kind: z.enum(LINE_KINDS as [LineKind, ...LineKind[]]),
      assetId: z.number().int().nullable(),
      speakerIds: z.array(z.number().int()),
      text: z.string(),
      language: z.string().nullable(),
      offScreen: z.boolean(),
      crossesCut: z.boolean(),
      cutOff: z.boolean(),
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
  /** The project's saved clips, newest first. */
  list: publicProcedure.query(({ ctx }) => listClips(requireProject(ctx))),

  /** Starts a scratch clip, which has no name until it is saved. */
  create: publicProcedure.mutation(({ ctx }) => {
    const db = requireProject(ctx)
    // Every clip needs a shot, so it starts with one rather than with a button to add one.
    const clip = insertClip(db, { name: null, target: DEFAULT_TARGET_ID, style: DEFAULT_STYLE })
    insertShot(db, clip.id)
    return readClip(db, clip.id)
  }),

  /** Copies a clip into a new scratch one, leaving the clip it came from alone. */
  branch: publicProcedure.input(z.object({ id: clipId })).mutation(({ ctx, input }) => {
    try {
      return branchClip(requireProject(ctx), input.id)
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Saves a clip under a name, which is what puts it in the project's list. */
  save: publicProcedure
    .input(z.object({ id: clipId, name: z.string().trim().min(1) }))
    .mutation(({ ctx, input }) => {
      try {
        return saveClip(requireProject(ctx), input.id, input.name)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Rewrites the clip's own fields. */
  update: publicProcedure
    .input(
      z.object({
        id: clipId,
        style: z.string(),
        note: z.string(),
        musicNote: z.string(),
        form: z.enum(CLIP_FORMS as [ClipForm, ...ClipForm[]]),
        shortEdge: z.number().int().min(128).max(4096),
        aspectRatio: z.enum(ASPECT_RATIOS.map((entry) => entry.value) as [string, ...string[]]),
        language: z.string().trim().min(1),
      })
    )
    .mutation(({ ctx, input }) => {
      try {
        return updateClip(requireProject(ctx), input)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Removes a clip and everything under it. */
  remove: publicProcedure.input(z.object({ id: clipId })).mutation(({ ctx, input }) => {
    try {
      deleteClip(requireProject(ctx), input.id)
      return { id: input.id }
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

  /**
   * The prompt this clip makes. Writing it calls no model, so it is read back after every change
   * rather than produced on demand.
   */
  prompt: publicProcedure.input(z.object({ clipId })).query(({ ctx, input }) => {
    try {
      const db = requireProject(ctx)
      return composeClip(readComposition(db, input.clipId), targetOfClip(db, input.clipId))
    } catch (error) {
      asClientError(error)
    }
  }),

  /** The shapes a clip can be generated at, for the picker in the editor. */
  aspectRatios: publicProcedure.query(() => ASPECT_RATIOS),

  /** The words this clip's target accepts, for the pickers in the editor. */
  vocabularies: publicProcedure.input(z.object({ clipId })).query(({ ctx, input }) => {
    try {
      return targetOfClip(requireProject(ctx), input.clipId).vocabularies
    } catch (error) {
      asClientError(error)
    }
  }),

  /** Anchors one end of the clip to a picture, or takes the picture off it. */
  setFrame: publicProcedure
    .input(
      z.object({
        clipId,
        role: z.enum(["first", "last"]),
        imageId: z.number().int().nullable(),
      })
    )
    .mutation(({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        if (input.imageId === null) {
          clearClipFrame(db, { clipId: input.clipId, role: input.role })
        } else {
          setClipFrame(db, { clipId: input.clipId, role: input.role, imageId: input.imageId })
        }
        return readComposition(db, input.clipId)
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
        soundNote: input.soundNote,
      })
      setShotThings(db, input.shotId, input.things)
      setShotLines(db, input.shotId, input.lines)
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
    .input(z.object({ clipId, assetId: z.number().int().nullable(), description: z.string() }))
    .mutation(({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        insertSpeaker(db, input.clipId, {
          assetId: input.assetId,
          description: input.description,
        })
        return readComposition(db, input.clipId)
      } catch (error) {
        asClientError(error)
      }
    }),

  /** Rewrites how a voice is described. It may be emptied while it is being retyped. */
  updateSpeaker: publicProcedure
    .input(
      z.object({
        speakerId: z.number().int(),
        assetId: z.number().int().nullable(),
        description: z.string(),
      })
    )
    .mutation(({ ctx, input }) => {
      const db = requireProject(ctx)
      try {
        const id = clipIdOfSpeaker(db, input.speakerId)
        updateSpeaker(db, input.speakerId, {
          assetId: input.assetId,
          description: input.description,
        })
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
