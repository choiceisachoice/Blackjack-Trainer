import enMessages from '../../i18n/messages/en.json'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { IntroGate, GRACE_MS } from './IntroGate'
import { resetIntroSession } from './intro-session'
import {
  BRIEF,
  BRIEF_MIN_VISIBLE_MS,
  COMPLETE_HOLD_MS,
  COMPLETE_MS,
  MAX_HOLD_MS,
  EXIT_MS,
  MIN_VISIBLE_MS,
  REDUCED_VISIBLE_MS,
} from './intro-sequence'

/**
 * Turn on the reduced-motion preference for one test.
 *
 * jsdom answers every media query with `matches: false`, so without this the
 * reduced path is simply never exercised — the branch would look covered while
 * nothing had run it.
 */
function preferReducedMotion() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

/**
 * Let `ms` of wall time pass, in slices.
 *
 * One big `advanceTimersByTime` is not the same thing. A timer firing re-renders,
 * and the effect that runs off that render schedules the *next* timer — the beat
 * that ends the sequence schedules the hand-over, which schedules the fade,
 * which schedules the unmount. Each of those lands after the queue has already
 * been walked, so a single call stops at the first link in the chain and reports
 * a stall the browser never has. Slicing lets each newly-scheduled timer be
 * picked up by a later slice, while the total elapsed time still equals `ms` —
 * which matters, because some tests assert on what has *not* happened yet.
 */
const SLICE_MS = 50

async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += SLICE_MS) {
    await act(async () => {
      vi.advanceTimersByTime(Math.min(SLICE_MS, ms - elapsed))
    })
  }
}

beforeEach(() => {
  localStorage.clear()
  // Without this the very first test to mount the gate marks the session as
  // seen, and every test after it silently measures the abbreviated timeline
  // instead of the one it names. The memo is module-level precisely so it
  // survives a remount, which means a test has to clear it deliberately.
  resetIntroSession()
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  // `restoreAllMocks` does not undo `stubGlobal`. Without this the reduced-motion
  // stub leaks into the next test, which then quietly measures the wrong path.
  vi.unstubAllGlobals()
})

/**
 * Everything after the floor: the bar closing, the completion being held, the
 * handover, the unmount.
 *
 * Derived from the constants rather than a round number with slack in it. It
 * was `COMPLETE_MS + EXIT_MS + 400`, which silently omitted the completion hold
 * — fine while that was short, and a false failure the moment it grew.
 */
const TAIL_MS = COMPLETE_MS + COMPLETE_HOLD_MS + EXIT_MS + 400

