import type { TrainingSessionResult } from '../../services/stats-types'

/**
 * The Speed Drill's arithmetic, apart from the screen: the speeds and round
 * sizes it offers, the next step after a round, the quick picks for the
 * answer, what can honestly be said about a wrong answer, the personal best
 * per speed, and how big the cards are drawn.
 *
 * Pure, so each rule is tested without a browser.
 */

/** Cards per round, as the setup offers them. */
export const CARD_COUNTS = [10, 20, 30, 52] as const

/** The speeds, slowest first: how long each card is shown. */
export const SPEED_OPTIONS = [
  { labelKey: 'training.speed.slow', ms: 2000 },
  { labelKey: 'training.speed.normal', ms: 1000 },
  { labelKey: 'training.speed.fast', ms: 500 },
] as const

/** The label key of a speed, or null for a speed the setup does not offer (old sessions recorded 750 ms). */
export function speedLabelKey(speedMs: number): string | null {
  return SPEED_OPTIONS.find(s => s.ms === speedMs)?.labelKey ?? null
}

/**
 * Seconds per card as a reader writes them: "2", "1", "0.5" — with the
 * locale's decimal mark ("0,5" in German).
 */
export function secondsPerCard(speedMs: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(speedMs / 1000)
  } catch {
    return String(speedMs / 1000)
  }
}

/**
 * Reads what was typed as a count: "-3", "−3" (a real minus, as the app
 * prints it), "+2", "1.5", "1,5". Empty or unreadable is 0 — the number the
 * field shows as its placeholder.
 */
export function parseCount(draft: string): number {
  const cleaned = draft.trim().replace(/[−–]/, '-').replace(',', '.')
  if (cleaned === '' || cleaned === '-' || cleaned === '+') return 0
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

/**
 * What the count field keeps of what is typed: digits, one leading sign and
 * one decimal mark (Wong Halves). The sign is shown as the real minus the
 * app prints everywhere else — the chips say "−4", and a hyphen in the field
 * read as "- 4" beside them.
 */
export function cleanCountInput(raw: string): string {
  const text = raw.replace(/\s/g, '')
  const negative = /^[-−–]/.test(text)
  let mark = false
  let body = ''
  for (const ch of text.replace(/^[-−–+]/, '')) {
    if (ch >= '0' && ch <= '9') body += ch
    else if ((ch === '.' || ch === ',') && !mark) { mark = true; body += ch }
  }
  return (negative ? '−' : '') + body
}

/** A count as the field shows it: "−4", "0", "3". */
export function countDraft(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n)
}

/** What the result screen offers beside "again". */
export type NextStep =
  | { kind: 'faster'; speedMs: number }
  | { kind: 'slower'; speedMs: number }
  | { kind: 'moreCards'; cards: number }
  | null

/**
 * The step after a round, which depends on how it went.
 *
 * After an exact round, one notch harder: the next faster speed, or at the
 * fastest speed the next longer round; nothing once both are at their top.
 * After a miss, not harder — suggesting more speed to someone who just lost
 * the count is bad coaching — but one notch slower, where there is a slower
 * speed; at the slowest, "again" is the only sensible step.
 *
 * @param speedMs - The round's speed
 * @param cards - The round's number of cards
 * @param exact - Whether the round was counted right
 */
export function nextStep(speedMs: number, cards: number, exact = true): NextStep {
  if (!exact) {
    const slower = SPEED_OPTIONS.filter(s => s.ms > speedMs).at(-1)
    return slower ? { kind: 'slower', speedMs: slower.ms } : null
  }
  const faster = SPEED_OPTIONS.filter(s => s.ms < speedMs).at(0)
  if (faster) return { kind: 'faster', speedMs: faster.ms }
  const more = CARD_COUNTS.find(n => n > cards)
  if (more) return { kind: 'moreCards', cards: more }
  return null
}

/**
 * The quick-pick values for the answer: a symmetric range around the count
 * the round started from, wide enough for where a round of this length
 * usually ends.
 *
 * It depends on the round's length and starting count only — never on the
 * cards dealt — so the chips cannot hint at the answer. The width is about
 * one and a half standard deviations of the final Hi-Lo count (10 of 13 ranks
 * carry ±1, so the spread after n cards is about √(10n/13)), at least ±3 and
 * at most ±6 so the row stays one glance wide.
 *
 * @param cards - Cards in the round
 * @param center - The running count before the first card (0 for Hi-Lo)
 * @returns The values, lowest first
 */
export function quickPicks(cards: number, center = 0): number[] {
  const spread = 1.5 * Math.sqrt((10 * Math.max(1, cards)) / 13)
  const k = Math.min(6, Math.max(3, Math.round(spread)))
  return Array.from({ length: 2 * k + 1 }, (_, i) => center - k + i)
}

