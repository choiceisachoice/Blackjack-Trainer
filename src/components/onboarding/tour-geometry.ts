/**
 * Where to put a tour callout so it points at a thing without falling off the
 * screen.
 *
 * Pure arithmetic, deliberately separated from the component. Positioning bugs
 * are off-by-a-viewport-edge bugs, and those are far cheaper to catch with
 * numbers than by dragging a browser window to 320px and squinting.
 */

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** Which side of the target the callout sits on — the arrow points the other way. */
export type Side = 'top' | 'bottom' | 'left' | 'right'

export interface Placement {
  side: Side
  /** Callout position in viewport coordinates. */
  top: number
  left: number
  /** Arrow tip, in viewport coordinates: the point on the target being indicated. */
  arrowX: number
  arrowY: number
}

/** Keep a value inside `[min, max]`, tolerating an inverted range. */
export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * Trim a target to the part of it that is actually on screen.
 *
 * Without this, a tall container makes the tour nonsense. Measured in the real
 * app: the plan's own wrapper is 3954px tall, so spotlighting it dimmed nothing
 * and the arrow pointed 1250px below the fold at a target that filled the
 * screen. Highlighting everything highlights nothing.
 *
 * Clamped, an oversized anchor still gets a sensible spotlight and an arrow
 * that lands somewhere visible. Choosing a smaller anchor is the better fix and
 * this is the floor under it — anchors come from the page, and pages change.
 */
export function clampToViewport(target: Rect, viewport: Size, inset = 8): Rect {
  const top = clamp(target.top, inset, Math.max(inset, viewport.height - inset))
  const left = clamp(target.left, inset, Math.max(inset, viewport.width - inset))
  const bottom = clamp(target.top + target.height, top, Math.max(top, viewport.height - inset))
  const right = clamp(target.left + target.width, left, Math.max(left, viewport.width - inset))

  return { top, left, width: right - left, height: bottom - top }
}

/**
 * Pick a side with room for the callout, preferring below the target.
 *
 * Below first because that is where the eye already is after reading the thing
 * being pointed at, and because a callout above a target near the top of the
 * page is the one case that reliably goes off-screen.
 */
export function chooseSide(target: Rect, callout: Size, viewport: Size, gap: number): Side {
  const below = viewport.height - (target.top + target.height) - gap
  const above = target.top - gap
  const right = viewport.width - (target.left + target.width) - gap
  const left = target.left - gap

  if (below >= callout.height) return 'bottom'
  if (above >= callout.height) return 'top'
  if (right >= callout.width) return 'right'
  if (left >= callout.width) return 'left'

  // Nothing fits — take the side with the most room rather than picking a
  // fixed fallback that could be the worst of the four.
  const best = Math.max(below, above, right, left)
  return best === below ? 'bottom' : best === above ? 'top' : best === right ? 'right' : 'left'
}

/**
 * Place a callout against a target.
 *
 * The result is always inside the viewport, even when the target is not: a
 * callout pointing off-screen is useless, but an invisible one is worse — it
 * takes the whole tour with it.
 */
export function placeCallout(
  target: Rect,
  callout: Size,
  viewport: Size,
  gap = 16,
  margin = 12,
): Placement {
  const side = chooseSide(target, callout, viewport, gap)

  const centreX = target.left + target.width / 2
  const centreY = target.top + target.height / 2

  const maxLeft = viewport.width - callout.width - margin
  const maxTop = viewport.height - callout.height - margin

  let top: number
  let left: number

  switch (side) {
    case 'bottom':
      top = target.top + target.height + gap
      left = centreX - callout.width / 2
      break
    case 'top':
      top = target.top - callout.height - gap
      left = centreX - callout.width / 2
      break
    case 'right':
      top = centreY - callout.height / 2
      left = target.left + target.width + gap
      break
    case 'left':
      top = centreY - callout.height / 2
      left = target.left - callout.width - gap
      break
  }

  return {
    side,
    top: clamp(top, margin, maxTop),
    left: clamp(left, margin, maxLeft),
    // The arrow points at the target's edge facing the callout, so it stays
    // attached to the thing even after the callout has been clamped away.
    arrowX: side === 'left' ? target.left
      : side === 'right' ? target.left + target.width
      : clamp(centreX, target.left, target.left + target.width),
    arrowY: side === 'top' ? target.top
      : side === 'bottom' ? target.top + target.height
      : clamp(centreY, target.top, target.top + target.height),
  }
}
