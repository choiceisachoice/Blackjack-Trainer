import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { IntroSequence } from './IntroSequence'
import { isRepeatVisit } from './intro-session'

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
 * Shown on **every** load rather than once per browser. That is what separates
 * a loading screen from an entrance: it is tied to work actually happening, and
 * work happens every time. The cost is real — a returning visitor pays the
 * floor on each visit — and the floor is deliberately the smallest number that
 * still reads as deliberate rather than as a flash.
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
  // Covering from the first paint, not from an effect: mounting the overlay a
  // frame late lets the app flash behind it, which is the one thing a loading
  // screen exists to prevent.
  const [phase, setPhase] = useState<Phase>('playing')

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

  const beginReveal = useCallback(() => setRevealing(true), [])
  const finish = useCallback(() => setPhase('fading'), [])

  useEffect(() => {
    if (phase !== 'fading') return
    const timer = setTimeout(() => setPhase('done'), FADE_MS)
    return () => clearTimeout(timer)
  }, [phase])

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
    if (revealing || phase === 'done') return
    document.documentElement.dataset.intro = 'playing'
    return () => { delete document.documentElement.dataset.intro }
  }, [phase, revealing])

  // Scroll lock. Restores the previous value rather than assuming `visible`,
  // so a modal that locked scrolling before this mounted keeps its lock.
  useEffect(() => {
    if (phase === 'done') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [phase])

  return (
    <>
      {children}
      {phase !== 'done' && (
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
