import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// Vitest globals are off, so Testing Library cannot register its own cleanup and the
// DOM of one test would otherwise still be mounted during the next.
afterEach(cleanup)