describe('IntroGate', () => {
  it('plays the entrance for a first-time visitor', () => {
    render(<IntroGate><div data-testid="app">app</div></IntroGate>)
    expect(screen.getByTestId('intro-sequence')).toBeInTheDocument()
  })


  it('renders the app underneath from the very first frame', () => {
    // This is what makes the handover a dissolve rather than a cut: what
    // appears behind the overlay has already loaded and laid out.
    render(<IntroGate><div data-testid="app">app</div></IntroGate>)
    expect(screen.getByTestId('app')).toBeInTheDocument()
    expect(screen.getByTestId('intro-sequence')).toBeInTheDocument()
  })

  it('locks scrolling while it plays and restores it afterwards', () => {
    document.body.style.overflow = 'scroll' // a pre-existing value to preserve
    const { unmount } = render(<IntroGate><div /></IntroGate>)
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('is tied to the page load, not to whether this browser has seen it', () => {
    // Not gated on a persistent "seen it" flag: the screen exists to cover work
    // that really happens, and it happens on each *session*. Both renders here
    // are one page load as far as the policy is concerned — the module memo
    // holds the decision for the life of the page — so both get the screen.
    //
    // What a *second* page load gets is a different question, answered in
    // "shows a quick reload nothing at all" and "gives a slow reload the bar".
    const first = render(<IntroGate appReady><div /></IntroGate>)
    expect(screen.getByTestId('intro-sequence')).toBeInTheDocument()
    first.unmount()

    render(<IntroGate appReady><div /></IntroGate>)
    expect(screen.getByTestId('intro-sequence')).toBeInTheDocument()
  })

  it('waits for the app before handing over — never reveals a half-loaded screen', async () => {
    const { rerender } = render(<IntroGate appReady={false}><div /></IntroGate>)

    // Sequence long finished, app still loading.
    await advance(MIN_VISIBLE_MS + 2000)
    expect(screen.getByTestId('intro-sequence')).toBeInTheDocument()
    // The readout holds at the pause rather than climbing to 100 behind a wait.
    expect(screen.getByTestId('intro-status').textContent).toMatch(/^\d{2,3}$/)

    rerender(<IntroGate appReady><div /></IntroGate>)
    // The floor is already long past, so this is the bar closing plus the
    // handover — no extra minimum is charged for having waited.
    await advance(TAIL_MS)
    expect(screen.queryByTestId('intro-sequence')).toBeNull()
  })

  it('gets out of the way quickly when motion is reduced', async () => {
    preferReducedMotion()
    render(<IntroGate appReady><div /></IntroGate>)

    // Still shown — the preference asks for less movement, not for the brand to
    // be skipped. What it buys is a much shorter hold.
    expect(screen.getByTestId('intro-sequence')).toBeInTheDocument()

    await advance(REDUCED_VISIBLE_MS + TAIL_MS)
    expect(screen.queryByTestId('intro-sequence')).toBeNull()
  })

  it('still waits for the app when motion is reduced', async () => {
    // The shortened sequence must not turn into "hand over early": a reduced
    // hold that outran the load would reveal a half-built screen, which is a
    // worse experience than the animation it was meant to spare.
    preferReducedMotion()
    const { rerender } = render(<IntroGate appReady={false}><div /></IntroGate>)

    await advance(REDUCED_VISIBLE_MS + 2000)
    expect(screen.getByTestId('intro-sequence')).toBeInTheDocument()

    rerender(<IntroGate appReady><div /></IntroGate>)
    await advance(1000)
    expect(screen.queryByTestId('intro-sequence')).toBeNull()
  })

  it('gives up waiting rather than trapping someone behind it', async () => {
    // The curtain waiting for the app is right up until the app never arrives.
    // A permanently pending auth call would otherwise leave a visitor on a
    // screen with no controls and no way out, so the wait has a ceiling.
    render(<IntroGate appReady={false}><div /></IntroGate>)
    await advance(MAX_HOLD_MS + TAIL_MS)
    expect(screen.queryByTestId('intro-sequence')).toBeNull()
  })

  it('leaves on its own clock even if nothing animates', async () => {
    // The overlay must never depend on an animation reporting completion. This
    // is the whole reason the fade is CSS and the unmount is a timer: a stalled
    // frame loop should cost polish, never leave a black panel over the app.
    render(<IntroGate appReady><div /></IntroGate>)
    await advance(MIN_VISIBLE_MS + TAIL_MS)
    expect(screen.queryByTestId('intro-sequence')).toBeNull()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('never outlives its own ground on the way out', async () => {
    // The completion is a full-height green word in the middle of the screen.
    // The ground beneath it fades during the handover, so a completion layer
    // that only knows "before ready" and "after ready" keeps sitting there
    // while the app is revealed behind it — which is exactly what shipped
    // until a screenshot caught it mid-exit.
    //
    // Sampled as an invariant rather than at one chosen instant: the failure is
    // a *missing* state, and a single well-timed assertion would step over it.
    render(<IntroGate appReady><div /></IntroGate>)

    let sawTheExit = false
    // Past the completion hold, which is where the exit actually starts —
    // `TAIL_MS` alone stops short of it and the loop would never sample one.
    const window = MIN_VISIBLE_MS + TAIL_MS
    for (let t = 0; t < window; t += SLICE_MS) {
      await advance(SLICE_MS)
      const root = screen.queryByTestId('intro-sequence')
      if (!root) break

      const ground = root.firstElementChild as HTMLElement
      const layer = screen.queryByTestId('intro-complete-layer') as HTMLElement | null
      if (ground.style.opacity !== '0') continue

      sawTheExit = true
      expect(layer?.style.opacity).toBe('0')
    }

    // Guards the guard: if the exit were never reached the loop above would
    // pass by never asserting anything.
    expect(sawTheExit).toBe(true)
  })

  it('lets the app start its entrance before the curtain is gone', async () => {
    // The hero is held behind `data-intro` and needs 380ms to resolve. Releasing
    // it only once this component unmounts means the curtain pulls back on a
    // page that has not begun arriving yet — about seven hundred milliseconds of
    // black between the loading screen finishing and the landing page existing.
    // The release has to happen while the overlay is still up, so the two cross.
    render(<IntroGate appReady><div /></IntroGate>)

    let releasedWhileStillCovered = false
    const window = MIN_VISIBLE_MS + TAIL_MS
    for (let t = 0; t < window; t += SLICE_MS) {
      await advance(SLICE_MS)
      if (!screen.queryByTestId('intro-sequence')) break
      if (document.documentElement.dataset.intro === undefined) releasedWhileStillCovered = true
    }

    expect(releasedWhileStillCovered).toBe(true)
    expect(document.documentElement.dataset.intro).toBeUndefined()
  })

  it('welcomes the first load of a session and only that one', async () => {
    // The policy the whole split exists for. A training app is used repeatedly,
    // so a ceremony charged on every load scales its cost with how correctly
    // the product is being used.
    const first = render(<IntroGate appReady><div /></IntroGate>)
    expect(screen.getByText(enMessages.loader.eyebrow)).toBeInTheDocument()
    expect(screen.getByTestId('intro-complete-layer')).toBeInTheDocument()
    first.unmount()

    // A second load in the same session — a reload, or a hard navigation. The
    // module memo goes (the page was rebuilt); the session flag stays.
    resetIntroSession({ keepSession: true })
    render(<IntroGate appReady><div /></IntroGate>)
    expect(screen.queryByText(enMessages.loader.eyebrow)).toBeNull()
  })

  it('shows a quick reload nothing at all', async () => {
    // A loading screen must not outlast what it covers. On a cached reload the
    // app is ready in a fraction of the abbreviated timeline, so running that
    // timeline made the indicator the slowest part of the load — a bar that
    // reported nothing and simply performed.
    render(<IntroGate appReady><div /></IntroGate>)
    resetIntroSession({ keepSession: true })
    cleanup()

    render(<IntroGate appReady><div /></IntroGate>)
    expect(screen.queryByTestId('intro-sequence')).toBeNull()

    await advance(GRACE_MS + 200)
    expect(screen.queryByTestId('intro-sequence')).toBeNull()
    // And nothing was done to the page on the way past: no scroll lock, no
    // entrance flag for the app to animate out of.
    expect(document.documentElement.dataset.intro).toBeUndefined()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('gives a slow reload the bar, once the wait has earned it', async () => {
    render(<IntroGate appReady><div /></IntroGate>)
    resetIntroSession({ keepSession: true })
    cleanup()

    render(<IntroGate appReady={false}><div /></IntroGate>)
    // Nothing during the grace period, however slow the load turns out to be.
    expect(screen.queryByTestId('intro-sequence')).toBeNull()

    await advance(GRACE_MS + 100)
    // Still loading when the clock ran out, so the bar appears — the track and
    // the count, which are the part that reports real work.
    expect(screen.getByTestId('intro-sequence')).toBeInTheDocument()
    expect(screen.getByTestId('intro-status')).toBeInTheDocument()
    // But never the welcome. That belongs to arriving, not to reloading.
    expect(screen.queryByText(enMessages.loader.eyebrow)).toBeNull()
    expect(screen.queryByTestId('intro-complete-layer')).toBeNull()
  })

  it('shows nothing at all on the password-reset page', async () => {
    // Someone lands there from an email because they have just lost access to
    // their account. Five seconds of branding in front of the form is the worst
    // possible use of that moment — and it was what happened.
    const path = window.location.pathname
    window.history.replaceState({}, '', '/reset-password')
    try {
      render(<IntroGate appReady={false}><div>form</div></IntroGate>)
      expect(screen.queryByTestId('intro-sequence')).toBeNull()

      // Not even while the app is still loading, which is when an overlay
      // would otherwise be most justified.
      await advance(GRACE_MS + MIN_VISIBLE_MS)
      expect(screen.queryByTestId('intro-sequence')).toBeNull()
      // And nothing done to the page on the way past.
      expect(document.documentElement.dataset.intro).toBeUndefined()
      expect(document.body.style.overflow).not.toBe('hidden')
      expect(screen.getByText('form')).toBeInTheDocument()
    } finally {
      window.history.replaceState({}, '', path)
    }
  })

  it('still shows the welcome on every other route', async () => {
    // The suppression is a named list, not a general retreat.
    const path = window.location.pathname
    window.history.replaceState({}, '', '/login')
    try {
      render(<IntroGate appReady><div /></IntroGate>)
      expect(screen.getByTestId('intro-sequence')).toBeInTheDocument()
    } finally {
      window.history.replaceState({}, '', path)
    }
  })

  it('never withholds the welcome from a genuine first visit', async () => {
    // The asymmetry is deliberate: showing the ceremony too often is a small
    // cost, withholding it from someone arriving for the first time is not.
    render(<IntroGate appReady><div /></IntroGate>)
    expect(screen.getByTestId('intro-sequence')).toBeInTheDocument()
    expect(screen.getByText(enMessages.loader.eyebrow)).toBeInTheDocument()
  })

  it('still waits for the app on the abbreviated timeline', async () => {
    // The short version is allowed to drop the introduction. It is not allowed
    // to drop the reason the screen exists — handing over to a half-loaded app
    // is worse than any amount of ceremony.
    const { rerender } = render(<IntroGate appReady={false} brief><div /></IntroGate>)
    await advance(BRIEF_MIN_VISIBLE_MS + 2000)
    expect(screen.getByTestId('intro-sequence')).toBeInTheDocument()

    rerender(<IntroGate appReady brief><div /></IntroGate>)
    await advance(BRIEF.COMPLETE_MS + BRIEF.COMPLETE_HOLD_MS + BRIEF.EXIT_MS + 400)
    expect(screen.queryByTestId('intro-sequence')).toBeNull()
  })

  it('releases the app before the curtain on the abbreviated timeline too', async () => {
    // The handover hole was fixed once, on one timeline. A second set of
    // durations is a second chance to reintroduce it.
    //
    // Started unready on purpose: a ready abbreviated load now shows nothing at
    // all, so asserting the handover requires a load slow enough to have one.
    const { rerender } = render(<IntroGate appReady={false} brief><div /></IntroGate>)
    await advance(GRACE_MS + 50)
    rerender(<IntroGate appReady brief><div /></IntroGate>)

    let releasedWhileStillCovered = false
    const window = BRIEF_MIN_VISIBLE_MS + BRIEF.COMPLETE_MS + BRIEF.COMPLETE_HOLD_MS + BRIEF.EXIT_MS + 400
    for (let t = 0; t < window; t += SLICE_MS) {
      await advance(SLICE_MS)
      if (!screen.queryByTestId('intro-sequence')) break
      if (document.documentElement.dataset.intro === undefined) releasedWhileStillCovered = true
    }

    expect(releasedWhileStillCovered).toBe(true)
    expect(document.documentElement.dataset.intro).toBeUndefined()
  })

  it('does not cut the sequence short when the app is ready immediately', async () => {
    render(<IntroGate appReady><div /></IntroGate>)

    // Halfway through, the entrance is still on screen despite a ready app.
    await advance(MIN_VISIBLE_MS / 2)
    expect(screen.getByTestId('intro-sequence')).toBeInTheDocument()
  })
})