/**
 * Each card's tag, read back from the running counts the engine produced:
 * the difference between the count after a card and the count before it.
 *
 * @param runningAfter - The running count after each card
 * @param startCount - The running count before the first card
 */
export function cardTags(runningAfter: readonly number[], startCount: number): number[] {
  return runningAfter.map((rc, i) => rc - (i === 0 ? startCount : runningAfter[i - 1]))
}

/** What the result screen says about an answer. */
export type MissHintKind = 'exact' | 'lastCard' | 'oneHigh' | 'oneLow' | 'twoHigh' | 'twoLow' | 'far'

/** The pointer for a wrong answer, and the cards it marks. */
export interface MissHint {
  kind: MissHintKind
  /** The answer minus the true count. */
  diff: number
  /** Cards (by index) the pointer is about; only ever the last card, the one case the numbers can show. */
  marked: number[]
}

/** Inputs of {@link missHint}. */
export interface MissHintInput {
  /** The running count after each card. */
  runningAfter: readonly number[]
  /** The running count before the first card. */
  startCount: number
  /** What was answered. */
  answer: number
  /** How far off still counts as right (0.5 for Wong Halves, else 0). */
  tolerance: number
  /** Whether the system is Hi-Lo, so the pointer may name its card groups. */
  hiLo: boolean
}

/**
 * What can honestly be said about an answer.
 *
 * The drill knows the cards and the final answer, never the count someone
 * held after card seven. So it says only what the numbers support:
 *
 * - **lastCard** — the answer is exactly the count *before* the last card,
 *   and the last card moved the count. The last card is the easiest one to
 *   lose; this is the one case where a particular card can be pointed at.
 * - **oneHigh / oneLow** — off by one, the size of a single Hi-Lo tag: the
 *   usual causes are named (a −1 card not subtracted, a low card not added),
 *   as a direction to look in, not a finding.
 * - **twoHigh / twoLow** — off by two: one card counted the wrong way round,
 *   or two slipped.
 * - **far** — more than that, or a system other than Hi-Lo: the count under
 *   every card is the only honest guide.
 */
export function missHint({ runningAfter, startCount, answer, tolerance, hiLo }: MissHintInput): MissHint {
  const n = runningAfter.length
  const final = n > 0 ? runningAfter[n - 1] : startCount
  const diff = answer - final
  if (Math.abs(diff) <= tolerance) return { kind: 'exact', diff, marked: [] }
  if (n > 0) {
    const before = n > 1 ? runningAfter[n - 2] : startCount
    const lastTag = final - before
    if (lastTag !== 0 && Math.abs(answer - before) <= tolerance) return { kind: 'lastCard', diff, marked: [n - 1] }
  }
  if (hiLo) {
    if (diff === 1) return { kind: 'oneHigh', diff, marked: [] }
    if (diff === -1) return { kind: 'oneLow', diff, marked: [] }
    if (diff === 2) return { kind: 'twoHigh', diff, marked: [] }
    if (diff === -2) return { kind: 'twoLow', diff, marked: [] }
  }
  return { kind: 'far', diff, marked: [] }
}

/** A personal best at one speed. */
export interface SpeedBest {
  /** The longest round counted exactly at this speed, in cards; null before the first exact round. */
  bestCards: number | null
  /** Rounds at this speed counted exactly. */
  exact: number
  /** Rounds at this speed in all. */
  rounds: number
}

/** The rounds of the sitting still on screen, not yet recorded. */
export interface SittingRounds {
  /** Cards per round in this sitting. */
  cards: number
  /** The count error of each round, 0 for an exact one. */
  errors: readonly number[]
}

/**
 * The personal best at one speed, from what is already recorded.
 *
 * No store of its own: every recorded Speed Drill session carries its speed,
 * its round size and the error of each round (`SpeedDrillDetails`), which is
 * all a best needs. The sitting on screen is added on top, because it is
 * recorded only when it ends — and not at all below three rounds, which is
 * the rule for every drill.
 *
 * @param sessions - Recorded sessions, any mode
 * @param speedMs - The speed asked about
 * @param sitting - The current sitting's rounds, at this speed
 * @param tolerance - How far off still counts as exact
 */
export function speedBest(
  sessions: readonly TrainingSessionResult[],
  speedMs: number,
  sitting: SittingRounds | null,
  tolerance = 0,
): SpeedBest {
  let bestCards: number | null = null
  let exact = 0
  let rounds = 0
  const take = (cards: number, errors: readonly number[]) => {
    for (const e of errors) {
      rounds++
      if (Math.abs(e) <= tolerance) {
        exact++
        bestCards = Math.max(bestCards ?? 0, cards)
      }
    }
  }
  for (const s of sessions) {
    // Optional chaining on purpose: sessions synced from older builds can lack details.
    const d = s.details as TrainingSessionResult['details'] | undefined
    if (s.mode !== 'speedDrill' || d?.type !== 'speedDrill' || d.speedMs !== speedMs) continue
    take(d.cardsPerRound, d.rcErrors ?? [])
  }
  if (sitting) take(sitting.cards, sitting.errors)
  return { bestCards, exact, rounds }
}

