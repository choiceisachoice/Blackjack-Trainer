import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { IntroSequence } from './IntroSequence'
import { isRepeatVisit } from './intro-session'

/**
 * Routes that never get a loading screen, welcome or otherwise.
 *
 * These are not entrances. Someone arriving at `/reset-password` clicked a link
 * in an email because they have just lost access to their account — the worst
 * possible moment to be shown five seconds of branding before the form appears.
 * A loading screen belongs on the way in, not in front of an emergency exit.
 *
 * Read from `window.location` rather than from the router, and that is the
 * accurate signal rather than the convenient one: this gate is about the *page
 * load*, not about navigation. Only a fresh load can show an intro at all —
 * which is exactly what following a link from an email is. Navigating here from
 * inside the app cannot bring one back, because it is long finished.
 *
 * It also keeps the gate independent of the router it happens to sit above.
 * Reaching for `useLocation` coupled a page-load concern to router context and
 * broke every test that renders this component on its own.
 */
const NO_INTRO_PATHS = ['/reset-password']

/**
 * How long the overlay lingers after the sequence hands over.
 *
 * Short, because the sequence performs its own transition: it retracts a
 * curtain until only a one-pixel line is left, sitting exactly where the app
 * draws its header border. There is nothing left to dissolve — this is only a
 * guard against a sub-pixel mismatch between the two lines showing as a flicker
 * at the moment of unmount.
 */
const FADE_MS = 160

/**
 * How long a *repeat* load is allowed to finish in before it gets any screen
 * at all.
 *
 * The rule this enforces: a loading screen must never take longer than the
 * thing it covers. On a refresh the chunks are cached and the session is
 * usually resolved in a couple of hundred milliseconds, but the abbreviated
 * timeline ran a fixed ~920ms regardless — so the indicator became the slowest
 * part of the load. It was no longer reporting anything, it was performing, and
 * that is exactly what it looked like: a bar that snapped across the screen for
 * no reason and vanished.
 *
 * Below this threshold nothing is shown, because nothing needed covering. Above
 * it the bar appears and stays as long as the load actually does. The welcome
 * keeps its meaning by happening when you arrive, not on every reload.
 */
export const GRACE_MS = 250

type Phase = 'playing' | 'fading' | 'done'

/**
 * Plays the entrance once, then gets out of the way permanently.
 *
 * Wraps the whole app rather than living inside a route, because the sequence
 * has to cover the very first paint — mounted one level down it would appear
 * *after* the thing it is supposed to introduce.
 *
 * The app renders underneath the whole time. That is what makes the handover a
 * dissolve rather than a cut: when the overlay fades, what appears behind it has
 * already loaded, laid out and settled. Nothing pops in.
 *
 * Tied to work actually happening, which is what separates a loading screen
 * from an entrance. Three outcomes, in order of how often they occur:
 *
 *  - **First load of a session** — the full welcome. There is genuine cold-start
 *    work to cover (auth resolving, route chunks arriving) and this is the one
 *    moment the introduction is worth anyone's time.
 *  - **A refresh that is quick** — nothing at all. See `GRACE_MS`.
 *  - **A refresh that is slow** — the bar alone, for as long as the load takes.
 *
 * An earlier version showed the abbreviated bar on every repeat load, floor and
 * all. That charged a returning visitor ~920ms for a load that had usually
 * finished in a fifth of it.
 *
 * **The unmount is driven by a clock, not by the animation.** An earlier version
 * handed the overlay to `AnimatePresence` and let the exit animation decide when
 * the node left the tree. That inverts the dependency: a fade that never reports
 * completion — a stalled frame loop, a renderer that declines to interpolate a
 * value, a tab restored from the background — leaves a full-screen black panel
 * parked over the app with no way out. It happened here on the first run of the
 * tests. This is the first screen a new visitor ever sees, so it takes the
 * version that cannot strand them: the fade is decoration, the timer is the
 * mechanism, and the overlay leaves after `FADE_MS` whether anything animated
 * or not.
 */
