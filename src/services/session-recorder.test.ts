import { describe, it, expect, beforeEach } from 'vitest'
import { SessionRecorder, formatCard, formatHand } from './session-recorder'
import type { CasinoSessionConfig } from '../engine/casino-session/types'
import { Rank, Suit } from '../engine/shoe/types'

const mockConfig = { numBots: 3, minBet: 25 } as CasinoSessionConfig

describe('SessionRecorder', () => {
  let recorder: SessionRecorder

  beforeEach(() => {
    recorder = new SessionRecorder()
  })

  // ─── Basic Recording ────────────────────────────────

  it('records events with timestamps', () => {
    recorder.start(mockConfig)
    recorder.record('test', { foo: 'bar' })
    const log = JSON.parse(recorder.exportLog())
    expect(log.events.length).toBe(2) // session_start + test
    expect(log.events[1].type).toBe('test')
    expect(log.events[1].timestamp).toBeGreaterThanOrEqual(0)
  })

  it('records new hand events', () => {
    recorder.start(mockConfig)
    recorder.recordNewHand(1)
    recorder.recordNewHand(2)
    const log = JSON.parse(recorder.exportLog())
    const handEvents = log.events.filter((e: { type: string }) => e.type === 'new_hand')
    expect(handEvents.length).toBe(2)
    expect(handEvents[0].data.handNumber).toBe(1)
    expect(handEvents[1].data.handNumber).toBe(2)
  })

  it('records shuffle events', () => {
    recorder.start(mockConfig)
    recorder.recordShuffle(5)
    const log = JSON.parse(recorder.exportLog())
    const shuffleEvents = log.events.filter((e: { type: string }) => e.type === 'shuffle')
    expect(shuffleEvents.length).toBe(1)
    expect(shuffleEvents[0].data.handNumber).toBe(5)
  })

  it('records card dealt events with count tracking', () => {
    recorder.start(mockConfig)
    recorder.recordCardDealt('human', 'A\u2660', 1, -1, -0.5)
    recorder.recordCardDealt('dealer_up', 'K\u2665', 1, -2, -1)
    const log = JSON.parse(recorder.exportLog())
    const cardEvents = log.events.filter((e: { type: string }) => e.type === 'card_dealt')
    expect(cardEvents.length).toBe(2)
    expect(cardEvents[0].data.recipient).toBe('human')
    expect(cardEvents[0].data.card).toBe('A\u2660')
    expect(cardEvents[0].data.runningCount).toBe(-1)
  })

  it('records bet placed events', () => {
    recorder.start(mockConfig)
    recorder.recordBetPlaced('human', 100, 100, 2, 1)
    const log = JSON.parse(recorder.exportLog())
    const betEvents = log.events.filter((e: { type: string }) => e.type === 'bet_placed')
    expect(betEvents.length).toBe(1)
    expect(betEvents[0].data.amount).toBe(100)
    expect(betEvents[0].data.isCorrect).toBe(true)
  })

  it('records insurance decisions', () => {
    recorder.start(mockConfig)
    recorder.recordInsurance(true, 3.5, true, 1)
    const log = JSON.parse(recorder.exportLog())
    const insEvents = log.events.filter((e: { type: string }) => e.type === 'insurance')
    expect(insEvents.length).toBe(1)
    expect(insEvents[0].data.playerTook).toBe(true)
    expect(insEvents[0].data.correctDecision).toBe(true)
  })

  it('records count check events', () => {
    recorder.start(mockConfig)
    recorder.recordCountCheck(3, 5, 6, 2.0, 2.5)
    const log = JSON.parse(recorder.exportLog())
    const ccEvents = log.events.filter((e: { type: string }) => e.type === 'count_check')
    expect(ccEvents.length).toBe(1)
    expect(ccEvents[0].data.rcCorrect).toBe(false)
    expect(ccEvents[0].data.rcError).toBe(-1)
    expect(ccEvents[0].data.tcCorrect).toBe(true) // within 0.5
  })

  it('records phase change events', () => {
    recorder.start(mockConfig)
    recorder.recordPhaseChange(1, 'betting', 'dealing')
    const log = JSON.parse(recorder.exportLog())
    const phaseEvents = log.events.filter((e: { type: string }) => e.type === 'phase_change')
    expect(phaseEvents.length).toBe(1)
    expect(phaseEvents[0].data.from).toBe('betting')
    expect(phaseEvents[0].data.to).toBe('dealing')
  })

  it('records blackjack check events', () => {
    recorder.start(mockConfig)
    recorder.recordBlackjackCheck('human', ['A\u2660', 'K\u2665'], true, 1)
    const log = JSON.parse(recorder.exportLog())
    const bjEvents = log.events.filter((e: { type: string }) => e.type === 'blackjack_check')
    expect(bjEvents.length).toBe(1)
    expect(bjEvents[0].data.isBlackjack).toBe(true)
    expect(bjEvents[0].data.cardCount).toBe(2)
  })

  // ─── Anomaly Detection ──────────────────────────────

  it('detects dealer hole card change anomaly', () => {
    recorder.start(mockConfig)
    recorder.recordDealerReveal('K\u2665', 1, '7\u2663', 5)
    expect(recorder.getAnomalyCount()).toBe(1)
    expect(recorder.getAnomalies()[0]).toContain('CHANGED')
    expect(recorder.getAnomalies()[0]).toContain('K\u2665')
    expect(recorder.getAnomalies()[0]).toContain('7\u2663')
  })

  it('no anomaly when dealer hole card matches', () => {
    recorder.start(mockConfig)
    recorder.recordDealerReveal('K\u2665', 1, 'K\u2665', 5)
    expect(recorder.getAnomalyCount()).toBe(0)
  })

  it('detects dealer up card change anomaly', () => {
    recorder.start(mockConfig)
    recorder.recordDealerUpCardCheck('A\u2660', '5\u2663', 1)
    expect(recorder.getAnomalyCount()).toBe(1)
    expect(recorder.getAnomalies()[0]).toContain('UP card CHANGED')
  })

  it('no anomaly when dealer up card matches', () => {
    recorder.start(mockConfig)
    recorder.recordDealerUpCardCheck('A\u2660', 'A\u2660', 1)
    expect(recorder.getAnomalyCount()).toBe(0)
  })

  it('detects blackjack settlement anomaly — BJ vs normal 21 as push', () => {
    recorder.start(mockConfig)
    recorder.recordSettlement('bot:Alex', 'push', 0, 21, true, 21, false, 25, 1)
    expect(recorder.getAnomalyCount()).toBeGreaterThanOrEqual(1)
    expect(recorder.getAnomalies()[0]).toContain('BLACKJACK')
  })

  it('detects blackjack with negative profit anomaly', () => {
    recorder.start(mockConfig)
    recorder.recordSettlement('human', 'blackjack', -25, 21, true, 18, false, 25, 1)
    expect(recorder.getAnomalyCount()).toBe(1)
    expect(recorder.getAnomalies()[0]).toContain('BLACKJACK')
    expect(recorder.getAnomalies()[0]).toContain('profit')
  })

  it('detects player higher value but not win', () => {
    recorder.start(mockConfig)
    recorder.recordSettlement('human', 'push', 0, 20, false, 17, false, 25, 1)
    expect(recorder.getAnomalyCount()).toBe(1)
    expect(recorder.getAnomalies()[0]).toContain('20 > dealer 17')
  })

  it('detects dealer bust but player not winning', () => {
    recorder.start(mockConfig)
    recorder.recordSettlement('human', 'loss', -25, 18, false, 22, false, 25, 1)
    expect(recorder.getAnomalyCount()).toBe(1)
    expect(recorder.getAnomalies()[0]).toContain('Dealer BUST')
  })

  it('detects win with zero profit', () => {
    recorder.start(mockConfig)
    recorder.recordSettlement('human', 'win', 0, 20, false, 17, false, 25, 1)
    expect(recorder.getAnomalyCount()).toBe(1)
    expect(recorder.getAnomalies()[0]).toContain('win')
    expect(recorder.getAnomalies()[0]).toContain('profit is 0')
  })

  it('no anomaly for correct blackjack settlement', () => {
    recorder.start(mockConfig)
    recorder.recordSettlement('human', 'blackjack', 37.5, 21, true, 18, false, 25, 1)
    expect(recorder.getAnomalyCount()).toBe(0)
  })

  it('no anomaly for correct win settlement', () => {
    recorder.start(mockConfig)
    recorder.recordSettlement('human', 'win', 25, 20, false, 17, false, 25, 1)
    expect(recorder.getAnomalyCount()).toBe(0)
  })

  it('no anomaly for correct push settlement', () => {
    recorder.start(mockConfig)
    recorder.recordSettlement('human', 'push', 0, 20, false, 20, false, 25, 1)
    expect(recorder.getAnomalyCount()).toBe(0)
  })

  it('no anomaly for correct loss settlement', () => {
    recorder.start(mockConfig)
    recorder.recordSettlement('human', 'loss', -25, 17, false, 20, false, 25, 1)
    expect(recorder.getAnomalyCount()).toBe(0)
  })

  it('detects bot BS violation', () => {
    recorder.start(mockConfig)
    recorder.recordPlayerAction('bot:Sam', 'stand', 13, '9\u2663', 'hit', false, false, 1)
    expect(recorder.getAnomalyCount()).toBe(1)
    expect(recorder.getAnomalies()[0]).toContain('bot:Sam')
    expect(recorder.getAnomalies()[0]).toContain('stand')
    expect(recorder.getAnomalies()[0]).toContain('hit')
  })

  it('no anomaly for correct bot play', () => {
    recorder.start(mockConfig)
    recorder.recordPlayerAction('bot:Sam', 'hit', 13, '9\u2663', 'hit', true, false, 1)
    expect(recorder.getAnomalyCount()).toBe(0)
  })

  it('no anomaly for bot with blackjack even if action seems wrong', () => {
    recorder.start(mockConfig)
    recorder.recordPlayerAction('bot:Sam', 'stand', 21, '9\u2663', 'stand', true, true, 1)
    expect(recorder.getAnomalyCount()).toBe(0)
  })

  it('no anomaly for human incorrect play (only bots trigger BS anomaly)', () => {
    recorder.start(mockConfig)
    recorder.recordPlayerAction('human', 'stand', 13, '9\u2663', 'hit', false, false, 1)
    expect(recorder.getAnomalyCount()).toBe(0)
  })

  it('detects too-fast animation timing', () => {
    recorder.start(mockConfig)
    recorder.recordTimingEvent('card_animation', 50, 1)
    expect(recorder.getAnomalyCount()).toBe(1)
    expect(recorder.getAnomalies()[0]).toContain('50ms')
  })

  it('no anomaly for normal timing event', () => {
    recorder.start(mockConfig)
    recorder.recordTimingEvent('card_animation', 500, 1)
    expect(recorder.getAnomalyCount()).toBe(0)
  })

  it('no anomaly for fast non-animation event', () => {
    recorder.start(mockConfig)
    recorder.recordTimingEvent('bet_placed', 10, 1)
    expect(recorder.getAnomalyCount()).toBe(0)
  })

  // ─── Hand Snapshots ─────────────────────────────────

  it('takes and exports hand snapshots', () => {
    recorder.start(mockConfig)
    recorder.takeSnapshot(1, 'after_deal', {
      handNumber: 0,
      phase: '',
      cardsRemainingInShoe: 300,
      runningCount: 2,
      trueCount: 0.35,
      cardsDealtThisShoe: 12,
      dealerUpCard: 'K\u2660',
      dealerHoleCard: null,
      dealerAllCards: ['K\u2660'],
      dealerHandValue: 10,
      dealerIsBlackjack: false,
      humanCards: ['A\u2665', '7\u2663'],
      humanHandValue: 18,
      humanIsBlackjack: false,
      humanBet: 50,
      humanBankroll: 4950,
      bots: [],
    })
    const log = JSON.parse(recorder.exportLog())
    expect(log.summary.totalHands).toBe(1)
    expect(log.handSnapshots['1']).toBeDefined()
    expect(log.handSnapshots['1'][0].phase).toBe('after_deal')
    expect(log.handSnapshots['1'][0].runningCount).toBe(2)
  })

  // ─── Export ─────────────────────────────────────────

  it('exportLog produces valid JSON with all sections', () => {
    recorder.start(mockConfig)
    recorder.recordNewHand(1)
    recorder.takeSnapshot(1, 'test', {
      handNumber: 0, phase: '', cardsRemainingInShoe: 300,
      runningCount: 0, trueCount: 0, cardsDealtThisShoe: 0,
      dealerUpCard: null, dealerHoleCard: null, dealerAllCards: [],
      dealerHandValue: 0, dealerIsBlackjack: false,
      humanCards: [], humanHandValue: 0, humanIsBlackjack: false,
      humanBet: 0, humanBankroll: 5000, bots: [],
    })
    const json = recorder.exportLog()
    const parsed = JSON.parse(json)
    expect(parsed.config.numBots).toBe(3)
    expect(parsed.summary.totalHands).toBe(1)
    expect(parsed.summary.totalEvents).toBeGreaterThan(0)
    expect(parsed.exportedAt).toBeDefined()
    expect(parsed.sessionDurationMs).toBeGreaterThanOrEqual(0)
    expect(parsed.events).toBeInstanceOf(Array)
    expect(parsed.anomalies).toBeInstanceOf(Array)
  })

  it('exportLog includes anomalies in summary', () => {
    recorder.start(mockConfig)
    recorder.recordDealerReveal('K\u2665', 1, '7\u2663', 5)
    const parsed = JSON.parse(recorder.exportLog())
    expect(parsed.summary.totalAnomalies).toBe(1)
    expect(parsed.anomalies.length).toBe(1)
    expect(parsed.anomalies[0]).toContain('CHANGED')
  })

  it('start() resets previous state', () => {
    recorder.start(mockConfig)
    recorder.recordNewHand(1)
    recorder.recordDealerReveal('K\u2665', 1, '7\u2663', 5)
    expect(recorder.getAnomalyCount()).toBe(1)

    // Restart
    recorder.start(mockConfig)
    expect(recorder.getAnomalyCount()).toBe(0)
    const log = JSON.parse(recorder.exportLog())
    expect(log.events.length).toBe(1) // only session_start
  })

  it('getAnomalies returns a copy', () => {
    recorder.start(mockConfig)
    recorder.recordDealerReveal('K\u2665', 1, '7\u2663', 5)
    const anomalies = recorder.getAnomalies()
    anomalies.push('fake anomaly')
    expect(recorder.getAnomalyCount()).toBe(1) // original not mutated
  })

  // ─── Multiple anomalies in one session ──────────────

  it('accumulates multiple anomalies', () => {
    recorder.start(mockConfig)
    recorder.recordDealerReveal('K\u2665', 1, '7\u2663', 5) // 1 anomaly: card changed
    recorder.recordSettlement('bot:Alex', 'push', 0, 21, true, 21, false, 25, 2) // 2 anomalies: BJ wrong result + BJ wrong profit
    recorder.recordPlayerAction('bot:Sam', 'stand', 13, '9\u2663', 'hit', false, false, 3) // 1 anomaly: BS violation
    expect(recorder.getAnomalyCount()).toBe(4)
  })
})

// ─── Format Helpers ───────────────────────────────────

describe('formatCard', () => {
  it('formats a card with suit symbol', () => {
    expect(formatCard({ rank: Rank.Ace, suit: Suit.Spades })).toBe('A\u2660')
    expect(formatCard({ rank: Rank.King, suit: Suit.Hearts })).toBe('K\u2665')
    expect(formatCard({ rank: Rank.Ten, suit: Suit.Diamonds })).toBe('10\u2666')
    expect(formatCard({ rank: Rank.Two, suit: Suit.Clubs })).toBe('2\u2663')
  })
})

describe('formatHand', () => {
  it('formats multiple cards as space-separated string', () => {
    const hand = [
      { rank: Rank.Ace, suit: Suit.Spades },
      { rank: Rank.King, suit: Suit.Hearts },
    ]
    expect(formatHand(hand)).toBe('A\u2660 K\u2665')
  })

  it('returns empty string for empty hand', () => {
    expect(formatHand([])).toBe('')
  })
})
