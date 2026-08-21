import { EASE, type Easing } from './easing'

/**
 * Reading a timeline as a pure function of one clock.
 *
 * Every animated value in a piece is `f(now)`. Nothing holds state, nothing
 * remembers what it did last frame. Two things fall out of that, and both are
 * the reason it is built this way:
 *
 * - **It is seekable.** Jump the clock to 7,340 ms and the whole frame is
 *   exactly what it would have been at 7,340 ms. That makes the piece
 *   inspectable: stop it, sample it at even intervals, and read the spacing.
 * - **It cannot drift.** A stateful animation that misses a frame accumulates
 *   error; this one re-derives from the clock and is simply correct at whatever
 *   moment it is asked about.
 */

/**
 * Eased progress of one track, clamped to 0…1 in *time*.
 *
 * Before `start` it is 0, after `start + duration` it is 1, and the easing is
 * free to leave that range in between — that is where overshoot lives.
 */
export function at(now: number, start: number, duration: number, ease: Easing = EASE.standard): number {
  if (duration <= 0) return now >= start ? 1 : 0
  const x = (now - start) / duration
  if (x <= 0) return 0
  if (x >= 1) return 1
  return ease(x)
}

/** Interpolate, allowing `p` outside 0…1 so overshoot carries through. */
export function lerp(from: number, to: number, p: number): number {
  return from + (to - from) * p
}

/**
 * A track's eased progress, mapped straight onto a range.
 *
 * The common case, and worth its own name: `track(now, 900, 620, -40, 0)` reads
 * as "from 900 ms, over 620 ms, move from -40 to 0".
 */
export function track(
  now: number,
  start: number,
  duration: number,
  from: number,
  to: number,
  ease: Easing = EASE.standard,
): number {
  return lerp(from, to, at(now, start, duration, ease))
}

/**
 * Start time of item `index` in a staggered group.
 *
 * The step is deliberately a *parameter* and not a constant: 20 ms is right for
 * table rows and wrong for anything the eye tracks individually. What stays
 * fixed is the budget — the whole group should land inside roughly 500 ms
 * unless it is an expressive moment that has earned longer.
 */
export function stagger(start: number, index: number, step: number): number {
  return start + index * step
}

/** True while `now` sits inside the half-open window — for mount/unmount gates. */
export function during(now: number, start: number, end: number): boolean {
  return now >= start && now < end
}
