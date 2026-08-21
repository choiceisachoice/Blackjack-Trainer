import { EASE } from './easing'
import { at, track } from './timeline'

/**
 * The model behind "Bloom" — where each of the 52 cards is at any moment.
 *
 * ## What changed, and why
 *
 * Two earlier attempts showed card *backs*: dark rectangles on a dark ground,
 * which is monotone by construction no matter how well it is lit. The colour in
 * a deck of cards is on the front — white stock, red hearts and diamonds, black
 * spades and clubs — and against green felt that is a rich image without being
 * a loud one. So every card here is face-up, and the suits step ♠ ♥ ♣ ♦ around
 * the ring so the bloom reads as an alternating rhythm of red and black rather
 * than four solid quadrants.
 *
 * ## The shape of it
 *
 * One card becomes fifty-two, which open into a rotating rosette, close into a
 * dealer's fan, collapse to a stack, and give back the one card they started
 * from. No vocabulary, no numbers — someone who has never heard of card
 * counting sees a deck do something impossible.
 *
 * Everything is a pure function of `(index, t)`, so the piece can be stopped at
 * any millisecond and drawn exactly as it would have been.
 */

export const STAGE_W = 1200
export const STAGE_H = 675
export const DURATION = 12800

const CX = STAGE_W * 0.5
const CY = STAGE_H * 0.455

const SUITS = ['♠', '♥', '♣', '♦'] as const
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'] as const
export const CARD_COUNT = 52

export interface Face {
  rank: string
  suit: string
  red: boolean
}

/**
 * Card `i`'s face.
 *
 * Interleaved on purpose: stepping the suit every card and the rank every four
 * puts ♠ ♥ ♣ ♦ beside each other all the way round, which is what turns the
 * rosette into a rhythm of red and black instead of four solid quadrants.
 */
export function faceOf(i: number): Face {
  const suit = SUITS[i % 4]
  return { rank: RANKS[Math.floor(i / 4) % 13], suit, red: suit === '♥' || suit === '♦' }
}

const HOLD_TO = 1000
const BLOOM_FROM = 1000
const BLOOM_STEP = 30
const BLOOM_DUR = 1150
const SPIN_FROM = 3400
const FAN_FROM = 6300
const FAN_DUR = 1400
const CLOSE_FROM = 8500
const CLOSE_DUR = 1300
const LIFT_FROM = 9900
const LIFT_DUR = 1300

/** Slightly elliptical: a true circle reads flat, an ellipse reads like a table. */
const RING_R = 262
const RING_SQUASH = 0.66

export const BEATS = [
  { at: 0, label: 'I · ONE CARD' },
  { at: 1000, label: 'II · IT BLOOMS' },
  { at: 3400, label: 'III · FIFTY-TWO' },
  { at: 6300, label: 'IV · IT CLOSES' },
  { at: 9900, label: 'V · AND BACK' },
] as const

/** The card that starts alone and comes back at the end. */
export const HERO_INDEX = 0

function rand(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

export interface CardState {
  x: number
  y: number
  rot: number
  scale: number
  alpha: number
  /** Drives the specular sweep across the face while it is moving. */
  sheen: number
}

/** How far the ring has turned at `t`. */
function ringSpin(t: number): number {
  return track(t, SPIN_FROM, 3200, 0, 0.62, EASE.standard)
}

export function cardAt(i: number, t: number): CardState | null {
  const hero = i === HERO_INDEX
  const born = hero ? 0 : BLOOM_FROM + (i - 1) * BLOOM_STEP
  if (t < born) return null

  const bloom = at(t, born, BLOOM_DUR, EASE.expressiveSpatial)
  const theta = (i / CARD_COUNT) * Math.PI * 2 + ringSpin(t)

  const ringX = CX + Math.sin(theta) * RING_R
  const ringY = CY - Math.cos(theta) * RING_R * RING_SQUASH
  // Square to the radius — petals, not a scatter.
  const ringRot = theta

  // The hero holds the centre until the bloom has passed it, then joins in.
  const joined = hero ? at(t, 1500, 900, EASE.standard) : bloom
  const startScale = hero ? 2.3 : 0.25
  const spinIn = (rand(i, 1) - 0.5) * 3.4

  let x = CX + (ringX - CX) * joined
  let y = CY + (ringY - CY) * joined
  let rot = spinIn * (1 - joined) + ringRot * joined
  let scale = startScale + (1 - startScale) * joined

  // The ring unrolls into a fan low in the frame.
  const fan = at(t, FAN_FROM + i * 9, FAN_DUR, EASE.expressiveSpatial)
  if (fan > 0) {
    const spanned = i / (CARD_COUNT - 1) - 0.5
    const fa = spanned * 1.95
    const fx = CX + Math.sin(fa) * 430
    const fy = CY + 42 + (1 - Math.cos(fa)) * 430 * 0.46
    x += (fx - x) * fan
    y += (fy - y) * fan
    rot = rot * (1 - fan) + fa * fan
    scale = scale * (1 - fan) + 1 * fan
  }

  // The fan closes to a stack, the outside cards arriving first.
  const edge = Math.abs(i / (CARD_COUNT - 1) - 0.5) * 2
  const close = at(t, CLOSE_FROM + (1 - edge) * 320, CLOSE_DUR, EASE.standard)
  if (close > 0) {
    x += (CX - x) * close
    y += (CY + 40 - y) * close
    rot = rot * (1 - close)
    scale = scale * (1 - close) + 0.98 * close
  }

  let alpha = at(t, born, 220, EASE.standardEffects)

  if (hero) {
    const lift = at(t, LIFT_FROM, LIFT_DUR, EASE.expressiveSpatial)
    x += (CX - x) * lift
    y += (STAGE_H * 0.42 - y) * lift
    rot *= 1 - lift
    scale = scale * (1 - lift) + 3.1 * lift
  } else {
    // Everything else steps back so one card can be looked at.
    alpha *= 1 - at(t, LIFT_FROM + 120, 800, EASE.standardEffects) * 0.86
  }

  return {
    x, y, rot, scale, alpha,
    // A pulse, not a state. Held at 1 the specular wash sat over the ace for
    // the whole final beat and turned crisp white stock into flat grey.
    sheen: hero
      ? Math.max(0, at(t, LIFT_FROM, 520) - at(t, LIFT_FROM + 420, 760))
      : Math.max(0, 1 - bloom),
  }
}

/** Blends the renderer needs that are not per-card. */
export function filmState(t: number) {
  return {
    /** The table fades up before anything is dealt onto it. */
    table: at(t, 0, 900, EASE.emphasizedDecelerate),
    hold: 1 - at(t, HOLD_TO, 600, EASE.standardEffects),
    bloom: at(t, BLOOM_FROM, 2600, EASE.standard),
    /** The ring guide belongs to the rosette and must leave with it. */
    fan: at(t, FAN_FROM, FAN_DUR, EASE.standard),
    spin: ringSpin(t),
    lift: at(t, LIFT_FROM, LIFT_DUR, EASE.expressiveSpatial),
    title: at(t, 10900, 900, EASE.standardEffects),
    sub: at(t, 11300, 900, EASE.standardEffects),
  }
}
