/**
 * Choreography for the welcome loading screen.
 *
 * ## The idea
 *
 * A greeting, the name, and a slot with a card being pushed through it.
 *
 * `WELCOME TO` rises from behind its own edge, the name follows it up, and a
 * track unfolds beneath — **at exactly the width of the wordmark**, so it is the
 * measure of the name rather than an arbitrary rule under it. The track is
 * visible and empty before anything fills it: you see what is being filled
 * before it fills.
 *
 * Riding the head of the fill is a card, standing slightly proud of the slot,
 * travelling left to right as the load advances. It is the only added object on
 * the screen and it carries the whole blackjack idea — a card being dealt out of
 * a shoe — without a single suit symbol or chip.
 *
 * The fill runs at **one constant tempo**. A progress bar measures something; it
 * should not perform. It stops at 89% while the app is still loading and
 * completes when it is ready, after which the track widens to the full viewport
 * and rises to `62px` — where both the landing page's header and the trainer's
 * NavBar draw their bottom border. The last element of the loading screen is the
 * first line of the app.
 *
 * Nothing fades. Every piece of type arrives from behind a mask on `transform`
 * alone and leaves the same way.
 *
 * ## Why this file is pure
 *
 * Timing is the design, and design you cannot assert on is design that drifts.
 * The curve, the hold and the budget live out here so a test can check that the
 * bar never runs backwards, that it really keeps one tempo, that it stops short
 * of full while someone is waiting, and that it completes from wherever it had
 * got to.
 */

/**
 * Where the bar waits.
 *
 * A progress bar sitting at 100% while someone is still waiting is a lie they
 * can see. It stops here and stays until the app is genuinely ready — the pause
 * is the only honest thing a determinate bar can do when the work that remains
 * has no known duration.
 */
export const HOLD_AT = 0.89

/** Entrance beats, in ms from mount. */
export const EYEBROW_AT = 60
export const WORDMARK_AT = 200
/** When the empty track unfolds — before anything fills it. */
export const TRACK_AT = 640
export const READOUT_AT = 860
/** When the rider card appears — after the empty track has been seen, never with it. */
export const CARD_AT = TRACK_AT + 360
/** How long a masked line takes to rise into place. */
export const RISE_MS = 900

/**
 * When the fill starts, and how long it takes to reach the hold.
 *
 * The travel is the slowest part of the screen on purpose. At 1500ms the bar
 * crossed its own track faster than the eye follows it, so the one element that
 * is actually reporting something read as a formality. A progress bar is the
 * only honest thing here — it should be the thing you have time to watch.
 */
export const FILL_FROM = 980
export const FILL_MS = 2500

/** Closing the last stretch once the app reports ready. */
export const COMPLETE_MS = 380

/**
 * How long the completion owns the screen.
 *
 * Long enough for the whole moment to play and then be read: the loading
 * composition clears, the ring lands, the tick draws, the word rises, and it
 * holds. Roughly 760ms of that is the animation itself, so this is a beat of
 * stillness on top rather than a pause with nothing in it — which is what the
 * earlier, shorter hold amounted to.
 *
 * Around 700ms of it is the completion animating itself in, so the rest is the
 * stillness that makes it a moment rather than a step. At 1250 there were about
 * 170ms of that left — the thing was over as soon as it had arrived.
 */
export const COMPLETE_HOLD_MS = 1450

/**
 * The handover.
 *
 * Kept under half a second on purpose. The first version ran 700ms and handed
 * off to a hero that then took another second to resolve out of its blur —
 * better than two seconds of screen with nothing happening on it, right after
 * the bar had already said it was finished. Nothing in a UI transition should
 * outlast about half a second; past that the eye has finished reading the change
 * and is waiting for the software.
 */
export const EXIT_MS = 360

/**
 * How long the checkmark takes to land.
 *
 * Short, and with no delay in front of it. The confirmation is the whole point
 * of the moment: it has to be *there* the instant the bar reaches full, not
 * begin arriving then. This is the same principle as the optimistic write on
 * the training path — show the success immediately, do not stage it.
 */
export const CHECK_MS = 200

/**
 * The shortest the screen can be up.
 *
 * Equal to the end of the fill, deliberately: leaving earlier would cut the bar
 * off mid-travel, which is the one thing a progress indicator must never do. A
 * test holds the two together so the floor cannot be tuned down without the
 * consequence being visible.
 */
export const MIN_VISIBLE_MS = FILL_FROM + FILL_MS

/**
 * How long the screen will wait for an app that never arrives.
 *
 * Holding until the app is ready is right up until it never is — a permanently
 * pending call would otherwise leave someone on a screen with no controls and
 * no way out. Past this it completes and hands over regardless.
 */
export const MAX_HOLD_MS = 9000

/**
 * The reduced-motion timeline.
 *
 * Not the same thing played faster. Someone who asked the system for less
 * motion gets the composition already assembled and the bar already full, held
 * briefly, then the same handover. Less movement, not less product.
 */
