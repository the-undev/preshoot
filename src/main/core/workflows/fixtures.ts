import { readFileSync } from "node:fs"
import { join } from "node:path"

/** The base workflows the scan is tested against, saved from ComfyUI as they are used. */
export const FIXTURE_NAMES = ["h3-r2v-base", "h3-fl2v-base", "qwen-edit-2511-edit-base"] as const

/** Where a fixture workflow sits on disk. */
export function fixturePath(name: (typeof FIXTURE_NAMES)[number]): string {
  return join(__dirname, "fixtures", `${name}.json`)
}

/** A fixture workflow's text, exactly as ComfyUI saved it. */
export function fixtureText(name: (typeof FIXTURE_NAMES)[number]): string {
  return readFileSync(fixturePath(name), "utf8")
}
