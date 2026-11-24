import { useLayoutEffect, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react'

/**
 * Where the review after a hand is drawn, and how large.
 *
 * Three places, by screen: beside the felt from 1024px wide (in the room left
 * and right of the table where there is enough, over the felt's edge away
 * from the player where there is not), a sheet over the controls on an
 * upright phone, reaching up to just under the player's cards, and the
 * controls column on a phone held sideways. The felt itself never resizes
 * for the review.
 */

/** Where the review is drawn. */
export type ReviewPlacement = 'side' | 'sheet' | 'column'

/** A phone held sideways — the table's `short` variant. */
const COLUMN_QUERY = '(max-height: 520px) and (orientation: landscape)'
/** Wide enough for a panel beside (or over the edge of) the felt. */
const SIDE_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const queries = [window.matchMedia(COLUMN_QUERY), window.matchMedia(SIDE_QUERY)]
  queries.forEach(q => q.addEventListener('change', onChange))
  return () => queries.forEach(q => q.removeEventListener('change', onChange))
}

function placementNow(): ReviewPlacement {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'side'
  if (window.matchMedia(COLUMN_QUERY).matches) return 'column'
  return window.matchMedia(SIDE_QUERY).matches ? 'side' : 'sheet'
}

/**
 * Where the review goes on this screen: `side` from 1024px wide, `column` on
 * a phone held sideways, `sheet` otherwise. `side` where `matchMedia` is
 * missing (tests, the server).
 */
export function useReviewPlacement(): ReviewPlacement {
  return useSyncExternalStore(subscribe, placementNow, () => 'side')
}

/**
 * The side the panel docks to on a desktop.
 *
 * Where the screen leaves room beside the felt it covers nothing either way.
 * Where it has to overlap the felt, it covers the two seats at that end
 * (seats 1–2 or 5–6), so: never the player's own hands if the other end is
 * free of them, and otherwise the end with fewer other players — an empty
 * seat is the best thing to cover. The right when it is a tie.
 *
 * @param playerSeats - The seats (0–5) of the player's hands
 * @param botSeats - The seats (0–5) the other players sit in
 */
export function reviewSide(playerSeats: readonly number[], botSeats: readonly number[] = []): 'left' | 'right' {
  const atLeft = (s: number) => s <= 1
  const atRight = (s: number) => s >= 4
  const mineLeft = playerSeats.some(atLeft)
  const mineRight = playerSeats.some(atRight)
  if (mineRight && !mineLeft) return 'left'
  if (mineLeft && !mineRight) return 'right'
  return botSeats.filter(atRight).length > botSeats.filter(atLeft).length ? 'left' : 'right'
}

/** Narrowest the side panel is drawn; below this much room beside the felt it overlaps the felt's edge. */
const SIDE_MIN = 320
/** Widest it is drawn, however much room there is. */
const SIDE_MAX = 440
/** Width when it has to overlap the felt. */
const SIDE_OVERLAP = 368
const EDGE = 18

/**
 * Where the side panel sits in the table's box: centred in the room beside
 * the felt when there is enough of it (a wide screen leaves a third of its
 * width empty there), otherwise over the felt's edge on the given side, as
 * narrow as it reads well. Top-aligned with the felt; a long hand may take it
 * down past the felt to the foot of the box (the table and its controls).
 *
 * Pure, so the geometry is tested without a browser.
 *
 * @param box - The table's box (the panel's containing block), in px
 * @param felt - The felt's rectangle, relative to that box
 * @param side - The edge the panel docks to
 */
export function sideDock(
  box: { width: number; height: number },
  felt: { left: number; top: number; right: number; bottom: number },
  side: 'left' | 'right',
): CSSProperties {
  const room = side === 'right' ? box.width - felt.right : felt.left
  const fits = room - EDGE * 2 >= SIDE_MIN
  const width = fits ? Math.min(SIDE_MAX, room - EDGE * 2) : Math.min(SIDE_OVERLAP, box.width - EDGE * 2)
  const offset = fits ? Math.round((room - width) / 2) : EDGE
  const top = Math.max(EDGE, Math.round(felt.top) + 6)
  return {
    position: 'absolute',
    top,
    [side]: offset,
    width,
    // Down to the foot of the box: a long hand may reach past the felt, beside the controls.
    maxHeight: Math.max(160, Math.round(box.height - top - EDGE)),
  }
}

/**
 * The side panel's style, measured from the table's box and the felt in it,
 * and kept current while the review is open (a resized window moves both).
 *
 * @param boxRef - The element the panel is positioned in (the table and its controls); it must contain the felt
 * @param side - The edge to dock to
 * @param active - Whether the panel is on screen (nothing is measured otherwise)
 */
export function useSideDock(boxRef: RefObject<HTMLElement | null>, side: 'left' | 'right', active: boolean): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined)
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!active || !box) return
    const measure = () => {
      const felt = box.querySelector('[data-testid="felt-box"]')
      const b = box.getBoundingClientRect()
      if (!felt || b.width === 0) return
      const f = felt.getBoundingClientRect()
      setStyle(sideDock(
        { width: b.width, height: b.height },
        { left: f.left - b.left, top: f.top - b.top, right: f.right - b.left, bottom: f.bottom - b.top },
        side,
      ))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [boxRef, side, active])
  return style
}

/** The room the label under a hand needs (its total, a blackjack ribbon). */
const HAND_LABEL = 30
/** The sheet is never shorter than this, even where it must reach over the hand's label. */
const SHEET_MIN = 260

/**
 * How tall the phone's sheet may be: from the foot of the screen's table area
 * up to just under the player's cards, so the hand stays in sight while it is
 * reviewed.
 *
 * @param boxRef - The element the sheet is anchored to the bottom of
 * @param active - Whether the sheet is on screen
 */
export function useSheetRoom(boxRef: RefObject<HTMLElement | null>, active: boolean): number | undefined {
  const [room, setRoom] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!active || !box) return
    const measure = () => {
      const b = box.getBoundingClientRect()
      const cards = [...box.querySelectorAll('[data-testid="human-seat"] [data-card]')]
      if (cards.length === 0 || b.height === 0) return
      const lowest = Math.max(...cards.map(c => c.getBoundingClientRect().bottom))
      setRoom(Math.max(SHEET_MIN, Math.round(b.bottom - lowest - HAND_LABEL)))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [boxRef, active])
  return room
}

