import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Alert, AlertDescription } from "@renderer/design-system"
import { useAssets } from "@renderer/features/assets/use-assets"
import { ClipEditor } from "@renderer/features/clips/clip-editor"
import { ClipList } from "@renderer/features/clips/clip-list"
import { useClip } from "@renderer/features/clips/use-clip"
import { useClips } from "@renderer/features/clips/use-clips"
import { useGenerateClip } from "@renderer/features/clips/use-generate-clip"
import { GenerationHistory } from "@renderer/features/prompts/generation-history"
import { PromptResult } from "@renderer/features/prompts/prompt-result"

export const Route = createFileRoute("/project/")({
  component: Clips,
})

function Clips(): React.JSX.Element {
  const clips = useClips()
  const [chosenId, setChosenId] = useState<number | null>(null)
  const clipId = chosenId ?? clips.clips[0]?.id ?? null

  return (
    <main className="mx-auto grid w-full max-w-[1400px] gap-8 p-8 lg:grid-cols-[16rem_1fr]">
      <section className="flex flex-col gap-4">
        <ClipList
          clips={clips.clips}
          selectedId={clipId}
          onSelect={setChosenId}
          onCreate={clips.create}
        />
        {clips.errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{clips.errorMessage}</AlertDescription>
          </Alert>
        )}
      </section>

      {clipId === null ? (
        <p className="text-sm text-muted-foreground">Start a clip to write a prompt for it.</p>
      ) : (
        <OpenClip clipId={clipId} />
      )}
    </main>
  )
}

interface OpenClipProps {
  clipId: number
}

/** The clip being written, its result and everything written for it before. */
function OpenClip({ clipId }: OpenClipProps): React.JSX.Element {
  const clip = useClip(clipId)
  const library = useAssets()
  const writing = useGenerateClip(clipId)

  if (!clip.composition || !clip.vocabularies) {
    return <p className="text-sm text-muted-foreground">Loading the clip…</p>
  }

  const [latest, ...earlier] = writing.generations

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section className="flex flex-col gap-4">
        <ClipEditor
          composition={clip.composition}
          vocabularies={clip.vocabularies}
          library={library.assets}
          composers={writing.composers}
          composerId={writing.composerId}
          isSaving={clip.isSaving}
          isGenerating={writing.isPending}
          canRegenerate={Boolean(writing.latest?.prose)}
          onClipChange={clip.updateClip}
          onAddShot={clip.addShot}
          onShotChange={clip.updateShot}
          onMoveShot={clip.moveShot}
          onRemoveShot={clip.removeShot}
          onAddSpeaker={clip.addSpeaker}
          onUpdateSpeaker={clip.updateSpeaker}
          onRemoveSpeaker={clip.removeSpeaker}
          onChooseComposer={writing.chooseComposer}
          onGenerate={writing.generate}
          onRegenerateShot={writing.regenerateShot}
        />

        {(clip.errorMessage ?? writing.errorMessage) && (
          <Alert variant="destructive">
            <AlertDescription>{clip.errorMessage ?? writing.errorMessage}</AlertDescription>
          </Alert>
        )}
      </section>

      <section className="flex flex-col gap-4">
        {latest && <PromptResult generation={latest} />}
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">History</h2>
        <GenerationHistory generations={earlier} />
      </section>
    </div>
  )
}
