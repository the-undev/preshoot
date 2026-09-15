import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Alert, AlertDescription, ConfirmDialog } from "@renderer/design-system"
import { useAssetImages } from "@renderer/features/assets/use-asset-images"
import { useAssets } from "@renderer/features/assets/use-assets"
import { ClipEditor } from "@renderer/features/clips/clip-editor"
import { ClipList } from "@renderer/features/clips/clip-list"
import { ClipBar } from "@renderer/features/clips/clip-bar"
import { ClipPromptPanel } from "@renderer/features/clips/clip-prompt"
import { ClipSettingsDialog } from "@renderer/features/clips/clip-settings-dialog"
import { SaveClipDialog } from "@renderer/features/clips/save-clip-dialog"
import { TabBar } from "@renderer/features/clips/tab-bar"
import { tabTitle } from "@renderer/features/clips/tab-title"
import { useClip } from "@renderer/features/clips/use-clip"
import { useClips } from "@renderer/features/clips/use-clips"
import { useExportPrompt } from "@renderer/features/clips/use-export-prompt"
import { useTabs } from "@renderer/features/clips/use-tabs"
import { useShortcuts } from "@renderer/features/shortcuts/use-shortcuts"
import { useTRPC, type ClipSummary, type OpenTab } from "@renderer/lib/trpc"

export const Route = createFileRoute("/project/")({
  component: Workspace,
})

/** Whether closing this tab would throw away work: it holds a clip that has never been saved. */
function discardsWork(tab: OpenTab): boolean {
  return tab.clipId !== null && tab.clipName === null && tab.firstBeat !== null
}

function Workspace(): React.JSX.Element {
  const tabs = useTabs()
  const clips = useClips()
  const [removing, setRemoving] = useState<ClipSummary | null>(null)
  const [discarding, setDiscarding] = useState<OpenTab | null>(null)
  const clipId = tabs.active?.clipId ?? null

  const startClip = (): void => clips.create(tabs.openClip)
  const branchClip = (id: number): void => clips.branch(id, tabs.openClip)

  // A tab holding a clip that was never saved is the only way back to it, so closing it asks first.
  const closeTab = (tabId: number): void => {
    const tab = tabs.tabs.find((open) => open.id === tabId)
    if (tab && discardsWork(tab)) {
      setDiscarding(tab)
      return
    }
    tabs.close(tabId)
  }

  useShortcuts({
    newTab: tabs.openEmpty,
    closeTab: () => {
      if (tabs.active) closeTab(tabs.active.id)
    },
    nextTab: () => tabs.step(1),
    previousTab: () => tabs.step(-1),
    firstTab: () => tabs.jumpTo(0),
    lastTab: () => tabs.jumpTo(-1),
    clipList: tabs.showClipList,
    newClip: startClip,
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b px-4 pt-2">
        <TabBar
          tabs={tabs.tabs}
          activeId={tabs.active?.id ?? null}
          onActivate={tabs.activate}
          onClose={closeTab}
          onOpenEmpty={tabs.openEmpty}
        />
      </div>

      {(tabs.errorMessage ?? clips.errorMessage) && (
        <Alert variant="destructive" className="mx-4 mt-4">
          <AlertDescription>{tabs.errorMessage ?? clips.errorMessage}</AlertDescription>
        </Alert>
      )}

      {removing && (
        <ConfirmDialog
          title={`Delete ${removing.name}?`}
          description="Its shots go with it, and its tab closes."
          confirmLabel="Delete"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            clips.remove(removing.id)
            setRemoving(null)
          }}
        />
      )}

      {discarding && (
        <ConfirmDialog
          title={`Discard ${tabTitle(discarding)}?`}
          description="This clip has never been saved, so closing its tab throws it away."
          confirmLabel="Discard"
          onCancel={() => setDiscarding(null)}
          onConfirm={() => {
            tabs.close(discarding.id)
            setDiscarding(null)
          }}
        />
      )}

      {clipId === null ? (
        <main className="mx-auto min-h-0 w-full max-w-[1400px] flex-1 overflow-hidden p-8">
          <ClipList
            clips={clips.clips}
            onCreate={startClip}
            onOpen={tabs.openClip}
            onBranch={branchClip}
            onRemove={setRemoving}
          />
        </main>
      ) : (
        <OpenClip
          key={clipId}
          clipId={clipId}
          tab={tabs.active as OpenTab}
          onBranched={tabs.openClip}
        />
      )}
    </div>
  )
}

