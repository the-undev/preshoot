import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { ObjectInfo } from "../backend/comfyui-client"

/** The `/object_info` of a live instance, trimmed to the node classes the fixture workflows use. */
export function objectInfoFixture(): ObjectInfo {
  return JSON.parse(readFileSync(join(__dirname, "fixtures", "object-info.json"), "utf8"))
}