/** Space under each card of the review for its running count, in px. */
export const REVIEW_LABEL = 26
/** The same under a small card, whose count is set smaller. */
export const REVIEW_LABEL_SMALL = 20
/** Below this card width the count under it is set small, in px. */
const SMALL_CARD = 56
/**
 * The smallest card the review draws before it scrolls instead, in px wide.
 * The compact face's rank is 30 % of the card's height, so at 36 px wide it
 * is still a 15 px glyph — read at a glance.
 */
export const REVIEW_MIN_CARD = 36
/** The largest card the review draws, in px wide. */
export const REVIEW_MAX_CARD = 128

/** How the cards of a round are laid out on the result screen. */
export interface ReviewLayout {
  /** Cards per row. */
  cols: number
  /** Card width in px; the height is 7/5 of it. */
  cardWidth: number
  /** Space between cards, in px. */
  gap: number
  /** Height of the count under each card, in px. */
  label: number
  /** True when even the smallest card does not fit and the area scrolls. */
  scroll: boolean
}

/** The label height that goes with a card width. */
function labelFor(cardWidth: number): number {
  return cardWidth < SMALL_CARD ? REVIEW_LABEL_SMALL : REVIEW_LABEL
}

/**
 * The largest cards that show every card of the round at once, row after
 * row in dealing order, each with its count underneath.
 *
 * Tries every column count and keeps the one with the widest card. Below
 * {@link REVIEW_MIN_CARD} a card's rank is no longer read at a glance, so
 * the cards stay at that size and the area scrolls instead.
 *
 * @param width - The area's width in px
 * @param height - The area's height in px
 * @param n - Cards in the round
 */
export function reviewLayout(width: number, height: number, n: number): ReviewLayout {
  if (n <= 0 || width <= 0 || height <= 0) {
    return { cols: Math.max(1, n), cardWidth: REVIEW_MIN_CARD, gap: 8, label: REVIEW_LABEL_SMALL, scroll: false }
  }
  let best = { cols: 1, cardWidth: 0, gap: 8 }
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const fit = (gap: number, label: number) => Math.min(
      (width - (cols - 1) * gap) / cols,
      ((height - (rows - 1) * gap) / rows - label) * 5 / 7,
    )
    // The large label first; a card that comes out small gets the small one,
    // and stays below the size where the large label would be drawn.
    const sized = (gap: number) => {
      const large = fit(gap, REVIEW_LABEL)
      return large >= SMALL_CARD ? large : Math.min(SMALL_CARD - 0.01, fit(gap, REVIEW_LABEL_SMALL))
    }
    // The gap grows with the card, a little: 10 % of the width, 6–14 px.
    const gap = Math.max(6, Math.min(14, Math.round(sized(8) * 0.1)))
    const w = Math.min(REVIEW_MAX_CARD, sized(gap))
    if (w > best.cardWidth + 0.5) best = { cols, cardWidth: w, gap }
  }
  if (best.cardWidth >= REVIEW_MIN_CARD) {
    const cardWidth = Math.floor(best.cardWidth)
    return { cols: best.cols, cardWidth, gap: best.gap, label: labelFor(cardWidth), scroll: false }
  }
  const gap = 6
  const cols = Math.max(1, Math.min(n, Math.floor((width + gap) / (REVIEW_MIN_CARD + gap))))
  const cardWidth = Math.max(REVIEW_MIN_CARD, Math.floor((width - (cols - 1) * gap) / cols))
  return { cols, cardWidth, gap, label: labelFor(cardWidth), scroll: true }
}

/** The smallest card the running drill draws, in px tall. */
const RUN_MIN = 140
/** The largest, in px tall: past this a card is a poster, not a card on a table. */
const RUN_MAX = 460

/**
 * The height of the card being counted, from the felt area around it.
 *
 * As large as the felt allows — the card is the drill — but never more than
 * 82 % of the area's height (the countdown sits under it) or a size where the
 * card stops looking like a card.
 *
 * @param width - The card area's width in px
 * @param height - The card area's height in px
 */
export function runCardHeight(width: number, height: number): number {
  if (width <= 0 || height <= 0) return RUN_MIN
  const byHeight = height * 0.82
  const byWidth = (width * 0.8 * 7) / 5
  return Math.round(Math.max(RUN_MIN, Math.min(RUN_MAX, byHeight, byWidth)))
}
