/**
 * Cubic-bézier easing, evaluated the way CSS evaluates it.
 *
 * A motion piece needs its curves as *functions*, not as CSS strings: every
 * property is computed from one clock, so the whole thing can be paused and
 * scrubbed to an exact millisecond. That is not a luxury — it is the only way
 * to inspect timing, because timing is spacing and spacing is only visible when
 * you can stop time and sample it. (See the `motion-craft` skill.)
 *
 * The curve is the CSS one: P0 = (0,0), P3 = (1,1), with the two control points
 * given. `x` is the fraction of the duration elapsed; the returned `y` is the
 * fraction of the change applied.
 *
 * **`y` may leave 0…1 on purpose.** The spring-derived curves below have control
 * points above 1, which is how a bounce survives being flattened into a bézier.
 * Clamping the output here would quietly delete every overshoot in the file.
 */
export type Easing = (x: number) => number

const A = (a1: number, a2: number): number => 1 - 3 * a2 + 3 * a1
const B = (a1: number, a2: number): number => 3 * a2 - 6 * a1
const C = (a1: number): number => 3 * a1

/** Bézier value at parameter `t` for one axis. */
function value(t: number, a1: number, a2: number): number {
  return ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t
}

/** Derivative at `t`, used to steer Newton–Raphson. */
function slope(t: number, a1: number, a2: number): number {
  return 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1)
}

/**
 * Build an easing function from four control-point coordinates.
 *
 * The bézier is parametric, so `x` is not the parameter — it has to be solved
 * for. Newton–Raphson converges in a handful of steps for the well-behaved
 * curves used here; the bisection fallback covers the flat-slope case, where
 * Newton would divide by ~zero and fly off.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  // A straight line needs no solving, and this is the common case for effects.
  if (x1 === y1 && x2 === y2) return (x: number) => x

  return (x: number): number => {
    if (x <= 0) return 0
    if (x >= 1) return 1

    let t = x
    for (let i = 0; i < 8; i++) {
      const dx = value(t, x1, x2) - x
      if (Math.abs(dx) < 1e-6) return value(t, y1, y2)
      const d = slope(t, x1, x2)
      if (Math.abs(d) < 1e-6) break
      t -= dx / d
    }

    let lo = 0
    let hi = 1
    t = x
    for (let i = 0; i < 24; i++) {
      const cx = value(t, x1, x2)
      if (Math.abs(cx - x) < 1e-6) break
      if (cx > x) hi = t
      else lo = t
      t = (lo + hi) / 2
    }
    return value(t, y1, y2)
  }
}

/**
 * The curves, taken from published specs rather than invented.
 *
 * Naming follows the source so a reader can go check it. Values live in
 * `~/.claude/skills/motion-craft/motion-tokens.md` with their provenance.
 */
export const EASE = {
  linear: cubicBezier(0, 0, 1, 1),

  /** Material 3, legacy easing set. Large entrances and exits. */
  emphasizedDecelerate: cubicBezier(0.05, 0.7, 0.1, 1.0),
  emphasizedAccelerate: cubicBezier(0.3, 0.0, 0.8, 0.15),
  /** Material 3, legacy easing set. Small, utility movement. */
  standard: cubicBezier(0.2, 0.0, 0, 1.0),
  standardDecelerate: cubicBezier(0, 0, 0, 1),
  standardAccelerate: cubicBezier(0.3, 0, 1, 1),

  /**
   * Material 3 motion-physics springs, in their official web conversion.
   *
   * `spatial` curves overshoot — the second control point sits above 1. Use
   * them only on things that have a position or a size. Nothing that merely
   * fades is allowed to overshoot: no object in the world fades past invisible
   * and comes back, so it reads as a defect rather than as physics.
   */
  expressiveSpatial: cubicBezier(0.38, 1.21, 0.22, 1.0),
  expressiveFastSpatial: cubicBezier(0.42, 1.67, 0.21, 0.9),
  standardSpatial: cubicBezier(0.27, 1.06, 0.18, 1.0),
  /** `effects` curves never overshoot, and run about half as long. */
  standardEffects: cubicBezier(0.34, 0.8, 0.34, 1.0),
  expressiveEffects: cubicBezier(0.31, 0.94, 0.34, 1.0),
} as const satisfies Record<string, Easing>
