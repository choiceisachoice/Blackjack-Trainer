/**
 * The pure half of Deck Estimation: the answer options, what an estimate does
 * to a true count, and where the feedback marks go on the tray.
 *
 * Kept out of the components so each rule has a test that needs no DOM.
 */

/** An estimate within this many decks of the truth counts as right. */
export const DECK_TOLERANCE = 0.5

/** Whole decks or half decks, as the setup offers them. */
export type DeckPrecision = 'half' | 'whole'

/**
 * The answers a round offers, lowest first: every half deck from 0.5, or
 * every whole deck from 1, up to the shoe's size.
 */
export function deckOptions(maxDecks: number, precision: DeckPrecision): number[] {
  const step = precision === 'half' ? 0.5 : 1
  const options: number[] = []
  for (let d = step; d <= maxDecks + 1e-9; d += step) options.push(Math.round(d * 2) / 2)
  return options
}

/** Whether an answer is close enough to the truth to be scored right. */
export function isAcceptable(answer: number, actualDecks: number): boolean {
  return Math.abs(answer - actualDecks) <= DECK_TOLERANCE + 1e-9
}

/**
 * A deck count the way the reader's language writes it — "1.5" in English,
 * "1,5" in German. `fixed` keeps one decimal on a measured value ("2.0").
 */
export function formatDecks(n: number, locale: string, fixed = false): string {
  return n.toLocaleString(locale, { minimumFractionDigits: fixed ? 1 : 0, maximumFractionDigits: 1 })
}

/** An estimate's difference from the truth, signed: below zero means fewer decks guessed than remain. */
export function signedError(answer: number, actualDecks: number): number {
  return answer - actualDecks
}

/** What an estimate does to every true count made with it. */
export interface TcSkew {
  /** `high`: fewer decks guessed than remain, so the count is divided by too little. */
  kind: 'high' | 'low' | 'exact'
  /** How far off every true count reads, as a fraction (0.25 = 25 %). */
  fraction: number
}

/**
 * The true count is the running count divided by the decks remaining. Divide
 * by a guess instead and every true count is off by the same factor —
 * `actual / guess` — whatever the running count is. That is the line the
 * drill can say without knowing a running count.
 *
 * Off by less than half a percent reads as exact.
 */
export function tcSkew(guess: number, actualDecks: number): TcSkew {
  const ratio = actualDecks / guess
  if (Math.abs(ratio - 1) < 0.005) return { kind: 'exact', fraction: 0 }
  return ratio > 1 ? { kind: 'high', fraction: ratio - 1 } : { kind: 'low', fraction: 1 - ratio }
}

/**
 * Where a number of decks remaining sits on the tray, in px from the top of
 * its inside: none left is the top (the tray full of discards), the whole
 * shoe left is the bottom (nothing dealt yet).
 */
export function levelY(decksRemaining: number, totalDecks: number, height: number): number {
  const share = Math.min(1, Math.max(0, decksRemaining / Math.max(totalDecks, 1e-9)))
  return Math.round(share * height)
}

/**
 * Two labels for two lines that may lie close together: each at its line,
 * pushed apart around their midpoint where they would overlap, and kept
 * inside `[0, height]`. Returns the label centres in the order given.
 */
export function separateLabels(a: number, b: number, minGap: number, height: number): [number, number] {
  if (Math.abs(a - b) >= minGap) return [a, b]
  const mid = (a + b) / 2
  const aAbove = a < b || (a === b)
  let top = mid - minGap / 2
  let bottom = mid + minGap / 2
  const half = minGap / 2
  if (top < half) { top = half; bottom = half + minGap }
  if (bottom > height - half) { bottom = height - half; top = bottom - minGap }
  return aAbove ? [top, bottom] : [bottom, top]
}

/**
 * Remaining cards for a new question, weighted towards the positions a
 * counter meets most: 70 % between 30 and 80 % of the shoe left, 15 % from
 * 10 to 30 %, 15 % from 80 to 95 %. Never fewer than one card.
 */
export function generateRemainingCards(totalCards: number, random: () => number = Math.random): number {
  const u = random()
  let fraction: number
  if (u < 0.7) fraction = 0.3 + random() * 0.5
  else if (u < 0.85) fraction = 0.1 + random() * 0.2
  else fraction = 0.8 + random() * 0.15
  return Math.max(1, Math.round(fraction * totalCards))
}

// ─── The tray's layout ─────────────────────────────────

/** Space above the tray for the ruler's caption and its top label, px. */
export const TRAY_TOP = 26
/** The tray's base and the half of the bottom label below it, px. */
export const TRAY_BOTTOM = 16
/** The ruler: spine, ticks and numbers, px. */
export const TRAY_RULER_W = 40
/** Gap between the tray and the ruler, and between the labels and the tray, px. */
export const TRAY_GAP = 10

/**
 * The tray's geometry for a zone of `w` × `h`: the inside's height, its
 * width (about half its height, within what the zone has room for) and the
 * gutter on the left that holds the mark labels.
 */
export function trayGeometry(w: number, h: number): { height: number; width: number; labelW: number } {
  const labelW = w < 380 ? 74 : 100
  const height = Math.max(80, h - TRAY_TOP - TRAY_BOTTOM)
  const room = w - labelW - TRAY_RULER_W - TRAY_GAP * 2
  const width = Math.max(64, Math.min(Math.round(height * 0.56), 280, room))
  return { height, width, labelW }
}
