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
  const replace = (index: number, line: DialogueLine): void => {
    onChange(lines.map((existing, at) => (at === index ? line : existing)))
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
      {lines.map((line, index) => (
        <div key={index} className="flex items-center gap-2">
          <Select
            value={String(line.speakerId)}
            onValueChange={(value) => replace(index, { ...line, speakerId: Number(value) })}
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
          />
          <Input
            aria-label={`Line ${index + 1} of shot ${shotId}`}
            value={line.text}
            onChange={(event) => replace(index, { ...line, text: event.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(lines.filter((_, at) => at !== index))}
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
            onChange([...lines, { speakerId: speakers[0].id, language: "English", text: "" }])
          }
        >
          Add line
        </Button>
      </div>
    </div>
  )
}
