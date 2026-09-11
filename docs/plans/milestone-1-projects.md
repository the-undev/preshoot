# Milestone 1: projects

Welcome screen, project create and open, recent projects, and an empty
project workspace. Everything later hangs off an open project.

Read `CLAUDE.md` and `docs/roadmap.md` first. Work on a branch named
`feature/projects`. One commit per step below, `pnpm check` green before
each commit, no attribution trailers in commit messages. Hand the branch
over for review at the end; do not push or merge.

## Behaviour

1. The app opens on the welcome screen at route `/`.
2. New Project: a directory picker (allowing a new folder), then a name
   defaulting to the folder's basename, then Create. The folder becomes a
   project and the workspace opens.
3. Open Project: a directory picker. A folder with a marker opens. A folder
   without one shows an error and stays on the welcome screen.
4. Drag a folder onto the welcome screen: same as Open Project.
5. Recent projects: list of previously opened projects, newest first,
   showing name and path. Click opens. Entries whose folder no longer
   exists are dropped from the list when it is read.
6. Workspace at route `/project`: header with project name and path, a
   Close button returning to the welcome screen. Nothing else yet.
7. Visiting `/project` with no open project redirects to `/`.

## Files on disk

Project folder:

```
<chosen folder>/
  preshoot.json
  preshoot.db
  assets/
  outputs/
  exports/
```

`preshoot.json`:

```json
{ "name": "My film", "schemaVersion": 1, "createdAt": "2026-09-11T19:00:00.000Z" }
```

App settings at `<userData>/settings.json`, where `userData` is Electron's
`app.getPath("userData")` (`~/.config/preshoot` on Linux):

```json
{
  "recentProjects": [
    { "directory": "/home/x/films/my-film", "name": "My film", "lastOpenedAt": "..." }
  ]
}
```

A missing or unparseable settings file is treated as empty.

## Step 1: core project module

Files under `src/main/core/projects/`. No Electron imports (lint enforced).

`marker.ts`

- `PROJECT_MARKER_FILENAME = "preshoot.json"`, `PROJECT_DATABASE_FILENAME = "preshoot.db"`.
- Zod schema `projectMarkerSchema` and type `ProjectMarker` for the JSON above.
- `readProjectMarker(directory): ProjectMarker`. Throws `ProjectError` with
  code `"not-a-project"` when the file is missing, `"invalid-marker"` when it
  fails the schema.
- `writeProjectMarker(directory, marker): void`.

`errors.ts`

- `class ProjectError extends Error` with a `code` field of type
  `"not-a-project" | "invalid-marker" | "already-a-project"`.

`project.ts`

- `interface ProjectSummary { directory: string; name: string; createdAt: string }`.
- `interface OpenProject extends ProjectSummary { db: ProjectDatabase; close(): void }`.
- `createProject(input: { directory, name, migrationsFolder }): OpenProject`.
  Creates the directory and the three subfolders if missing, throws
  `"already-a-project"` if a marker exists, writes the marker, opens the
  database through `openProjectDatabase`.
- `openProject(input: { directory, migrationsFolder }): OpenProject`. Reads
  the marker, creates any missing subfolders, opens the database.
- `close()` closes the underlying better-sqlite3 handle. `openProjectDatabase`
  needs to expose it: return `{ db, close }` from `src/main/core/db/index.ts`
  and update its test.

`project.test.ts` using a temp directory per test, as `db/index.test.ts` does:

- create writes marker, subfolders and database file.
- create on an existing project throws `already-a-project`.
- open on an empty folder throws `not-a-project`.
- open on a folder with a broken marker throws `invalid-marker`.
- open after create returns the same name and createdAt.

## Step 2: app settings module

`src/main/core/settings/app-settings.ts`

- Zod schema for the settings file, type `AppSettings`, `RecentProject`.
- `class AppSettingsStore` constructed with `settingsPath: string`.
  - `read(): AppSettings`. Missing file or invalid JSON returns defaults.
  - `write(settings): void`. Writes to a temp file then renames.
  - `recordRecentProject(project: ProjectSummary): void`. Moves or inserts
    the entry at the front, caps the list at 20.
  - `listRecentProjects(): RecentProject[]`. Drops entries whose directory
    or marker file no longer exists, and writes the pruned list back if
    anything was dropped.

`app-settings.test.ts`: defaults on missing file, record moves an existing
entry to the front, prune removes a deleted folder.