interface OpenClipProps {
  clipId: number
  tab: OpenTab
  onBranched: (clipId: number) => void
}

/** The clip being written, and the prompt it makes as it is written. */
function OpenClip({ clipId, tab, onBranched }: OpenClipProps): React.JSX.Element {
  const clip = useClip(clipId)
  const [naming, setNaming] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const library = useAssets()
  const pictures = useAssetImages()
  const exporting = useExportPrompt(clipId)
  const navigate = useNavigate()
  const trpc = useTRPC()
  const shapes = useQuery(trpc.clips.aspectRatios.queryOptions())

  useShortcuts({
    addShot: clip.addShot,
    copyPrompt: () => {
      if (clip.prompt?.ready) void navigator.clipboard.writeText(clip.prompt.rendered)
    },
    saveClip: () => setNaming(true),
    branchClip: () => clip.branch(onBranched),
    clipSettings: () => setSettingsOpen(true),
  })

  if (!clip.composition || !clip.vocabularies) {
    return <p className="text-sm text-muted-foreground">Loading the clip…</p>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ClipBar
        tab={tab}
        composition={clip.composition}
        aspectRatios={shapes.data ?? []}
        isSaving={clip.isSaving}
        onSave={() => setNaming(true)}
        onBranch={() => clip.branch(onBranched)}
        onSettings={() => setSettingsOpen(true)}
      />

      {naming && (
        <SaveClipDialog
          name={clip.composition.name}
          onSave={(name) => {
            clip.save(name)
            setNaming(false)
          }}
          onCancel={() => setNaming(false)}
        />
      )}

      {settingsOpen && (
        <ClipSettingsDialog
          composition={clip.composition}
          vocabularies={clip.vocabularies}
          libraryImages={pictures.images}
          aspectRatios={shapes.data ?? []}
          onChange={clip.updateClip}
          onSetFrame={clip.setFrame}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <main className="mx-auto grid min-h-0 w-full max-w-[1400px] flex-1 gap-8 overflow-hidden p-8 xl:grid-cols-2">
        <section className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto pr-2">
          <ClipEditor
            composition={clip.composition}
            vocabularies={clip.vocabularies}
            library={library.assets}
            isSaving={clip.isSaving}
            onAddShot={clip.addShot}
            onShotChange={clip.updateShot}
            onMoveShot={clip.moveShot}
            onRemoveShot={clip.removeShot}
            onAddSpeaker={clip.addSpeaker}
            onUpdateSpeaker={clip.updateSpeaker}
            onRemoveSpeaker={clip.removeSpeaker}
            onAddPeople={() => void navigate({ to: "/project/library" })}
          />

          {clip.errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{clip.errorMessage}</AlertDescription>
            </Alert>
          )}
        </section>

        <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto pr-2">
          {clip.prompt === null ? (
            <p className="text-sm text-muted-foreground">Writing the prompt…</p>
          ) : (
            <ClipPromptPanel
              prompt={clip.prompt}
              isExporting={exporting.isExporting}
              exportedTo={exporting.exportedTo}
              errorMessage={exporting.errorMessage}
              onExport={exporting.exportToProject}
              onSave={exporting.saveAs}
              onOpenExports={exporting.openExports}
            />
          )}
        </section>
      </main>
    </div>
  )
}
