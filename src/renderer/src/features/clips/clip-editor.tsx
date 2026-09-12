import { useState } from "react"
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@renderer/design-system"
import { SHORT_EDGES } from "./short-edges"
import {
  assetImageUrl,
  type AspectRatio,
  type Asset,
  type AssetImage,
  type ClipComposition,
  type FrameComposition,
  type PromptVariant,
  type Vocabularies,
} from "@renderer/lib/trpc"
import { clipReadiness } from "./readiness"
import { ClipSpeakers } from "./clip-speakers"
import { ShotList } from "./shot-list"
import type { ClipFields, ShotFields } from "./use-clip"
import type { ComposerOption } from "./use-generate-clip"

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
  composers: ComposerOption[]
  composerId: string
  variants: PromptVariant[]
  variantId: string | null
  isSaving: boolean
  isGenerating: boolean
  hasModel: boolean
  canRegenerate: boolean
  onClipChange: (fields: ClipFields) => void
  onAddShot: () => void
  onShotChange: (shotId: number, fields: ShotFields) => void
  onMoveShot: (shotId: number, toPosition: number) => void
  onRemoveShot: (shotId: number) => void
  onAddSpeaker: (description: string) => void
  onUpdateSpeaker: (speakerId: number, description: string) => void
  onRemoveSpeaker: (speakerId: number) => void
  onChooseComposer: (composerId: string) => void
  onChooseVariant: (variantId: string) => void
  onSetFrame: (role: "first" | "last", imageId: number | null) => void
  onOpenSettings: () => void
  onGenerate: () => void
  onRegenerateShot: (shotId: number) => void
}

/** One clip: its own fields, its voices, its shots, and the button that writes it. */
export function ClipEditor({
  composition,
  vocabularies,
  library,
  libraryImages,
  aspectRatios,
  composers,
  composerId,
  variants,
  variantId,
  isSaving,
  isGenerating,
  hasModel,
  canRegenerate,
  onClipChange,
  onAddShot,
  onShotChange,
  onMoveShot,
  onRemoveShot,
  onAddSpeaker,
  onUpdateSpeaker,
  onRemoveSpeaker,
  onChooseComposer,
  onChooseVariant,
  onSetFrame,
  onOpenSettings,
  onGenerate,
  onRegenerateShot,
}: ClipEditorProps): React.JSX.Element {
  const [name, setName] = useState(composition.name)
  const [style, setStyle] = useState(composition.style)
  const [note, setNote] = useState(composition.note)
  const [musicNote, setMusicNote] = useState(composition.musicNote)
  const [shortEdge, setShortEdge] = useState(String(composition.shortEdge))
  const [seed, setSeed] = useState(String(composition.seed))

  const seconds = composition.shots.reduce((total, shot) => total + shot.durationMs, 0) / 1000
  const tooLong = seconds > MAX_CLIP_SECONDS
  const missing = clipReadiness(composition, hasModel)

  // Ctrl and Enter writes the clip from anywhere in the editor, as a desktop app would.
  function onKeyDown(event: React.KeyboardEvent): void {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !isGenerating) {
      event.preventDefault()
      onGenerate()
    }
  }

  function commit(over: Partial<ClipFields>): void {
    onClipChange({
      name,
      style,
      note,
      musicNote,
      form: composition.form,
      shortEdge: composition.shortEdge,
      aspectRatio: composition.aspectRatio,
      seed: composition.seed,
      ...over,
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-6" onKeyDown={onKeyDown}>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="clip-name">Clip</Label>
          <Input
            id="clip-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => commit({ name })}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="clip-style">Style</Label>
          <Input
            id="clip-style"
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
      </div>

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

      <div className="flex flex-wrap gap-3 sm:items-end">
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="clip-shape">Shape</Label>
          <Select
            value={composition.aspectRatio}
            onValueChange={(aspectRatio) => commit({ aspectRatio })}
          >
            <SelectTrigger id="clip-shape" className="w-52 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aspectRatios.map((shape) => (
                <SelectItem key={shape.value} value={shape.value}>
                  {shape.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="clip-short-edge">Short edge</Label>
          <Input
            id="clip-short-edge"
            className="w-28"
            type="number"
            list="clip-short-edges"
            value={shortEdge}
            onChange={(event) => setShortEdge(event.target.value)}
            onBlur={() => {
              const typed = Number(shortEdge)
              if (!Number.isFinite(typed) || typed < 128) {
                setShortEdge(String(composition.shortEdge))
                return
              }
              commit({ shortEdge: Math.round(typed) })
            }}
          />
          <datalist id="clip-short-edges">
            {SHORT_EDGES.map((edge) => (
              <option key={edge} value={edge} />
            ))}
          </datalist>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="clip-seed">Seed</Label>
          <Input
            id="clip-seed"
            className="w-28"
            type="number"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            onBlur={() => {
              const typed = Number(seed)
              if (!Number.isFinite(typed) || typed < 0) {
                setSeed(String(composition.seed))
                return
              }
              commit({ seed: Math.round(typed) })
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="clip-note">Note</Label>
        <Textarea
          id="clip-note"
          rows={2}
          value={note}
          placeholder="A keeper climbs the tower during a storm and lights the lamp."
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => commit({ note })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="clip-music">Music</Label>
        <Input
          id="clip-music"
          value={musicNote}
          placeholder="A slow piano figure, sparse, fading at the end"
          onChange={(event) => setMusicNote(event.target.value)}
          onBlur={() => commit({ musicNote })}
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
          canRegenerate={canRegenerate}
          isBusy={isGenerating}
          onChange={onShotChange}
          onMove={onMoveShot}
          onRemove={onRemoveShot}
          onRegenerate={onRegenerateShot}
        />

        <div>
          <Button variant="outline" onClick={onAddShot} disabled={isSaving}>
            Add shot
          </Button>
        </div>
      </section>

      <section className="sticky bottom-0 -mx-1 flex flex-col gap-2 border-t bg-background px-1 pt-3 pb-1">
        {missing.length > 0 && (
          <ul className="flex flex-col gap-1">
            {missing.map((reason) => (
              <li key={reason} className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-destructive">{reason}</span>
                {reason.startsWith("No model") && (
                  <Button type="button" variant="outline" size="sm" onClick={onOpenSettings}>
                    Open settings
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <Label htmlFor="clip-composer">Written by</Label>
            <Select value={composerId} onValueChange={onChooseComposer}>
              <SelectTrigger id="clip-composer" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {composers.map((composer) => (
                  <SelectItem key={composer.id} value={composer.id}>
                    {composer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <Label htmlFor="clip-variant">Prompt</Label>
            <Select value={variantId ?? variants[0]?.id ?? ""} onValueChange={onChooseVariant}>
              <SelectTrigger id="clip-variant" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {variants.map((variant) => (
                  <SelectItem key={variant.id} value={variant.id}>
                    {variant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="shrink-0"
            onClick={onGenerate}
            disabled={isGenerating || composition.shots.length === 0}
            title="Ctrl and Enter"
          >
            {isGenerating ? "Generating…" : "Generate"}
          </Button>
        </div>
      </section>
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
