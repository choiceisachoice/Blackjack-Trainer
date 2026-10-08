import { describe, it, expect } from 'vitest'
import { Rank, Suit } from '../../engine/shoe/types'
import type { Card } from '../../engine/shoe/types'
import { DEFAULT_RULES } from '../../engine/rules/types'
import { playBotTurn } from '../../engine/casino-session/bot-player'
import type { BotPlayer, BotTurnStep } from '../../engine/casino-session/types'
import { buildSplitReplay } from './split-replay'

/**
 * The replay of a split, end to end from the engine's log: what the table
 * shows, frame by frame. The case is Darius' from 8 Oct 2026 — 8,8 vs 6 that
 * re-splits — which used to appear as three hands in a single frame.
 */
const c = (rank: Rank, suit: Suit = Suit.Hearts): Card => ({ rank, suit })

function turn(pair: [Card, Card], up: Card, draws: Card[]): BotTurnStep[] {
  const bot: BotPlayer = {
    id: 'b', name: 'Sam', seatIndex: 0, bankroll: 10_000, currentBet: 20,
    hands: [{ cards: pair, bet: 20, isDoubled: false, isSplit: false, isBusted: false, isStanding: false }],
    isActive: true, skillLevel: 'basic_strategy', bettingPattern: 'flat', flatBetAmount: 20,
  }
  let i = 0
  const log: BotTurnStep[] = []
  playBotTurn(bot, up, () => draws[i++], { ...DEFAULT_RULES, surrenderAllowed: 'none', doubleAfterSplit: true, maxSplitHands: 4 }, log)
  return log
}

/** The hands on the table after every frame that changes them, as card counts. */
const tableStates = (log: BotTurnStep[]) =>
  buildSplitReplay(log, () => 1000).filter(f => f.hands).map(f => f.hands!.map(h => h.cards.length))

describe('buildSplitReplay', () => {
  const resplit = () => turn([c(Rank.Eight), c(Rank.Eight, Suit.Spades)], c(Rank.Six, Suit.Clubs),
    [c(Rank.Eight, Suit.Diamonds), c(Rank.Four), c(Rank.Ten), c(Rank.Seven)])

  it('puts the third hand on the table only after the 8 that made it', () => {
    expect(tableStates(resplit())).toEqual([
      [1, 1],       // the pair slides apart
      [2, 1],       // hand 1 is dealt the 8♦
      [1, 1, 1],    // …and splits again
      [2, 1, 1],    // hand 1: 8 + 4, stands on 12 vs 6
      [2, 2, 1],    // hand 2: 8 + 10
      [2, 2, 2],    // hand 3: 8 + 7
    ])
  })

  it('never shows more hands than splits so far', () => {
    const log = resplit()
    let splits = 0
    const frames = buildSplitReplay(log, () => 1000)
    for (const f of frames) {
      if (f.status === 'split') splits++
      if (f.hands) expect(f.hands.length).toBeLessThanOrEqual(splits + 1)
    }
  })

  it('plays one hand at a time: the ring moves on only after a hand is finished', () => {
    const frames = buildSplitReplay(resplit(), () => 1000)
    const order = frames.filter(f => f.active !== undefined).map(f => f.active)
    expect(order).toEqual([0, 0, 1, 2]) // first split, re-split, then hands 2 and 3
  })

  it('animates the slide on every split, never skipping it', () => {
    const frames = buildSplitReplay(resplit(), () => 1000)
    const splitAt = frames.flatMap((f, k) => (f.status === 'split' ? [k] : []))
    expect(splitAt).toHaveLength(2)
    for (const k of splitAt) {
      expect(frames[k].delayMs).toBe(1500)
      expect(frames[k + 1].hands).toBeDefined()
      expect(frames[k + 1].delayMs).toBe(1000)
    }
  })

  it('keeps each hand under the same id while it moves along the table', () => {
    const states = buildSplitReplay(resplit(), () => 1000).filter(f => f.hands).map(f => f.hands!.map(h => h.id))
    expect(states[0]).toEqual([0, 1])
    expect(states[2]).toEqual([0, 2, 1]) // the re-split hand slides in between
    expect(states[states.length - 1]).toEqual([0, 2, 1])
  })

  it('ends with the hands exactly as the engine settled them', () => {
    const log = resplit()
    const last = buildSplitReplay(log, () => 1000).filter(f => f.hands).at(-1)!.hands!
    expect(last.map(h => h.cards)).toEqual(log.at(-1)!.hands.map(h => h.cards))
  })

  it('stands split aces without a thinking pause', () => {
    const log = turn([c(Rank.Ace), c(Rank.Ace, Suit.Spades)], c(Rank.Six, Suit.Clubs), [c(Rank.Nine), c(Rank.Eight)])
    const frames = buildSplitReplay(log, () => 9999)
    expect(frames.some(f => f.delayMs === 9999)).toBe(false)
    expect(frames.filter(f => f.status === 'stand')).toHaveLength(2)
  })
})
