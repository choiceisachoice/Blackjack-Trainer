import '@testing-library/jest-dom'

// jsdom ships no IntersectionObserver, but anything using viewport-triggered
// animation (framer-motion's `whileInView`, the hero's off-screen render pause)
// constructs one on mount. Stub it so those components render in tests; the
// stub never fires, which matches "nothing has scrolled into view yet".
class IntersectionObserverStub implements IntersectionObserver {
  readonly root: Element | Document | null = null
  readonly rootMargin: string = '0px'
  readonly thresholds: ReadonlyArray<number> = [0]
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
}

if (!('IntersectionObserver' in globalThis)) {
  globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver
}