## Step 3: session, context and router

`src/main/core/projects/session.ts`

- `class ProjectSession` holding at most one `OpenProject`. Methods
  `current(): OpenProject | null`, `replace(project): void` (closes the
  previous one), `close(): void`.

`src/main/trpc/context.ts`: extend `Context` with

```ts
projects: ProjectSession
settings: AppSettingsStore
migrationsFolder: string
dialogs: { pickDirectory(options: { title: string; allowCreate: boolean }): Promise<string | null> }
```

`src/main/index.ts`: build these once at startup. Migrations folder:

```ts
const migrationsFolder = app.isPackaged
  ? join(process.resourcesPath, "migrations")
  : join(app.getAppPath(), "resources", "migrations")
```

Dialogs use `dialog.showOpenDialog` with properties `["openDirectory"]`, plus
`"createDirectory"` when `allowCreate` is true. Return the first path or
null when cancelled. Close the open project on `window-all-closed` before
quitting.

`src/main/trpc/routers/projects.ts`, mounted as `projects` in `router.ts`:

| Procedure       | Kind     | Input                             | Output                   |
| --------------- | -------- | --------------------------------- | ------------------------ |
| `recent`        | query    | none                              | `RecentProject[]`        |
| `current`       | query    | none                              | `ProjectSummary \| null` |
| `pickDirectory` | mutation | `{ purpose: "create" \| "open" }` | `string \| null`         |
| `create`        | mutation | `{ directory, name }`             | `ProjectSummary`         |
| `open`          | mutation | `{ directory }`                   | `ProjectSummary`         |
| `close`         | mutation | none                              | `void`                   |

`create` and `open` replace the session's project and record it in recent
projects. `ProjectError` is rethrown as `TRPCError` with code `BAD_REQUEST`
and the original message, so the renderer can show it.

`projects.test.ts`: call the router through `appRouter.createCaller(ctx)`
with a temp settings path, a temp migrations-free project (point
`migrationsFolder` at `resources/migrations`), and a fake `dialogs` that
returns a fixed path. Cover create, open, open of a non-project, recent
after open, close.

## Step 4: renderer

Preload (`src/preload/index.ts` and `index.d.ts`): expose
`window.preshoot.getPathForFile(file: File): string` using `webUtils` from
`electron`. This is the only way the renderer learns the path of a dropped
folder.

Design system: add with the shadcn CLI and export from
`src/renderer/src/design-system/index.ts`: `card`, `input`, `label`,
`dialog`, `alert`, `separator`. Do not edit the generated files.

Routes:

- `src/renderer/src/routes/index.tsx`: welcome screen. Two primary buttons
  (New Project, Open Project), a drop zone covering the page, and the recent
  list. Errors from mutations appear in an `Alert` under the buttons.
- `src/renderer/src/routes/project.tsx`: workspace. `beforeLoad` queries
  `projects.current` through the query client and redirects to `/` when
  null. Header shows name and path, Close button calls `projects.close`,
  invalidates queries, navigates to `/`.

Feature code under `src/renderer/src/features/projects/`:

- `new-project-dialog.tsx`: after `pickDirectory` returns a path, shows a
  dialog with the name input defaulted to the basename, Create calls
  `projects.create`, then navigates to `/project`.
- `recent-projects-list.tsx`: presentational, takes `projects` and
  `onOpen`. Test it with props in `recent-projects-list.test.tsx`: renders
  names and paths, click calls `onOpen` with the directory.
- `use-open-project.ts`: hook wrapping the `open` mutation, the recent
  query invalidation and the navigation, shared by button, drop and list.

tRPC with TanStack Query, as used in `routes/index.tsx` today:

```ts
const trpc = useTRPC()
const recent = useQuery(trpc.projects.recent.queryOptions())
const open = useMutation(trpc.projects.open.mutationOptions())
queryClient.invalidateQueries({ queryKey: trpc.projects.pathKey() })
```

Drop handling: on `drop`, take `event.dataTransfer.files[0]`, get its path
via `window.preshoot.getPathForFile`, call open. Ignore drops with no files.

## Step 5: roadmap

Move milestone 1 in `docs/roadmap.md` to a "Done" list with one line, and
add any open items found on the way.

## Verification

`pnpm check` after every step. Name the covering test in each commit body
when a step adds behaviour. Before handover, run `pnpm dev` once and confirm
the seven behaviours above by hand, then say which ones were checked.
