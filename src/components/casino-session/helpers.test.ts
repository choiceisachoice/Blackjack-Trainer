import { describe, it, expect } from 'vitest'
import {
  isNaturalBlackjack,
  isRecordableSession,
  fitTable,
  fitStackedTable,
  isStackedBox,
  stackedBotZoom,
  stackedTableSize,
  TABLE_DESIGN,
  TABLE_CARD,
  TABLE_MAX_SCALE,
  TABLE_MIN_HEIGHT,
  TABLE_MIN_WIDTH,
  tableMinWidth,
  playableLimits,
} from './helpers'
import type { Card } from '../../engine/shoe/types'
import { Rank, Suit } from '../../engine/shoe/types'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })

describe('fitTable — sizing the table to the screen', () => {
  /** Real viewports, minus the app chrome the table does not get. */
  const ULTRAWIDE = { width: 3400, height: 1240 }
  const FULL_HD = { width: 1860, height: 880 }
  const LAPTOP = { width: 1400, height: 700 }
  const LAPTOP_TALL_ENOUGH = { width: 1250, height: 600 }
  const DESIGN_BOX = { width: TABLE_DESIGN.width, height: TABLE_DESIGN.height }

  it('leaves a design-sized box exactly as it is', () => {
    expect(fitTable(DESIGN_BOX).scale).toBe(1)
  })

  it('grows the table on a large screen instead of stranding it', () => {
    // The report that prompted this: on a 3440px monitor the table stopped at
    // its 1120px cap while every card inside kept its hard-coded pixel size.
    expect(fitTable(ULTRAWIDE).scale).toBeGreaterThan(1.5)
  })

  it('never shrinks a screen that was not the problem', () => {
    // The regression the width-led design exists to avoid: fitting *both* axes
    // made a short laptop 19% smaller. A box tall enough for the scene's floor
    // at the width's scale still gets exactly that scale.
    //
    // What must not shrink is what is on the table, not the factor: since the
    // cards went from 56 to 76 units the scene's floor is higher, so a 600px
    // box is scaled to 0.99 — and shows a card 75px wide where it was 56.
    for (const box of [LAPTOP, LAPTOP_TALL_ENOUGH, FULL_HD]) {
      expect(TABLE_CARD.width * fitTable(box).scale, `${box.width}x${box.height}`).toBeGreaterThanOrEqual(56)
      expect(fitTable(box).scale, `${box.width}x${box.height}`).toBeGreaterThan(0.95)
    }
  })

  it('never exceeds the ceiling, however much room there is', () => {
    expect(fitTable({ width: 10_000, height: 10_000 }).scale).toBe(TABLE_MAX_SCALE)
  })

  it('fills the box exactly, so no felt is left stretched or clipped', () => {
    for (const box of [ULTRAWIDE, FULL_HD, LAPTOP, DESIGN_BOX]) {
      const { scale, sceneHeight } = fitTable(box)
      expect(TABLE_DESIGN.width * scale, `w @ ${box.width}`).toBeLessThanOrEqual(box.width + 0.5)
      expect(sceneHeight * scale, `h @ ${box.width}`).toBeCloseTo(box.height, 0)
    }
  })

  it('scales down rather than clipping when the box is shorter than the scene’s floor', () => {
    // The old rule drew the scene taller than the box here and let the box cut
    // it — on both ends, since it was centred. This is the case that put the
    // dealer's cards and the player's total off screen on every laptop.
    const { scale, sceneHeight } = fitTable({ width: 1400, height: 200 })
    expect(sceneHeight).toBe(TABLE_MIN_HEIGHT)
    expect(sceneHeight * scale).toBeCloseTo(200, 5)
  })

  it('never returns a scene larger than its box, at any real window size', () => {
    // Measured boxes: what is left of the viewport under the app's bars.
    const boxes = [
      { width: 1536, height: 446 }, { width: 1536, height: 386 }, { width: 1366, height: 375 },
      { width: 1280, height: 320 }, { width: 1920, height: 595 }, { width: 820, height: 858 },
      { width: 390, height: 532 }, { width: 844, height: 68 }, { width: 3400, height: 1240 },
    ]
    for (const box of boxes) {
      for (const minWidth of [undefined, tableMinWidth(1), tableMinWidth(3), tableMinWidth(6)]) {
        const fit = fitTable(box, TABLE_DESIGN, TABLE_MAX_SCALE, minWidth)
        const tag = `${box.width}x${box.height} min ${minWidth}`
        expect(fit.sceneWidth * fit.scale, tag).toBeLessThanOrEqual(box.width + 0.5)
        expect(fit.sceneHeight * fit.scale, tag).toBeLessThanOrEqual(box.height + 0.5)
        expect(fit.sceneHeight, tag).toBeGreaterThanOrEqual(TABLE_MIN_HEIGHT)
      }
    }
  })

  it('uses the spare width when the height is what limits it', () => {
    // A 1536x446 box: the height allows 0.86, and at that scale 1120px of felt
    // would leave a third of the width empty. The scene is drawn wider instead.
    const { scale, sceneWidth } = fitTable({ width: 1536, height: 446 })
    expect(scale).toBeCloseTo(446 / TABLE_MIN_HEIGHT, 5)
    expect(sceneWidth).toBeGreaterThan(TABLE_DESIGN.width)
    // But not into a ribbon, however wide the box.
    expect(fitTable({ width: 5000, height: 300 }).sceneWidth).toBeLessThanOrEqual(TABLE_DESIGN.width * 1.3)
  })

  it('draws a narrower scene before it makes the cards smaller', () => {
    // 390px phone, three seats. Scaled from the 1120px design this was 0.35 —
    // an 18px-wide card. Drawn at the three-seat floor it is 0.61.
    const old = fitTable({ width: 390, height: 900 })
    const now = fitTable({ width: 390, height: 900 }, TABLE_DESIGN, TABLE_MAX_SCALE, tableMinWidth(3))
    expect(old.scale).toBeCloseTo(390 / 1120, 3)
    expect(now.sceneWidth).toBe(TABLE_MIN_WIDTH)
    expect(now.scale).toBeCloseTo(390 / TABLE_MIN_WIDTH, 3)
    // Between the floor and the design width nothing is scaled at all.
    const tablet = fitTable({ width: 804, height: 900 }, TABLE_DESIGN, TABLE_MAX_SCALE, tableMinWidth(3))
    expect(tablet.scale).toBe(1)
    expect(tablet.sceneWidth).toBe(804)
  })

  it('asks for more width the more seats there are, up to the design width', () => {
    expect(tableMinWidth(1)).toBe(TABLE_MIN_WIDTH)
    expect(tableMinWidth(6)).toBeGreaterThan(tableMinWidth(3))
    expect(tableMinWidth(12)).toBe(TABLE_DESIGN.width)
  })

  it('shrinks to fit a narrow screen rather than cropping', () => {
    const { scale } = fitTable({ width: 700, height: 1000 })
    expect(scale).toBeCloseTo(700 / TABLE_DESIGN.width, 5)
    expect(TABLE_DESIGN.width * scale).toBeLessThanOrEqual(700)
  })

  it('returns a usable fit for an unmeasured box rather than collapsing', () => {
    // Before the first measurement the box is 0x0. A scale of 0 paints nothing.
    expect(fitTable({ width: 0, height: 0 })).toEqual({ scale: 1, sceneWidth: TABLE_DESIGN.width, sceneHeight: TABLE_DESIGN.height })
    expect(fitTable({ width: 0, height: 800 }).scale).toBe(1)
  })

  it('survives nonsense input without producing NaN', () => {
    for (const box of [{ width: NaN, height: NaN }, { width: -100, height: -100 }]) {
      const fit = fitTable(box)
      expect(Number.isFinite(fit.scale)).toBe(true)
      expect(Number.isFinite(fit.sceneHeight)).toBe(true)
      expect(fit.scale).toBe(1)
    }
    expect(fitTable({ width: 800, height: 600 }, { width: 0, height: 0 }).scale).toBe(1)
  })

  it('has a design size with a sane table shape', () => {
    const ratio = TABLE_DESIGN.width / TABLE_DESIGN.height
    expect(ratio).toBeGreaterThan(1.2)
    expect(ratio).toBeLessThan(2.2)
  })
})

