import { describe, expect, it } from "vitest"
import { ASSET_SCHEME, PRIVILEGED_SCHEMES, TRPC_SCHEME } from "./schemes"

describe("the schemes the app serves", () => {
  it("registers every one of them together", () => {
    expect(PRIVILEGED_SCHEMES.map((entry) => entry.scheme)).toEqual([TRPC_SCHEME, ASSET_SCHEME])
  })

  it("names each scheme once, since a second registration replaces the first", () => {
    const names = PRIVILEGED_SCHEMES.map((entry) => entry.scheme)

    expect(new Set(names).size).toBe(names.length)
  })

  it("lets the renderer fetch the main process across origins", () => {
    const trpc = PRIVILEGED_SCHEMES.find((entry) => entry.scheme === TRPC_SCHEME)

    expect(trpc?.privileges).toEqual(
      expect.objectContaining({ supportFetchAPI: true, corsEnabled: true, standard: true })
    )
  })

  it("lets the renderer read pictures", () => {
    const asset = PRIVILEGED_SCHEMES.find((entry) => entry.scheme === ASSET_SCHEME)

    expect(asset?.privileges).toEqual(
      expect.objectContaining({ supportFetchAPI: true, secure: true })
    )
  })
})
