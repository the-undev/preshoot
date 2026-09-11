import { describe, expect, it, vi } from "vitest"
import type { OpenProject } from "./project"
import { ProjectSession } from "./session"

function fakeProject(name: string): OpenProject {
  return {
    directory: `/tmp/${name}`,
    name,
    createdAt: new Date().toISOString(),
    db: {} as OpenProject["db"],
    close: vi.fn(),
  }
}

describe("ProjectSession", () => {
  it("starts with nothing open", () => {
    expect(new ProjectSession().current()).toBeNull()
  })

  it("closes the previous project when another is opened", () => {
    const session = new ProjectSession()
    const first = fakeProject("first")
    const second = fakeProject("second")

    session.replace(first)
    session.replace(second)

    expect(first.close).toHaveBeenCalledOnce()
    expect(second.close).not.toHaveBeenCalled()
    expect(session.current()).toBe(second)
  })

  it("closes the open project and forgets it", () => {
    const session = new ProjectSession()
    const project = fakeProject("only")

    session.replace(project)
    session.close()

    expect(project.close).toHaveBeenCalledOnce()
    expect(session.current()).toBeNull()
  })
})
