import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  type AssetImage,
  type ClipComposition,
  type FrameComposition,
  type Vocabularies,
} from "@renderer/lib/trpc"
import { ResolutionPicker } from "./resolution-picker"
import type { ClipFields } from "./use-clip"

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

interface ClipSettingsDialogProps {
  composition: ClipComposition
  vocabularies: Vocabularies
  libraryImages: AssetImage[]
  aspectRatios: AspectRatio[]
  onChange: (fields: ClipFields) => void
  onSetFrame: (role: "first" | "last", imageId: number | null) => void
  onClose: () => void
}

/**
 * Everything a clip is generated at, kept out of the editor because it is set once and then left
 * alone, where the shots are worked on the whole time.
 */
export function ClipSettingsDialog({
  composition,
  vocabularies,
  libraryImages,
  aspectRatios,
  onChange,
  onSetFrame,
  onClose,
}: ClipSettingsDialogProps): React.JSX.Element {
  const [style, setStyle] = useState(composition.style)
  const [language, setLanguage] = useState(composition.language)
  const [note, setNote] = useState(composition.note)
  const [musicNote, setMusicNote] = useState(composition.musicNote)

  function commit(over: Partial<ClipFields>): void {
    onChange({
      style,
      note,
      musicNote,
      form: composition.form,
      shortEdge: composition.shortEdge,
      aspectRatio: composition.aspectRatio,
      language,
      ...over,
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Clip settings</DialogTitle>
          <DialogDescription>
            What this clip is generated at. The shots are edited behind this.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
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

          <div className="flex flex-col gap-2">
            <h3 className="font-heading text-sm font-semibold text-muted-foreground">Resolution</h3>
            <ResolutionPicker
              shapes={aspectRatios}
              aspectRatio={composition.aspectRatio}
              shortEdge={composition.shortEdge}
              onChange={commit}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="clip-style">Style</Label>
                <FieldHelp label="the style">
                  How the whole clip looks, written at the front of the prompt. Live-action,
                  cinematic, 2D-animated, 3D CG, claymation, watercolor and vintage film are the
                  ones the model names.
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

            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="clip-language">Language</Label>
                <FieldHelp label="the language">
                  What is spoken in this clip. A line can name another language of its own when
                  somebody in the clip speaks a different one.
                </FieldHelp>
              </div>
              <Input
                id="clip-language"
                className="w-40"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                onBlur={() => {
                  const typed = language.trim()
                  if (typed.length === 0) {
                    setLanguage(composition.language)
                    return
                  }
                  commit({ language: typed })
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="clip-music">Music</Label>
              <FieldHelp label="music">
                Music only the audience hears, which the model takes as its own field.
                Instrumentation, tempo and how it changes. Music playing in the scene itself belongs
                in the sound of a shot instead.
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
                For you, not for the model. It is never written into the prompt, and it travels
                beside the prompt when the clip is exported.
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
        </div>
      </DialogContent>
    </Dialog>
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
            src={assetImageUrl(frame.imageId, 80)}
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
