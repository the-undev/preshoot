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
import type { Asset, ClipComposition, PromptVariant, Vocabularies } from "@renderer/lib/trpc"
import { ClipSpeakers } from "./clip-speakers"
import { ShotList } from "./shot-list"
import type { ClipFields, ShotFields } from "./use-clip"
import type { ComposerOption } from "./use-generate-clip"

/** How long a clip may run before the target model stops being able to hold it. */
const MAX_CLIP_SECONDS = 15

interface ClipEditorProps {
  composition: ClipComposition
  vocabularies: Vocabularies
  library: Asset[]
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
  onGenerate: () => void
  onRegenerateShot: (shotId: number) => void
}

/** One clip: its own fields, its voices, its shots, and the button that writes it. */
export function ClipEditor({
  composition,
  vocabularies,
  library,
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
  onGenerate,
  onRegenerateShot,
}: ClipEditorProps): React.JSX.Element {
  const [name, setName] = useState(composition.name)
  const [style, setStyle] = useState(composition.style)
  const [note, setNote] = useState(composition.note)
  const [musicNote, setMusicNote] = useState(composition.musicNote)

  const seconds = composition.shots.reduce((total, shot) => total + shot.durationMs, 0) / 1000
  const tooLong = seconds > MAX_CLIP_SECONDS

  function commit(over: Partial<ClipFields>): void {
    onClipChange({ name, style, note, musicNote, ...over })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="clip-name">Clip</Label>
          <Input
            id="clip-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => commit({ name })}
          />
        </div>
        <div className="flex flex-col gap-1">
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

      <section className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="clip-composer">Written by</Label>
          <Select value={composerId} onValueChange={onChooseComposer}>
            <SelectTrigger id="clip-composer" className="w-64">
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
        <div className="flex flex-col gap-1">
          <Label htmlFor="clip-variant">Prompt</Label>
          <Select value={variantId ?? variants[0]?.id ?? ""} onValueChange={onChooseVariant}>
            <SelectTrigger id="clip-variant" className="w-64">
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
        <Button onClick={onGenerate} disabled={isGenerating || composition.shots.length === 0}>
          {isGenerating ? "Generating…" : "Generate"}
        </Button>
        {!hasModel && (
          <p className="pb-2 text-xs text-destructive">
            No model chosen. Open settings, press Check, and pick one.
          </p>
        )}
      </section>
    </div>
  )
}
