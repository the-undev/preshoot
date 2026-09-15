import { describe, expect, it } from "vitest"
import { APP_MENU } from "./menu"
import { PRIVILEGED_SCHEMES, ASSET_SCHEME, TRPC_SCHEME } from "./schemes"

describe("the app's menu", () => {
  it("leaves out the window menu, which would take Ctrl and W from the renderer", () => {
    expect(APP_MENU.map((item) => item.role)).not.toContain("windowMenu")
  })

  it("keeps the menus that carry editing and reloading", () => {
    expect(APP_MENU.map((item) => item.role)).toEqual(["fileMenu", "editMenu", "viewMenu"])
  })
})

describe("the schemes the app serves", () => {
  it("registers both in one list, since a second call would replace the first", () => {
    expect(PRIVILEGED_SCHEMES.map((entry) => entry.scheme)).toEqual([TRPC_SCHEME, ASSET_SCHEME])
  })

  it("lets the renderer fetch through both of them", () => {
    for (const entry of PRIVILEGED_SCHEMES) {
      expect(entry.privileges?.supportFetchAPI).toBe(true)
      expect(entry.privileges?.standard).toBe(true)
      expect(entry.privileges?.secure).toBe(true)
    }
  })

  it("answers cross-origin requests on the scheme the renderer calls procedures through", () => {
    const trpc = PRIVILEGED_SCHEMES.find((entry) => entry.scheme === TRPC_SCHEME)

    expect(trpc?.privileges?.corsEnabled).toBe(true)
  })
})
