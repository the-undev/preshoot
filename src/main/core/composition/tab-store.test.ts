import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { openProjectDatabase, type ProjectDatabaseHandle } from "../db"
import {
  branchClip,
  deleteClip,
  insertClip,
  insertShot,
  listClips,
  setShotBeats,
} from "./clip-store"
import {
  activateTab,
  closeTab,
  openClipInTab,
  openEmptyTab,
  readWorkspace,
  showClipListInTab,
} from "./tab-store"

const migrationsFolder = join(__dirname, "../../../../resources/migrations")

describe("tab store", () => {
  let dir: string
  let handle: ProjectDatabaseHandle

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "preshoot-tabs-"))
    handle = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
  })

  afterEach(() => {
    handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function addClip(name: string): number {
    return insertClip(handle.db, { name, target: "minimax-h3", style: "Live-action" }).id
  }

  /** A clip that has never been saved, with `beat` as the first thing that happens in it. */
  function addScratchClip(beat: string): number {
    const clipId = insertClip(handle.db, {
      name: null,
      target: "minimax-h3",
      style: "Live-action",
    }).id
    setShotBeats(handle.db, insertShot(handle.db, clipId), [{ assetId: null, text: beat }])
    return clipId
  }

  it("has no tabs until something is opened", () => {
    expect(readWorkspace(handle.db)).toEqual({ tabs: [], activeTabId: null })
  })

  it("opens a clip in a tab and looks at it", () => {
    const clipId = addClip("Lighthouse")

    const workspace = openClipInTab(handle.db, clipId)

    expect(workspace.tabs.map((tab) => tab.clipId)).toEqual([clipId])
    expect(workspace.tabs[0].clipName).toBe("Lighthouse")
    expect(workspace.activeTabId).toBe(workspace.tabs[0].id)
  })

  it("opens an empty tab, which shows the list of clips", () => {
    const workspace = openEmptyTab(handle.db)

    expect(workspace.tabs.map((tab) => tab.clipId)).toEqual([null])
    expect(workspace.tabs[0].clipName).toBeNull()
  })

  it("fills the tab showing the clip list rather than leaving it behind", () => {
    const empty = openEmptyTab(handle.db)
    const clipId = addClip("Lighthouse")

    const workspace = openClipInTab(handle.db, clipId)

    expect(workspace.tabs).toHaveLength(1)
    expect(workspace.tabs[0].id).toBe(empty.tabs[0].id)
    expect(workspace.tabs[0].clipId).toBe(clipId)
  })

  it("brings a clip that is already open forward rather than opening it twice", () => {
    const clipId = addClip("Lighthouse")
    const first = openClipInTab(handle.db, clipId)
    const empty = openEmptyTab(handle.db)

    const again = openClipInTab(handle.db, clipId)

    expect(again.tabs).toHaveLength(2)
    expect(again.activeTabId).toBe(first.tabs[0].id)
    expect(again.tabs[1].id).toBe(empty.tabs[1].id)
  })

  it("keeps the tabs and the active one when the project is opened again", () => {
    const clipId = addClip("Lighthouse")
    openClipInTab(handle.db, clipId)
    openEmptyTab(handle.db)
    handle.close()

    handle = openProjectDatabase(join(dir, "project.db"), migrationsFolder)
    const workspace = readWorkspace(handle.db)

    expect(workspace.tabs.map((tab) => tab.clipId)).toEqual([clipId, null])
    expect(workspace.tabs[1].id).toBe(workspace.activeTabId)
  })

  it("puts the clip list back into a tab that held a clip", () => {
    const opened = openClipInTab(handle.db, addClip("Lighthouse"))

    const workspace = showClipListInTab(handle.db, opened.tabs[0].id)

    expect(workspace.tabs[0].clipId).toBeNull()
    expect(workspace.activeTabId).toBe(opened.tabs[0].id)
  })

  it("looks at the tab to the right when the active one closes", () => {
    const first = openClipInTab(handle.db, addClip("One"))
    const second = openClipInTab(handle.db, addClip("Two"))
    activateTab(handle.db, first.tabs[0].id)

    const workspace = closeTab(handle.db, first.tabs[0].id)

    expect(workspace.activeTabId).toBe(second.tabs[1].id)
  })

  it("looks at the tab to the left when the last one closes", () => {
    const first = openClipInTab(handle.db, addClip("One"))
    const second = openClipInTab(handle.db, addClip("Two"))

    const workspace = closeTab(handle.db, second.tabs[1].id)

    expect(workspace.activeTabId).toBe(first.tabs[0].id)
  })

  it("leaves nothing open when the only tab closes", () => {
    const opened = openClipInTab(handle.db, addClip("Lighthouse"))

    expect(closeTab(handle.db, opened.tabs[0].id)).toEqual({ tabs: [], activeTabId: null })
  })

  it("closes the tab of a clip that is deleted and looks elsewhere", () => {
    const clipId = addClip("Lighthouse")
    const opened = openClipInTab(handle.db, clipId)
    const empty = openEmptyTab(handle.db)
    activateTab(handle.db, opened.tabs[0].id)

    deleteClip(handle.db, clipId)
    const workspace = readWorkspace(handle.db)

    expect(workspace.tabs.map((tab) => tab.id)).toEqual([empty.tabs[1].id])
    expect(workspace.activeTabId).toBe(empty.tabs[1].id)
  })

  it("says what happens first in a clip that has no name", () => {
    const clipId = addScratchClip("climbs the last steps")

    const workspace = openClipInTab(handle.db, clipId)

    expect(workspace.tabs[0].clipName).toBeNull()
    expect(workspace.tabs[0].firstBeat).toBe("climbs the last steps")
  })

  it("skips a beat with nothing typed in it yet", () => {
    const clipId = addScratchClip("   ")

    expect(openClipInTab(handle.db, clipId).tabs[0].firstBeat).toBeNull()
  })

  it("throws away a clip that was never saved when its tab closes", () => {
    const clipId = addScratchClip("climbs the last steps")
    const opened = openClipInTab(handle.db, clipId)

    closeTab(handle.db, opened.tabs[0].id)

    expect(() => deleteClip(handle.db, clipId)).toThrow(
      expect.objectContaining({ code: "not-found" })
    )
  })

  it("keeps a saved clip when its tab closes", () => {
    const clipId = addClip("Lighthouse")
    const opened = openClipInTab(handle.db, clipId)

    closeTab(handle.db, opened.tabs[0].id)

    expect(listClips(handle.db).map((clip) => clip.id)).toEqual([clipId])
  })

  it("says which saved clip a branch came from", () => {
    const clipId = addClip("Lighthouse")
    const branch = branchClip(handle.db, clipId)

    const workspace = openClipInTab(handle.db, branch.id)

    expect(workspace.tabs[0].savedFrom).toBe("Lighthouse")
  })

  it("says nothing about where a clip came from when it came from nowhere", () => {
    const workspace = openClipInTab(handle.db, addClip("Lighthouse"))

    expect(workspace.tabs[0].savedFrom).toBeNull()
  })

  it("refuses a tab that is not open", () => {
    expect(() => activateTab(handle.db, 99)).toThrow(expect.objectContaining({ code: "not-found" }))
    expect(() => closeTab(handle.db, 99)).toThrow(expect.objectContaining({ code: "not-found" }))
  })
})
