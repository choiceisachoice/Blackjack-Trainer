import { Rank, Suit, type Card } from '../../types'
import type { FlashQuestion } from '../../engine/strategy/flashcards'

/**
 * What a flashcard puts on the felt: real cards for a question that the engine
 * states as a total ("16"), a soft hand ("A,7") or a pair ("8,8").
 *
 * The question used to be two rows of text — "Your Hand 17 / Dealer Shows 8" —
 * which is a quiz about blackjack rather than a hand of it. At the table a
 * player sees a ten and a six, not the number 16; the drill should look like
 * what it trains for. These helpers are pure so the cards a question gets, the
 * label it is given and the size its cards are drawn at can be tested without
 * a browser.
 */

/** The cards of one question. */
export interface QuestionCards {
  /** The player's two cards; empty for the insurance question, which is about any hand. */
  player: Card[]
  /** The dealer's up card. */
  dealer: Card
}

const TEN_RANKS = [Rank.Ten, Rank.Jack, Rank.Queen, Rank.King] as const
const SUITS = [Suit.Spades, Suit.Hearts, Suit.Clubs, Suit.Diamonds] as const
const RANK_BY_VALUE: Record<string, Rank> = {
  A: Rank.Ace, '2': Rank.Two, '3': Rank.Three, '4': Rank.Four, '5': Rank.Five,
  '6': Rank.Six, '7': Rank.Seven, '8': Rank.Eight, '9': Rank.Nine,
}

/** A random element. */
function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))]
}

/** A rank for a chart value: '10' is any of the four ten-value ranks, so the picture cards appear too. */
function rankFor(value: string, rand: () => number): Rank {
  return value === '10' ? pick(TEN_RANKS, rand) : RANK_BY_VALUE[value]
}

