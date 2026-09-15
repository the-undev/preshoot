import { useState } from "react"
import {
  Button,
  FieldHelp,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@renderer/design-system"
import {
  assetImageUrl,
  type AspectRatio,
  type Asset,
  type AssetImage,
  type ClipComposition,
  type FrameComposition,
  type Vocabularies,
} from "@renderer/lib/trpc"
import { clipReadiness } from "./readiness"
import { ClipSpeakers, type SpeakerFields } from "./clip-speakers"
import { ResolutionPicker } from "./resolution-picker"
import { ShotList } from "./shot-list"
import type { ClipFields, ShotFields } from "./use-clip"

/** How long a clip may run before the target model stops being able to hold it. */
const MAX_CLIP_SECONDS = 15

/** Stands for "no picture", since a picker cannot hold an empty value. */
const NO_FRAME = "none"

/** What each form is called on screen. */
const FORM_NAMES = [
  { id: "t2v", name: "Text to video (t2va)" },
  { id: "i2v", name: "Image to video (i2va)" },
  { id: "fl2v", name: "First and last frame (fl2va)" },
  { id: "l2v", name: "Last frame (l2va)" },
] as const

/** Which forms anchor to a picture at which end. */
const FRAME_ROLES = [
  { role: "first" as const, label: "Opens on", forms: ["i2v", "fl2v"] },
  { role: "last" as const, label: "Ends on", forms: ["fl2v", "l2v"] },
]

interface ClipEditorProps {
  composition: ClipComposition
  vocabularies: Vocabularies
  library: Asset[]
  libraryImages: AssetImage[]
  aspectRatios: AspectRatio[]
  isSaving: boolean
  onClipChange: (fields: ClipFields) => void
  onAddShot: () => void
  onShotChange: (shotId: number, fields: ShotFields) => void
  onMoveShot: (shotId: number, toPosition: number) => void
  onRemoveShot: (shotId: number) => void
  onAddSpeaker: (fields: SpeakerFields) => void
  onUpdateSpeaker: (speakerId: number, fields: SpeakerFields) => void
  onRemoveSpeaker: (speakerId: number) => void
  onSetFrame: (role: "first" | "last", imageId: number | null) => void
  onAddPeople: () => void
}

/** One clip: its own fields, its voices and its shots. The prompt is written from them as they change. */
export function ClipEditor({
  composition,
  vocabularies,
  library,
  libraryImages,
  aspectRatios,
  isSaving,
  onClipChange,
  onAddShot,
  onShotChange,
  onMoveShot,
  onRemoveShot,
  onAddSpeaker,
  onUpdateSpeaker,
  onRemoveSpeaker,
  onSetFrame,
  onAddPeople,
}: ClipEditorProps): React.JSX.Element {
  const [style, setStyle] = useState(composition.style)
  const [note, setNote] = useState(composition.note)
  const [musicNote, setMusicNote] = useState(composition.musicNote)

  const seconds = composition.shots.reduce((total, shot) => total + shot.durationMs, 0) / 1000
  const tooLong = seconds > MAX_CLIP_SECONDS
  const missing = clipReadiness(composition)

  function commit(over: Partial<ClipFields>): void {
    onClipChange({
      style,
      note,
      musicNote,
      form: composition.form,
      shortEdge: composition.shortEdge,
      aspectRatio: composition.aspectRatio,
      ...over,
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Output</h2>

        <div className="flex flex-wrap gap-3 sm:items-end">
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor="clip-form">Generation type</Label>
            <Select
              value={composition.form}
              onValueChange={(value) => commit({ form: value as ClipFields["form"] })}
            >
              <SelectTrigger id="clip-form" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORM_NAMES.map((form) => (
                  <SelectItem key={form.id} value={form.id}>
                    {form.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="clip-style">Style</Label>
              <FieldHelp label="the style">
                How the whole clip looks, written at the front of the prompt. Live-action,
                cinematic, 2D-animated, 3D CG, claymation, watercolor and vintage film are the ones
                the model names.
              </FieldHelp>
            </div>
            <Input
              id="clip-style"
              className="w-64"
              list="clip-style-options"
              value={style}
              onChange={(event) => setStyle(event.target.value)}
              onBlur={() => commit({ style })}
            />
            <datalist id="clip-style-options">
              {vocabularies.styles.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>

          {FRAME_ROLES.filter((role) => role.forms.includes(composition.form)).map((role) => (
            <ClipFrame
              key={role.role}
              role={role.role}
              label={role.label}
              frame={composition.frames.find((frame) => frame.role === role.role) ?? null}
              library={libraryImages}
              onChoose={(imageId) => onSetFrame(role.role, imageId)}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Resolution</h2>
        <ResolutionPicker
          shapes={aspectRatios}
          aspectRatio={composition.aspectRatio}
          shortEdge={composition.shortEdge}
          onChange={commit}
        />
      </section>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="clip-music">Music</Label>
          <FieldHelp label="music">
            Music only the audience hears, which the model takes as its own field. Instrumentation,
            tempo and how it changes. Music playing in the scene itself belongs in the sound of a
            shot instead.
          </FieldHelp>
        </div>
        <Input
          id="clip-music"
          value={musicNote}
          onChange={(event) => setMusicNote(event.target.value)}
          onBlur={() => commit({ musicNote })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="clip-note">Note</Label>
          <FieldHelp label="the note">
            For you, not for the model. It is never written into the prompt, and it travels beside
            the prompt when the clip is exported.
          </FieldHelp>
        </div>
        <Textarea
          id="clip-note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => commit({ note })}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Speakers</h2>
        <p className="text-xs text-muted-foreground">
          Anyone who speaks or sings. Each becomes a voice the prompt refers to as (S1), (S2) and so
          on, described once so it stays the same across shots.
        </p>
        <ClipSpeakers
          speakers={composition.speakers}
          library={library}
          onAdd={onAddSpeaker}
          onUpdate={onUpdateSpeaker}
          onRemove={onRemoveSpeaker}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">Shots</h2>
          <p className={tooLong ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {tooLong
              ? `${seconds.toFixed(1)}s, longer than the ${MAX_CLIP_SECONDS}s a clip can run`
              : `${seconds.toFixed(1)}s of ${MAX_CLIP_SECONDS}s`}
          </p>
        </div>

        <ShotList
          shots={composition.shots}
          speakers={composition.speakers}
          library={library}
          vocabularies={vocabularies}
          onChange={onShotChange}
          onMove={onMoveShot}
          onRemove={onRemoveShot}
          onAddPeople={onAddPeople}
        />

        <div>
          <Button variant="outline" onClick={onAddShot} disabled={isSaving}>
            Add shot
          </Button>
        </div>
      </section>

      {missing.length > 0 && (
        <ul className="flex flex-col gap-1">
          {missing.map((reason) => (
            <li key={reason} className="text-xs text-destructive">
              {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface ClipFrameProps {
  role: "first" | "last"
  label: string
  frame: FrameComposition | null
  library: AssetImage[]
  onChoose: (imageId: number | null) => void
}

/** The picture one end of the clip is anchored to, chosen from the library's pictures. */
function ClipFrame({ role, label, frame, library, onChoose }: ClipFrameProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={`clip-frame-${role}`}>{label}</Label>
      <div className="flex min-w-0 items-center gap-2">
        {frame && (
          <img
            src={assetImageUrl(frame.imageId)}
            alt={`${label} picture`}
            className="size-10 rounded border object-cover"
          />
        )}
        <Select
          value={frame ? String(frame.imageId) : ""}
          onValueChange={(value) => onChoose(value === NO_FRAME ? null : Number(value))}
        >
          <SelectTrigger id={`clip-frame-${role}`} className="w-44 min-w-0">
            <SelectValue placeholder="Choose a picture" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FRAME}>None</SelectItem>
            {library.map((image) => (
              <SelectItem key={image.id} value={String(image.id)}>
                {image.fileName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