export const REDUCED_VISIBLE_MS = 700

/**
 * The abbreviated timeline, for a repeat load inside the same session.
 *
 * ## Why there are two
 *
 * "Covers the load" and "performs the welcome" were one thing, and they are not
 * the same job. The loader has to appear on **every** visit, because work
 * happens on every visit. The ceremony does not — and this is a training app,
 * whose entire value is in coming back. At the full length someone practising
 * five times a week spends about half a minute a week watching a logo they
 * already know, and the cost grows the more correctly they use the product.
 * That is the wrong way round for the tax to scale.
 *
 * So the first load of a session gets the whole thing: the greeting, the name,
 * the completion. Every load after it gets this — the same track, the same card
 * riding the same honest progress, and none of the introduction. It still waits
 * for the app, still holds short of full while there is something to wait for,
 * still hands over on the header line. It is the same screen with nothing on it
 * that only needed saying once.
 *
 * Deliberately not "the same thing, faster". Playing a five-second composition
 * at three times speed reads as a glitch; leaving out the parts that are pure
 * introduction reads as a product that knows you have been here before.
 */
export const BRIEF = {
  TRACK_AT: 40,
  READOUT_AT: 90,
  CARD_AT: 120,
  /** Shorter than the ceremony's 900 — a 900ms rise inside a 920ms bar arrives after it. */
  RISE_MS: 420,
  FILL_FROM: 160,
  FILL_MS: 760,
  COMPLETE_MS: 260,
  /**
   * Enough that full is seen, not enough to be a pause.
   *
   * There is no completion card here, so this is only the beat that stops the
   * bar reaching 100% and vanishing in the same frame — which would mean nobody
   * ever saw it arrive.
   */
  COMPLETE_HOLD_MS: 140,
  EXIT_MS: 300,
} as const

/** @see MIN_VISIBLE_MS — the same rule, on the abbreviated clock. */
export const BRIEF_MIN_VISIBLE_MS = BRIEF.FILL_FROM + BRIEF.FILL_MS

/**
 * The parts of a timeline the progress curve actually needs.
 *
 * Passed in rather than read from the module so the same curve serves both
 * timelines — the *shape* of honest progress is not a property of how long the
 * screen is up, and duplicating the function per timeline would be the way to
 * end up with two that disagree.
 */
export interface FillTiming {
  FILL_FROM: number
  FILL_MS: number
  COMPLETE_MS: number
}

const CEREMONY_FILL: FillTiming = { FILL_FROM, FILL_MS, COMPLETE_MS }

/**
 * The last stretch, once there is nothing left to wait for.
 *
 * Linear, like the rest of the bar — and that is a correction, not a shortcut.
 * It was a cubic ease-out, which sounds like the polished choice and reads as
 * the opposite: a decelerating tail spends most of its time in the final few
 * percent, so the readout sat on 95 for four hundred milliseconds before
 * reaching 100. The bar appeared to hang at the exact moment it was supposed to
 * be finishing.
 *
 * A conclusion should arrive. Ease-out is for things settling into place, not
 * for the last inch of a measurement.
 */
export function completeCurve(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * How full the bar is at a given moment, 0..1.
 *
 * `readyAtMs` is when the app reported ready — `null` while it still has not.
 * Completion runs from the hold, and never begins before the fill has finished
 * its own travel: a connection that resolves at mount would otherwise snap the
 * bar from nothing to full, which is not a loading screen, it is a flash.
 */
export function progressAt(
  elapsedMs: number,
  readyAtMs: number | null,
  timing: FillTiming = CEREMONY_FILL,
): number {
  const x = (elapsedMs - timing.FILL_FROM) / timing.FILL_MS
  const loading = HOLD_AT * (x < 0 ? 0 : x > 1 ? 1 : x)
  if (readyAtMs === null) return loading

  const startAt = Math.max(readyAtMs, timing.FILL_FROM + timing.FILL_MS)
  if (elapsedMs < startAt) return loading

  return HOLD_AT + (1 - HOLD_AT) * completeCurve((elapsedMs - startAt) / timing.COMPLETE_MS)
}

/** The percentage shown beside the bar. Floors, so it never claims more than the bar shows. */
export function percentAt(progress: number): number {
  return Math.floor(progress * 100)
}

/**
 * The words.
 *
 * `WELCOME TO` above the name reads as one sentence across two typographic
 * levels. The status line says what is happening in the product's own language —
 * a table being prepared, not assets being fetched.
 */
export const EYEBROW = 'Welcome to'
export const WORDMARK_STRONG = 'BlackjackTrainer'
export const WORDMARK_LIGHT = '.com'
export const STATUS = 'Preparing the table'
/** What the status says once there is nothing left to prepare. */
export const STATUS_DONE = 'Complete'
