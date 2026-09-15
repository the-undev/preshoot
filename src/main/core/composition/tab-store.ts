import { asc, eq, inArray } from "drizzle-orm"
import { alias } from "drizzle-orm/sqlite-core"
import { schema, type ProjectDatabase } from "../db"
import { deleteClip, isScratchClip } from "./clip-store"
import { CompositionError } from "./errors"

/** Where the id of the tab being looked at is kept, so reopening a project lands where it was left. */
const ACTIVE_TAB = "activeTabId"

/** One open tab. A tab with no clip shows the list of clips rather than one of them. */
export interface OpenTab {
  id: number
  clipId: number | null
  /** The name the clip was saved under, or nothing while it is a scratch clip. */
  clipName: string | null
  /** The first thing that happens in the clip, for calling a tab that has no name something. */
  firstBeat: string | null
  /** The name of the saved clip this one was branched from, when it was branched from one. */
  savedFrom: string | null
}

/** Every open tab, left to right, and which of them is being looked at. */
export interface Workspace {
  tabs: OpenTab[]
  activeTabId: number | null
}

/**
 * The open tabs and the active one. A project with nothing open has no tabs, and the workspace
 * shows the list of clips, so closing the last tab needs no tab put back in its place.
 */
export function readWorkspace(db: ProjectDatabase): Workspace {
  const source = alias(schema.clips, "source")
  const rows = db
    .select({
      id: schema.openTabs.id,
      clipId: schema.openTabs.clipId,
      clipName: schema.clips.name,
      savedFrom: source.name,
    })
    .from(schema.openTabs)
    .leftJoin(schema.clips, eq(schema.openTabs.clipId, schema.clips.id))
    .leftJoin(source, eq(schema.clips.savedFromId, source.id))
    .orderBy(asc(schema.openTabs.position), asc(schema.openTabs.id))
    .all()

  const active = readActiveTabId(db)
  if (rows.length === 0) {
    return { tabs: [], activeTabId: null }
  }

  const beats = firstBeats(
    db,
    rows.map((row) => row.clipId).filter((id): id is number => id !== null)
  )
  const tabs = rows.map((row) => ({
    ...row,
    firstBeat: row.clipId === null ? null : (beats.get(row.clipId) ?? null),
  }))

  // The active tab can be gone: its clip was deleted, which takes the tab with it.
  const found = tabs.some((tab) => tab.id === active)
  return { tabs, activeTabId: found ? active : tabs[0].id }
}

/** The first thing that happens in each of these clips, skipping lines with nothing typed in them. */
function firstBeats(db: ProjectDatabase, clipIds: number[]): Map<number, string> {
  if (clipIds.length === 0) {
    return new Map()
  }
  const rows = db
    .select({ clipId: schema.shots.clipId, text: schema.shotLines.text })
    .from(schema.shotLines)
    .innerJoin(schema.shots, eq(schema.shotLines.shotId, schema.shots.id))
    .where(inArray(schema.shots.clipId, clipIds))
    .orderBy(asc(schema.shots.position), asc(schema.shotLines.position))
    .all()

  const first = new Map<number, string>()
  for (const row of rows) {
    const text = row.text.trim()
    if (row.clipId !== null && text.length > 0 && !first.has(row.clipId)) {
      first.set(row.clipId, text)
    }
  }
  return first
}

/**
 * Opens `clipId` and looks at it. A clip already open is brought forward rather than opened twice,
 * so the same clip is never in two tabs disagreeing with each other, and a tab showing the clip
 * list is filled in place rather than leaving an empty tab behind.
 */
