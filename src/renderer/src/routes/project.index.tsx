import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import {
  Alert,
  AlertDescription,
  ConfirmDialog,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@renderer/design-system"
import { useAssetImages } from "@renderer/features/assets/use-asset-images"
import { useOpenSettings } from "@renderer/features/settings/settings-dialog-context"
import { useAssets } from "@renderer/features/assets/use-assets"
import { ClipEditor } from "@renderer/features/clips/clip-editor"
import { ClipList } from "@renderer/features/clips/clip-list"
import { ComparePanel } from "@renderer/features/clips/compare-panel"
import { useClip } from "@renderer/features/clips/use-clip"
import { useCompare, type ComparePair } from "@renderer/features/clips/use-compare"
import { useClips } from "@renderer/features/clips/use-clips"
import { useTRPC, type ClipSummary } from "@renderer/lib/trpc"
import { useGenerateClip } from "@renderer/features/clips/use-generate-clip"
import { GenerationHistory } from "@renderer/features/prompts/generation-history"
import { usePromptActions } from "@renderer/features/prompts/use-prompt-actions"
import { useVariants } from "@renderer/features/prompts/use-variants"
import { PromptResult } from "@renderer/features/prompts/prompt-result"

export const Route = createFileRoute("/project/")({
  component: Clips,
})

function Clips(): React.JSX.Element {
  const clips = useClips()
  const [chosenId, setChosenId] = useState<number | null>(null)
  const [removing, setRemoving] = useState<ClipSummary | null>(null)
  const clipId = chosenId ?? clips.clips[0]?.id ?? null

  return (
    <main className="mx-auto grid h-full w-full max-w-[1400px] gap-8 p-8 lg:grid-cols-[16rem_1fr]">
      <section className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <ClipList
          clips={clips.clips}
          selectedId={clipId}
          onSelect={setChosenId}
          onCreate={clips.create}
          onRemove={setRemoving}
        />
        {clips.errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{clips.errorMessage}</AlertDescription>
          </Alert>
        )}
      </section>

      {removing && (
        <ConfirmDialog
          title={`Delete ${removing.name}?`}
          description={
            removing.prompts === 0
              ? "Its shots go with it. Nothing has been generated for it."
              : `Its shots and the ${removing.prompts} prompts written for it go with it.`
          }
          confirmLabel="Delete"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            clips.remove(removing.id)
            if (chosenId === removing.id) setChosenId(null)
            setRemoving(null)
          }}
        />
      )}

      {clipId === null ? (
        <p className="text-sm text-muted-foreground">Start a clip to write a prompt for it.</p>
      ) : (
        <OpenClip
          clipId={clipId}
          targetId={clips.clips.find((clip) => clip.id === clipId)?.target ?? ""}
        />
      )}
    </main>
  )
}

interface OpenClipProps {
  clipId: number
  targetId: string
}

/** The clip being written, its result and everything written for it before. */
function OpenClip({ clipId, targetId }: OpenClipProps): React.JSX.Element {
  const clip = useClip(clipId)
  const library = useAssets()
  const pictures = useAssetImages()
  const writing = useGenerateClip(clipId)
  const prompts = useVariants(targetId)
  const comparison = useCompare(clipId)
  const actions = usePromptActions()
  const openSettings = useOpenSettings()
  const trpc = useTRPC()
  const settings = useQuery(trpc.settings.get.queryOptions())
  const [pairs, setPairs] = useState<ComparePair[]>([])

  if (!clip.composition || !clip.vocabularies) {
    return <p className="text-sm text-muted-foreground">Loading the clip…</p>
  }

  const [latest, ...earlier] = writing.generations

  return (
    <div className="grid h-full min-h-0 gap-8 xl:grid-cols-2">
      <section className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-2">
        <ClipEditor
          composition={clip.composition}
          vocabularies={clip.vocabularies}
          library={library.assets}
          libraryImages={pictures.images}
          composers={writing.composers}
          composerId={writing.composerId}
          variants={prompts.variants}
          variantId={writing.variantId}
          isSaving={clip.isSaving}
          isGenerating={writing.isPending}
          hasModel={(settings.data?.llamaModel.length ?? 0) > 0}
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
          onChooseVariant={writing.chooseVariant}
          onSetFrame={clip.setFrame}
          onOpenSettings={openSettings}
          onGenerate={writing.generate}
          onRegenerateShot={writing.regenerateShot}
        />

        {(clip.errorMessage ?? writing.errorMessage) && (
          <Alert variant="destructive">
            <AlertDescription>{clip.errorMessage ?? writing.errorMessage}</AlertDescription>
          </Alert>
        )}
      </section>

      <Tabs defaultValue="result" className="flex min-h-0 flex-col gap-3">
        <TabsList>
          <TabsTrigger value="result">Result</TabsTrigger>
          <TabsTrigger value="history">History ({writing.generations.length})</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>

        <TabsContent value="result" className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-2">
          {latest ? (
            <PromptResult
              generation={latest}
              isEditing={actions.isEditing}
              isExporting={actions.isExporting}
              onEdit={actions.edit}
              onExport={actions.exportToProject}
              onSave={actions.save}
              onOpenExports={actions.openExports}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing written for this clip yet. Fill in a shot and press Generate.
            </p>
          )}

          {actions.exportedTo && (
            <p className="text-xs text-muted-foreground">Written to {actions.exportedTo}</p>
          )}

          {actions.errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{actions.errorMessage}</AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="history" className="min-h-0 overflow-y-auto pr-2">
          <GenerationHistory
            generations={earlier}
            isEditing={actions.isEditing}
            isExporting={actions.isExporting}
            onEdit={actions.edit}
            onExport={actions.exportToProject}
            onSave={actions.save}
            onOpenExports={actions.openExports}
          />
        </TabsContent>

        <TabsContent value="compare" className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-2">
          <ComparePanel
            composers={writing.composers}
            variants={prompts.variants}
            pairs={pairs}
            runs={comparison.runs}
            runId={comparison.runId}
            results={comparison.results}
            failure={comparison.failure}
            isPending={comparison.isPending}
            onAddPair={(pair) => setPairs([...pairs, pair])}
            onRemovePair={(index) => setPairs(pairs.filter((_, at) => at !== index))}
            onRun={() => comparison.run(pairs)}
            onChooseRun={comparison.chooseRun}
            onVerdict={comparison.setVerdict}
            onNote={comparison.setNote}
          />

          {comparison.errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{comparison.errorMessage}</AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
