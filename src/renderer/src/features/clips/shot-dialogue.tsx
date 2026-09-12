import { useState } from "react"
import { Button, Checkbox, Input, Label } from "@renderer/design-system"
import type { DialogueLine, SpeakerComposition } from "@renderer/lib/trpc"
import { Chip } from "./chip"

/** What can be said about a line beyond who says it and what it says. */
const FLAGS = [
  { key: "offScreen", label: "Off screen" },
  { key: "crossesCut", label: "Carries across the cut" },
  { key: "cutOff", label: "Cut off by the end" },
] as const

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

  const write = (index: number, line: DialogueLine): void => {
    onChange(shown.map((existing, at) => (at === index ? line : existing)))
  }

  if (speakers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Add a speaker to the clip before writing dialogue.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {shown.map((line, index) => (
        <div key={index} className="flex min-w-0 flex-col gap-2 rounded border p-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex shrink-0 gap-1">
              {speakers.map((speaker) => {
                const speaking = line.speakerIds.includes(speaker.id)
                return (
                  <Chip
                    key={speaker.id}
                    chosen={speaking}
                    label={`${speaker.label} speaks line ${index + 1}`}
                    onToggle={() =>
                      write(index, {
                        ...line,
                        speakerIds: speaking
                          ? line.speakerIds.filter((id) => id !== speaker.id)
                          : [...line.speakerIds, speaker.id],
                      })
                    }
                  >
                    {speaker.label}
                  </Chip>
                )
              })}
            </div>
            <Input
              aria-label={`Language for line ${index + 1}`}
              className="w-28"
              value={line.language}
              onChange={(event) => replace(index, { ...line, language: event.target.value })}
              onBlur={commit}
            />
            <Input
              className="min-w-40 flex-1"
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

          <div className="flex flex-wrap gap-4">
            {FLAGS.map((flag) => (
              <div key={flag.key} className="flex items-center gap-2">
                <Checkbox
                  id={`line-${shotId}-${index}-${flag.key}`}
                  checked={line[flag.key]}
                  onCheckedChange={(checked) =>
                    write(index, { ...line, [flag.key]: checked === true })
                  }
                />
                <Label
                  htmlFor={`line-${shotId}-${index}-${flag.key}`}
                  className="text-xs font-normal"
                >
                  {flag.label}
                </Label>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...shown,
              {
                speakerIds: [speakers[0].id],
                language: "English",
                text: "",
                offScreen: false,
                crossesCut: false,
                cutOff: false,
              },
            ])
          }
        >
          Add line
        </Button>
      </div>
    </div>
  )
}