export function IntroGate({
  appReady = true,
  brief,
  children,
}: {
  /** Whether the app behind the overlay has finished its own loading. */
  appReady?: boolean
  /**
   * Force the abbreviated timeline on or off, instead of asking the session.
   *
   * For the dev harness and for tests, which need both branches on demand.
   * Production leaves it unset.
   */
  brief?: boolean
  children: ReactNode
}) {
  const [suppressed] = useState(() => {
    try {
      return NO_INTRO_PATHS.includes(window.location.pathname)
    } catch {
      return false
    }
  })

  // Covering from the first paint, not from an effect: mounting the overlay a
  // frame late lets the app flash behind it, which is the one thing a loading
  // screen exists to prevent. Except where it is suppressed outright, where
  // starting at `done` means not one frame of overlay is ever painted.
  const [phase, setPhase] = useState<Phase>(() => (suppressed ? 'done' : 'playing'))

  /**
   * Whether the app behind may start its own entrance.
   *
   * Separate from `phase` because it flips a full `EXIT_MS` earlier. The two
   * were the same flag once, and the cost was a black screen: the curtain
   * finished leaving, *then* the app began a 380ms fade from nothing, so the
   * gap between them had neither on it.
   */
  const [revealing, setRevealing] = useState(false)

  /**
   * Whether this load gets the abbreviated timeline.
   *
   * Held in state so it is read once and cannot change under a re-render: the
   * sequence's own clock is keyed off it, and flipping it mid-flight would
   * restart that clock.
   */
  const [isBrief] = useState(() => brief ?? isRepeatVisit())

  /**
   * Whether this load is still deciding if it needs a screen at all.
   *
   * Only a repeat load waits: the ceremony covers the first paint and must be
   * up from the very first frame, so it never enters this state.
   */
  const [deciding, setDeciding] = useState(isBrief)

  const beginReveal = useCallback(() => setRevealing(true), [])
  const finish = useCallback(() => setPhase('fading'), [])

  // Read inside the timer below, so the grace period can be resolved in one
  // place instead of racing a second effect that watches `appReady`.
  const readyRef = useRef(appReady)
  useEffect(() => { readyRef.current = appReady }, [appReady])

  /**
   * The grace period, resolved by a single timer.
   *
   * Deliberately one decision point. The obvious shape is two effects — one
   * counting down, another watching `appReady` — and that version both raced
   * itself and tripped `react-hooks/set-state-in-effect`, which was right to
   * complain: state written synchronously from an effect body over a value that
   * changes underneath it. Asking the question once, when the clock runs out,
   * is simpler and has no ordering to get wrong.
   */
  useEffect(() => {
    if (!deciding) return
    const timer = setTimeout(() => {
      // Ready in time: the load never needed covering, so nothing was shown and
      // there is nothing to hand over. Otherwise the bar has earned its place.
      if (readyRef.current) setPhase('done')
      else setDeciding(false)
    }, GRACE_MS)
    return () => clearTimeout(timer)
  }, [deciding])

  useEffect(() => {
    if (phase !== 'fading') return
    const timer = setTimeout(() => setPhase('done'), FADE_MS)
    return () => clearTimeout(timer)
  }, [phase])

  /**
   * Whether anything is on screen.
   *
   * Everything the gate does to the page — the overlay, the scroll lock, the
   * `data-intro` flag the app's own entrance keys off — hangs off this one
   * value. During the grace period the answer is no, so a quick refresh is not
   * briefly scroll-locked and blurred before flashing into place.
   */
  const showing = phase !== 'done' && !deciding && !suppressed

  /**
   * Tell the document that a loading screen is up.
   *
   * An attribute rather than a context: the app's own entrance — the hero title
   * coming out of a dark blur — is a CSS concern, and threading a boolean
   * through the tree to switch a transition on would mean re-rendering the page
   * to do something the compositor can do on its own. Absent means "no loading
   * screen", so anything keyed off it is visible by default and nothing depends
   * on this component existing.
   */
  useEffect(() => {
    if (revealing || !showing) return
    document.documentElement.dataset.intro = 'playing'
    return () => { delete document.documentElement.dataset.intro }
  }, [showing, revealing])

  // Scroll lock. Restores the previous value rather than assuming `visible`,
  // so a modal that locked scrolling before this mounted keeps its lock.
  useEffect(() => {
    if (!showing) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [showing])

  return (
    <>
      {children}
      {showing && (
        <div
          className="fixed inset-0 z-[10000]"
          // Opacity is an inline style rather than a utility class on purpose.
          // The dissolve is the single most visible thing this component does,
          // and measuring it in the browser showed it was not running at all —
          // the overlay cut to the app instead of fading. An inline style cannot
          // be dropped by class generation, cannot lose a specificity fight, and
          // reads the same in the source as it does on screen.
          //
          // `pointer-events` drops the moment the fade begins, so the app
          // underneath is usable for the whole handover rather than only once
          // the overlay is gone.
          style={{
            opacity: phase === 'fading' ? 0 : 1,
            pointerEvents: phase === 'fading' ? 'none' : 'auto',
            transition: `opacity ${FADE_MS}ms linear`,
            willChange: 'opacity',
          }}
        >
          <IntroSequence
            appReady={appReady}
            brief={isBrief}
            onFinish={finish}
            onLeaving={beginReveal}
          />
        </div>
      )}
    </>
  )
}