describe('isNaturalBlackjack', () => {
  it('is a blackjack for an unsplit Ace + ten-value card', () => {
    expect(isNaturalBlackjack(1, [c(Rank.Ace), c(Rank.King)])).toBe(true)
    expect(isNaturalBlackjack(1, [c(Rank.Ten), c(Rank.Ace)])).toBe(true)
  })

  it('is NOT a blackjack for two aces (soft 12 — the hand should be split)', () => {
    expect(isNaturalBlackjack(1, [c(Rank.Ace), c(Rank.Ace)])).toBe(false)
  })

  it('is NOT a natural blackjack after a split — a split A+10 is a plain 21', () => {
    // The exact reported bug: a split-ace hand that draws a ten is 21, not BJ.
    expect(isNaturalBlackjack(2, [c(Rank.Ace), c(Rank.Ten)])).toBe(false)
    expect(isNaturalBlackjack(3, [c(Rank.Ace), c(Rank.Queen)])).toBe(false)
  })

  it('is NOT a blackjack for a non-21 two-card hand', () => {
    expect(isNaturalBlackjack(1, [c(Rank.Nine), c(Rank.Seven)])).toBe(false)
  })
})

describe('isRecordableSession', () => {
  /**
   * The exploit this closes: the final curriculum stage asks for three casino
   * sessions at `minAccuracy: 0`, so any counted session qualifies. Opening the
   * table and leaving used to write one — three times through and the last
   * stage of the training plan was complete with no card dealt.
   */
  it('refuses a session that dealt no hands', () => {
    expect(isRecordableSession(0)).toBe(false)
  })

  it('accepts a session with a single real hand', () => {
    expect(isRecordableSession(1)).toBe(true)
    expect(isRecordableSession(42)).toBe(true)
  })
})