export function openClipInTab(db: ProjectDatabase, clipId: number): Workspace {
  requireClip(db, clipId)
  const open = db.select().from(schema.openTabs).where(eq(schema.openTabs.clipId, clipId)).get()
  if (open) {
    writeActiveTabId(db, open.id)
    return readWorkspace(db)
  }

  const { activeTabId, tabs } = readWorkspace(db)
  const empty = tabs.find((tab) => tab.id === activeTabId && tab.clipId === null)
  if (empty) {
    db.update(schema.openTabs).set({ clipId }).where(eq(schema.openTabs.id, empty.id)).run()
    return readWorkspace(db)
  }

  writeActiveTabId(db, openTab(db, clipId))
  return readWorkspace(db)
}

/** Opens a tab showing the list of clips, at the right-hand end, and looks at it. */
export function openEmptyTab(db: ProjectDatabase): Workspace {
  writeActiveTabId(db, openTab(db, null))
  return readWorkspace(db)
}

/** Shows the list of clips in a tab that is already open, in place of whatever it held. */
export function showClipListInTab(db: ProjectDatabase, tabId: number): Workspace {
  const changed = db
    .update(schema.openTabs)
    .set({ clipId: null })
    .where(eq(schema.openTabs.id, tabId))
    .returning()
    .all()
  if (changed.length === 0) {
    throw CompositionError.notFound(`Tab ${tabId}`)
  }
  writeActiveTabId(db, tabId)
  return readWorkspace(db)
}

/** Looks at a tab that is already open. */
export function activateTab(db: ProjectDatabase, tabId: number): Workspace {
  const tab = db.select().from(schema.openTabs).where(eq(schema.openTabs.id, tabId)).get()
  if (!tab) {
    throw CompositionError.notFound(`Tab ${tabId}`)
  }
  writeActiveTabId(db, tabId)
  return readWorkspace(db)
}

/**
 * Closes a tab and looks at the one that took its place, which is the tab to its right, or the one
 * to its left when it was last. A clip that was never saved goes with its tab: a tab is the only
 * way to reach one, so leaving it behind would leave it in the project unreachable.
 */
export function closeTab(db: ProjectDatabase, directory: string, tabId: number): Workspace {
  const before = readWorkspace(db)
  const at = before.tabs.findIndex((tab) => tab.id === tabId)
  if (at === -1) {
    throw CompositionError.notFound(`Tab ${tabId}`)
  }

  const closed = before.tabs[at]
  db.delete(schema.openTabs).where(eq(schema.openTabs.id, tabId)).run()
  if (closed.clipId !== null && isScratchClip(db, closed.clipId)) {
    deleteClip(db, directory, closed.clipId)
  }

  const remaining = before.tabs.filter((tab) => tab.id !== tabId)
  if (before.activeTabId === tabId && remaining.length > 0) {
    writeActiveTabId(db, (remaining[at] ?? remaining[remaining.length - 1]).id)
  }
  return readWorkspace(db)
}

/** Adds a tab at the right-hand end and hands back its id. */
function openTab(db: ProjectDatabase, clipId: number | null): number {
  const positions = db.select({ position: schema.openTabs.position }).from(schema.openTabs).all()
  const position = positions.reduce((last, row) => Math.max(last, row.position + 1), 0)
  return db.insert(schema.openTabs).values({ clipId, position }).returning().get().id
}

function requireClip(db: ProjectDatabase, clipId: number): void {
  const clip = db.select().from(schema.clips).where(eq(schema.clips.id, clipId)).get()
  if (!clip) {
    throw CompositionError.notFound(`Clip ${clipId}`)
  }
}

function readActiveTabId(db: ProjectDatabase): number | null {
  const row = db
    .select()
    .from(schema.projectSettings)
    .where(eq(schema.projectSettings.key, ACTIVE_TAB))
    .get()
  const id = Number(row?.value)
  return Number.isInteger(id) ? id : null
}

function writeActiveTabId(db: ProjectDatabase, tabId: number): void {
  db.insert(schema.projectSettings)
    .values({ key: ACTIVE_TAB, value: String(tabId), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.projectSettings.key,
      set: { value: String(tabId), updatedAt: new Date() },
    })
    .run()
}
