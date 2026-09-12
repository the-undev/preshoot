import { useState } from "react"
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/design-system"
import type { DialogueLine, SpeakerComposition } from "@renderer/lib/trpc"

interface ShotDialogueProps {
  shotId: number
  lines: DialogueLine[]
  speakers: SpeakerComposition[]
  onChange: (lines: DialogueLine[]) => void
}

/** What is said in one shot. The words are kept exactly as typed, because the target reproduces them. */
export function ShotDialogue({
  shotId,
  lines,
  speakers,
  onChange,
}: ShotDialogueProps): React.JSX.Element {
  // What is being typed, until it is written and comes back. Writing on every keystroke would put
  // a database round trip between a key and the letter it types. The draft carries the lines it
  // was started from, so what comes back from the project wins without an effect to clear it.
  const [draft, setDraft] = useState<{ from: string; lines: DialogueLine[] } | null>(null)
  const written = JSON.stringify(lines)
  const shown = draft?.from === written ? draft.lines : lines

  const replace = (index: number, line: DialogueLine): void => {
    setDraft({
      from: written,
      lines: shown.map((existing, at) => (at === index ? line : existing)),
    })
  }

  const commit = (): void => {
    if (draft?.from === written) onChange(draft.lines)
  }

  if (speakers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Add a speaker to the clip before writing dialogue.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {shown.map((line, index) => (
        <div key={index} className="flex items-center gap-2">
          <Select
            value={String(line.speakerId)}
            onValueChange={(value) =>
              onChange(
                shown.map((existing, at) =>
                  at === index ? { ...existing, speakerId: Number(value) } : existing
                )
              )
            }
          >
            <SelectTrigger aria-label={`Speaker for line ${index + 1}`} className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {speakers.map((speaker) => (
                <SelectItem key={speaker.id} value={String(speaker.id)}>
                  {speaker.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label={`Language for line ${index + 1}`}
            className="w-28"
            value={line.language}
            onChange={(event) => replace(index, { ...line, language: event.target.value })}
            onBlur={commit}
          />
          <Input
            aria-label={`Line ${index + 1} of shot ${shotId}`}
            value={line.text}
            onChange={(event) => replace(index, { ...line, text: event.target.value })}
            onBlur={commit}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(shown.filter((_, at) => at !== index))}
          >
            Remove
          </Button>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([...shown, { speakerId: speakers[0].id, language: "English", text: "" }])
          }
        >
          Add line
        </Button>
      </div>
    </div>
  )
}
