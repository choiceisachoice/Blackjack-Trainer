/**
 * Whether the landing's three.js hero is worth loading on this device.
 *
 * Measured on 28 Nov 2026: on a mid-range phone the canvas cost about 2.2 s
 * of main-thread blocking, under a 72 % scrim that hides most of it anyway.
 * So it is an enhancement for screens that can show it and devices that can
 * afford it, and never for a reader who asked for less: no motion, or less
 * data. Everyone else gets the static ground the hero already has.
 */

/** The parts of `window` the decision reads, injectable for tests. */
export interface HeroCanvasEnv {
  /** `window.matchMedia`, or undefined where there is none (Node, old browsers). */
  matchMedia?: (query: string) => { matches: boolean }
  /** `navigator.hardwareConcurrency`; undefined when the browser hides it. */
  hardwareConcurrency?: number
  /** `navigator.connection.saveData` (Chromium only). */
  saveData?: boolean
}

/** Tailwind's `md` breakpoint: below it the hero sits under the phone scrim. */
export const HERO_CANVAS_MIN_WIDTH_PX = 768

/** Four cores or fewer is where the measured blocking time came from. */
export const HERO_CANVAS_MIN_CORES = 5

/**
 * Decide whether to load the canvas.
 *
 * Unknown means yes for the core count (Safari does not report it, and the
 * desktops that hide it are not the phones this protects), and no for
 * anything without `matchMedia`, where neither the width nor the motion
 * preference can be read.
 *
 * @param env - What the browser reports; see `readHeroCanvasEnv`
 */
export function shouldLoadHeroCanvas(env: HeroCanvasEnv): boolean {
  const mm = env.matchMedia
  if (!mm) return false
  if (!mm(`(min-width: ${HERO_CANVAS_MIN_WIDTH_PX}px)`).matches) return false
  if (mm('(prefers-reduced-motion: reduce)').matches) return false
  if (env.saveData === true) return false
  if (typeof env.hardwareConcurrency === 'number' && env.hardwareConcurrency < HERO_CANVAS_MIN_CORES) return false
  return true
}

/**
 * Read the decision's inputs from the running browser.
 *
 * @returns An empty environment outside a browser, which `shouldLoadHeroCanvas` declines.
 */
export function readHeroCanvasEnv(): HeroCanvasEnv {
  if (typeof window === 'undefined') return {}
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  return {
    matchMedia: typeof window.matchMedia === 'function' ? q => window.matchMedia(q) : undefined,
    hardwareConcurrency: nav.hardwareConcurrency,
    saveData: nav.connection?.saveData,
  }
}

/**
 * Run `fn` once the browser is idle (or after `fallbackMs` where
 * `requestIdleCallback` does not exist — Safari).
 *
 * @returns A function that cancels the pending call.
 */
export function whenIdle(fn: () => void, fallbackMs = 200): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout: 2000 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(fn, fallbackMs)
  return () => window.clearTimeout(id)
}