/** The four suits in a random order (Fisher–Yates), so three cards never share one by accident. */
function shuffledSuits(rand: () => number): Suit[] {
  const out: Suit[] = [...SUITS]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Two different card values from 2 to 10 that add up to a hard total.
 *
 * No ace (that would make the hand soft) and no two equal values (that would
 * make it a pair, which the chart plays differently — 8,8 is not a hard 16).
 */
export function hardSplits(total: number): [number, number][] {
  const out: [number, number][] = []
  for (let a = 2; a <= 10; a++) {
    const b = total - a
    if (b > a && b <= 10) out.push([a, b])
  }
  return out
}

/**
 * Deals the cards for a question.
 *
 * @param q - The question
 * @param rand - Random source in [0, 1); `Math.random` by default, so a run
 *   with a pinned generator (the demo recorder) deals the same cards
 * @returns The player's cards (none for insurance) and the dealer's up card
 */
export function dealQuestionCards(q: FlashQuestion, rand: () => number = Math.random): QuestionCards {
  const suits = shuffledSuits(rand)
  const dealer: Card = { rank: rankFor(q.dealer, rand), suit: suits[3] }
  if (q.hand === '*') return { player: [], dealer }

  if (q.handKind === 'pair') {
    const rank = rankFor(q.hand.split(',')[0], rand)
    return { player: [{ rank, suit: suits[0] }, { rank, suit: suits[1] }], dealer }
  }
  if (q.handKind === 'soft') {
    const other = rankFor(q.hand.split(',')[1], rand)
    return { player: [{ rank: Rank.Ace, suit: suits[0] }, { rank: other, suit: suits[1] }], dealer }
  }
  const options = hardSplits(Number(q.hand))
  const [lo, hi] = options.length > 0 ? pick(options, rand) : [2, 10]
  // Either order: a ten on the left as often as on the right.
  const [first, second] = rand() < 0.5 ? [hi, lo] : [lo, hi]
  return {
    player: [
      { rank: rankFor(String(first), rand), suit: suits[0] },
      { rank: rankFor(String(second), rand), suit: suits[1] },
    ],
    dealer,
  }
}

/** A translation key with its values. */
export interface KeyedText {
  key: string
  values?: Record<string, string | number>
}

/**
 * How a hand is named: "Hard 15", "Soft 18", "Pair of 8s", "Pair of aces",
 * "Any hand". The chart's own row label ("A,7") is a lookup code; the name is
 * what a player says.
 */
export function handName(q: FlashQuestion): KeyedText {
  if (q.hand === '*') return { key: 'training.flash.anyHand' }
  if (q.handKind === 'pair') {
    const rank = q.hand.split(',')[0]
    return rank === 'A' ? { key: 'training.flash.pairOfAces' } : { key: 'training.flash.pairOf', values: { rank } }
  }
  if (q.handKind === 'soft') return { key: 'training.flash.softTotal', values: { n: 11 + Number(q.hand.split(',')[1]) } }
  return { key: 'training.flash.hardTotal', values: { n: Number(q.hand) } }
}

/** How the cards are laid on the felt. */
export interface FeltLayout {
  /** `stacked`: dealer above the player, as at a table. `row`: dealer left, player right. */
  arrangement: 'stacked' | 'row'
  /** Card height in px; the width is 5/7 of it. */
  cardHeight: number
  /**
   * Space kept free above the hands, in px: room for the true-count chip in
   * the felt's top left corner when the hands would otherwise run under it.
   */
  offsetTop: number
  /** Space between the dealer's hand and the player's, in px. */
  gap: number
}

/** Size of something pinned to the card area's top left corner, measured from that corner. */
export interface CornerBox {
  /** Distance from the area's left edge to the box's right edge (plus a margin). */
  right: number
  /** Distance from the area's top edge to the box's bottom edge (plus a margin). */
  bottom: number
}

/** The widest a hand's label is assumed to be, for the collision check. */
const LABEL_WIDTH = 110

/** Height of a hand's label line plus its gap to the cards. */
export const FELT_LABEL = 26
/** Space between the dealer's and the player's hand. */
export const FELT_GAP = 28
/** The second player card is laid this fraction of a card width to the right of the first. */
export const CARD_STEP = 0.62
/** Never larger: past this a card stops reading as a card on a table. */
export const MAX_CARD = 320
/**
 * Side by side, the hands move apart on a wide felt — up to this far — so a
 * 2000 px monitor does not show two small islands in a sea of cloth.
 */
export const MAX_ROW_GAP = 168
/** Never smaller: below this the corner index of a full card face is hard to read. */
export const MIN_CARD = 56
/**
 * How much larger the side-by-side layout has to make the cards before it is
 * chosen. The dealer above the player is how every table looks, so it wins
 * unless a wide, low felt would leave the cards small.
 */
const ROW_PREFERENCE = 1.25

const RATIO = 5 / 7

/**
 * Card size and arrangement for a felt of the given size.
 *
 * Both arrangements are worked out and the one with the larger cards wins,
 * with a bias towards the table's own (dealer above). On a 2000 × 720 monitor
 * the felt is wide and low and the cards go side by side; on a phone or a
 * 1440 × 900 laptop the dealer sits above the player.
 *
 * With a `corner` box (the true-count chip), the hands are first laid as if
 * it were not there; only if the dealer's hand would run under it is the
 * layout done again in the height below it. A chip that sits clear of the
 * cards — most of the time — costs them nothing.
 *
 * @param width - Width of the card area in px
 * @param height - Height of the card area in px
 * @param corner - Something pinned to the area's top left corner, if anything
 */
export function feltLayout(width: number, height: number, corner?: CornerBox): FeltLayout {
  const free = layoutIn(width, height)
  if (!corner || !collides(free, width, height, corner)) return free
  return { ...layoutIn(width, height - corner.bottom), offsetTop: corner.bottom }
}

function layoutIn(width: number, height: number): FeltLayout {
  const playerWidthPerHeight = (1 + CARD_STEP) * RATIO
  const stacked = Math.min(
    (height - 2 * FELT_LABEL - FELT_GAP) / 2,
    width / playerWidthPerHeight,
  )
  const row = Math.min(
    height - FELT_LABEL,
    (width - FELT_GAP * 2) / ((2 + CARD_STEP) * RATIO),
  )
  const clamp = (h: number) => Math.round(Math.max(MIN_CARD, Math.min(MAX_CARD, h)))
  const useRow = clamp(row) >= clamp(stacked) * ROW_PREFERENCE
  if (!useRow) return { arrangement: 'stacked', cardHeight: clamp(stacked), offsetTop: 0, gap: FELT_GAP }
  const cardHeight = clamp(row)
  const spare = width - (2 + CARD_STEP) * RATIO * cardHeight
  const gap = Math.round(Math.max(FELT_GAP * 2, Math.min(MAX_ROW_GAP, spare * 0.2)))
  return { arrangement: 'row', cardHeight, offsetTop: 0, gap }
}

/** Whether the dealer's hand (label and card), centred as laid out, reaches under the corner box. */
function collides({ arrangement, cardHeight, gap }: FeltLayout, width: number, height: number, corner: CornerBox): boolean {
  const w = cardHeight * RATIO
  const dealerWidth = Math.max(w, LABEL_WIDTH)
  if (arrangement === 'stacked') {
    const groupHeight = 2 * (FELT_LABEL + cardHeight) + FELT_GAP
    const top = (height - groupHeight) / 2
    return corner.bottom > top && corner.right > (width - dealerWidth) / 2
  }
  const groupWidth = w + gap + (1 + CARD_STEP) * w
  const top = (height - (FELT_LABEL + cardHeight)) / 2
  const left = (width - groupWidth) / 2 - Math.max(0, (dealerWidth - w) / 2)
  return corner.bottom > top && corner.right > left
}
