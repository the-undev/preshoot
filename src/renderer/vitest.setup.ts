import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// Vitest globals are off, so Testing Library cannot register its own cleanup and the
// DOM of one test would otherwise still be mounted during the next.
afterEach(cleanup)

/**
 * jsdom has no ResizeObserver. Nothing in it lays out either, so an element never changes size and
 * a watcher that reports nothing is what a real one would do here anyway.
 */
globalThis.ResizeObserver ??= class {
  observe(): void {
    return
  }
  unobserve(): void {
    return
  }
  disconnect(): void {
    return
  }
}

/**
 * jsdom has no scrollIntoView. Nothing in it scrolls, so what a real one would do here is nothing,
 * and code that brings an element into view can still be tested for everything else it does.
 */
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {
  return
}