describe('playableLimits — table limits a hand can be dealt under', () => {
  const ok = { minBet: 25, maxBet: 500, startingBankroll: 5000 }

  it('leaves sensible limits alone', () => {
    expect(playableLimits(ok)).toEqual(ok)
  })

  it('raises the maximum to the minimum — a table where every bet is illegal never deals', () => {
    expect(playableLimits({ ...ok, minBet: 500, maxBet: 50 }).maxBet).toBe(500)
  })

  it('raises the bankroll to the minimum — otherwise Deal is enabled and does nothing', () => {
    expect(playableLimits({ ...ok, minBet: 500, startingBankroll: 100 }).startingBankroll).toBe(500)
  })

  it('keeps every other setting it is handed', () => {
    const config = { ...ok, numDecks: 6, penetration: 0.75 }
    expect(playableLimits(config)).toEqual(config)
  })
})

/**
 * The phone layout (16 Nov 2026). Measured before it: on a 390 x 844 phone a
 * three-seat table gave a 44px card, a full one a 25px card, and sideways the
 * felt was a 131px strip.
 */
describe('the stacked table — an upright phone', () => {
  const PHONE = { width: 374, height: 551 }

  it('is for a narrow, upright box only', () => {
    expect(isStackedBox(PHONE)).toBe(true)
    expect(isStackedBox({ width: 530, height: 327 })).toBe(false)   // a phone held sideways
    expect(isStackedBox({ width: 804, height: 900 })).toBe(false)   // a tablet
    expect(isStackedBox({ width: 1520, height: 480 })).toBe(false)  // a laptop
    expect(isStackedBox({ width: 0, height: 0 })).toBe(false)       // not measured yet
    expect(isStackedBox({ width: NaN, height: 500 })).toBe(false)
  })

  it('draws the bots as large as their row allows, never larger than 0.85', () => {
    expect(stackedBotZoom(1)).toBe(0.85)
    expect(stackedBotZoom(3)).toBe(0.85)
    expect(stackedBotZoom(4)).toBe(0.8)
    expect(stackedBotZoom(5)).toBe(0.64)
    expect(stackedBotZoom(9)).toBe(0.62)
  })

  it('fills the box exactly, so the felt has no margin', () => {
    for (const [bots, boxes] of [[0, 1], [2, 1], [5, 3]] as const) {
      const fit = fitStackedTable(PHONE, bots, boxes)
      expect(fit.sceneWidth * fit.scale).toBeCloseTo(PHONE.width, 5)
      expect(fit.sceneHeight * fit.scale).toBeCloseTo(PHONE.height, 5)
    }
  })

  it('never draws the scene smaller than it needs, on either axis', () => {
    for (const [bots, boxes] of [[0, 1], [2, 2], [5, 3]] as const) {
      const need = stackedTableSize(bots, boxes)
      const fit = fitStackedTable(PHONE, bots, boxes)
      expect(fit.sceneWidth).toBeGreaterThanOrEqual(need.width - 0.001)
      expect(fit.sceneHeight).toBeGreaterThanOrEqual(need.height - 0.001)
    }
  })

  it('gives the player a larger card than the one-row table did', () => {
    // One row: the scene was 640 wide for three seats, 1120 for eight.
    const stacked = fitStackedTable(PHONE, 5, 3).scale
    expect(stacked).toBeGreaterThan(fitTable(PHONE, undefined, undefined, 640).scale)
    expect(stacked).toBeGreaterThan(2 * fitTable(PHONE, undefined, undefined, 1120).scale * 0.95)
    // A 76-unit card is about 50px wide on screen.
    expect(76 * stacked).toBeGreaterThan(48)
  })

  it('makes room for the second row only when there are bots', () => {
    expect(stackedTableSize(0, 1).height).toBeLessThan(stackedTableSize(1, 1).height)
    expect(stackedTableSize(5, 3).width).toBeGreaterThanOrEqual(3 * 156 + 60)
  })
})
