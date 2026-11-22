import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Card } from '../shoe/types'
import { getHandValue, isBlackjack, isBust, isPair } from '../rules/hand-utils'
import { Action } from '../rules/types'
import { CountingSystemId } from '../counting/types'
import { CasinoSessionEngine } from './session-engine'
import { CASINO_SNAPSHOT_VERSION, parseSalvage, parseSnapshot, voidOpenHand } from './session-snapshot'
import type { CasinoSessionSnapshot } from './session-snapshot'
import type { CasinoSessionConfig, PlayDecision, PlayerHandRecord } from './types'

/**
 * A table saved and put back must be the same table.
 *
 * The claim is tested as a property, not on one hand-picked position: play N
 * hands, save, restore, play K more — and the result has to be identical, card
 * for card and cent for cent, to the session that was never interrupted. Every
 * random number the table draws (the shuffle, the bots' habits, a new player
 * sitting down) comes from one seeded generator, so "identical" also proves
 * that restoring draws none of its own.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function config(overrides: Partial<CasinoSessionConfig> = {}): CasinoSessionConfig {
  return {
    sessionMode: 'unlimited',
    targetHands: 30,
    targetMinutes: 30,
    numBots: 3,
    playerSeatIndex: 2,
    multiHand: true,
    startingBankroll: 20000,
    minBet: 25,
    maxBet: 500,
    numDecks: 6,
    dealerHitsSoft17: false,
    doubleAfterSplit: true,
    surrenderAllowed: true,
    blackjackPays: 1.5,
    penetration: 0.75,
    maxSplitHands: 4,
    playStyle: 'counting',
    trainingMode: true,
    countCheckFrequency: 'every5',
    showDeviationHints: true,
    countingSystem: CountingSystemId.HiLo,
    casinoAmbience: false,
    ...overrides,
  }
}

interface LiveHand { cards: Card[]; box: number; split: boolean; doubled: boolean; surrendered: boolean }

/** What happened in the hands played, so a test can say the property was not vacuous. */
interface Seen { splits: number; doubles: number; insurances: number; surrenders: number; multiBox: number; shuffles: number }

/**
 * One round, played the way the table plays it (`useGameLoop`): bets off the
 * bankroll, the deal, insurance hand by hand, the bots before each of the
 * player's hands, splits dealt one hand at a time, the dealer, the settlement,
 * the record, the count check and the shuffle at the end of the round.
 *
 * The player follows the book most of the time and makes a random legal move
 * the rest, so doubles, splits and surrenders all come up.
 */
function playRound(engine: CasinoSessionEngine, cfg: CasinoSessionConfig, rand: () => number, seen: Seen): boolean {
  const free = engine.getFreeSeats()
  const wanted = cfg.multiHand ? 1 + Math.floor(rand() * Math.min(3, free.length)) : 1
  engine.setHumanBoxes(wanted)
  const seats = engine.getHumanBoxSeats()
  const bets = seats.map(() => cfg.minBet * (1 + Math.floor(rand() * 4)))
  const staked = bets.reduce((a, b) => a + b, 0)
  if (staked * 4 > engine.getHumanBankroll()) return false
  if (seats.length > 1) seen.multiBox++

  const atBet = engine.getCountForNextRound()
  const remainingDecks = engine.getRemainingDecks()
  engine.deductHumanBet(staked)
  const deal = engine.dealNewRound(seats)
  if (deal.reshuffled) seen.shuffles++
  const up = deal.dealerUpCard
  const dealerStart = [up, deal.dealerHoleCard]
  const dealerNatural = isBlackjack(dealerStart)
  const hands: LiveHand[] = deal.humanBoxCards.map((cards, box) => ({ cards: [...cards], box, split: false, doubled: false, surrendered: false }))
  const decisions: (PlayDecision & { handIndex: number })[] = []

  let insuranceTotal = 0
  let insured = false
  if (up.rank === 'A') {
    const taken = seats.map(() => rand() < 0.5)
    insured = taken.some(Boolean)
    if (insured) seen.insurances++
    const nets = engine.settleInsurances(bets, taken, dealerNatural)
    for (const net of nets) { engine.updateHumanBankroll(net); insuranceTotal += net }
  }

  if (!dealerNatural) {
    let botsPlayedTo = -1
    const botsBefore = (seat: number) => {
      engine.getSeats().forEach((bot, i) => {
        if (bot && bot.isActive && i > botsPlayedTo && i < seat) engine.playBotAtSeat(i, up)
      })
      botsPlayedTo = Math.max(botsPlayedTo, seat - 1)
    }
    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i]
      if (!hand.split && isBlackjack(hand.cards)) continue
      botsBefore(seats[hand.box])
      if (hand.cards.length === 1) hand.cards.push(engine.drawCard())
      for (;;) {
        const bet = bets[hand.box]
        const first = hand.cards.length === 2
        const inBox = hands.filter(h => h.box === hand.box).length
        const funds = engine.getHumanBankroll() >= bet
        const canSplit = first && isPair(hand.cards) && inBox < cfg.maxSplitHands && funds
        const splitAce = hand.split && hand.cards[0].rank === 'A'
        if (splitAce) {
          // One card to a split ace; a second ace may be split again.
          if (canSplit && hand.cards[1].rank === 'A' && rand() < 0.6) {
            engine.deductHumanBet(bet)
            const [a, b] = hand.cards
            hand.cards = [a, engine.drawCard()]
            hands.splice(i + 1, 0, { cards: [b], box: hand.box, split: true, doubled: false, surrendered: false })
            seen.splits++
            continue
          }
          break
        }
        if (isBust(hand.cards) || getHandValue(hand.cards).best === 21) break
        const canDouble = first && funds && (!hand.split || cfg.doubleAfterSplit)
        const canSurrender = first && cfg.surrenderAllowed && !hand.split
        const book = engine.getCorrectAction(hand.cards, up, engine.getTrueCount(), canSplit, canDouble, canSurrender).action
        const legal = [Action.Hit, Action.Stand, ...(canDouble ? [Action.Double] : []), ...(canSplit ? [Action.Split] : []), ...(canSurrender ? [Action.Surrender] : [])]
        const action = rand() < 0.3 ? legal[Math.floor(rand() * legal.length)] : book
        const decision = { action: action.toString(), correctAction: book.toString(), isCorrect: action === book, handValueAfter: getHandValue(hand.cards).best, handIndex: i }
        decisions.push(decision)
        if (action === Action.Stand) break
        if (action === Action.Surrender) { hand.surrendered = true; seen.surrenders++; break }
        if (action === Action.Hit) {
          hand.cards.push(engine.drawCard())
          decision.handValueAfter = getHandValue(hand.cards).best
          continue
        }
        if (action === Action.Double) {
          engine.deductHumanBet(bet)
          hand.doubled = true
          hand.cards.push(engine.drawCard())
          decision.handValueAfter = getHandValue(hand.cards).best
          seen.doubles++
          break
        }
        // Split: this hand keeps the first card and takes a new one now; the
        // other half waits for its card until play reaches it.
        engine.deductHumanBet(bet)
        const [a, b] = hand.cards
        hand.split = true
        hand.cards = [a, engine.drawCard()]
        hands.splice(i + 1, 0, { cards: [b], box: hand.box, split: true, doubled: false, surrendered: false })
        seen.splits++
      }
    }
    botsBefore(Number.POSITIVE_INFINITY)
  }

  const needsDealer = hands.some(h => !h.surrendered && !isBust(h.cards) && !(!h.split && isBlackjack(h.cards)))
  const dealer = engine.playDealerHand(dealerStart, dealerNatural ? true : needsDealer)

  let profit = 0
  let stake = 0
  let last: PlayerHandRecord['result'] = 'push'
  for (const hand of hands) {
    const bet = bets[hand.box] * (hand.doubled ? 2 : 1)
    const settled = engine.settleHand(hand.cards, dealer, bet, hand.doubled, hand.surrendered, hand.split)
    profit += settled.profit
    stake += bet
    last = settled.result
  }
  if (hands.length > 1) last = profit > 0 ? 'win' : profit < 0 ? 'loss' : 'push'
  engine.updateHumanBankroll(stake + profit)
  const botResults = engine.settleBotHands(dealer)

  const perHand = Math.round(staked / seats.length)
  const correctBet = engine.isBasicPlay() ? perHand : engine.getCorrectBet(atBet.trueCount)
  const record: PlayerHandRecord = {
    handNumber: engine.getCurrentHandNumber(),
    trueCountAtBet: atBet.trueCount,
    runningCountAtBet: atBet.runningCount,
    remainingDecks,
    playerBet: perHand,
    correctBet,
    betCorrect: engine.isBasicPlay() ? true : bets.every(b => engine.isBetCorrect(b, correctBet)),
    betError: perHand - correctBet,
    playerCards: hands[0].cards,
    dealerUpCard: up,
    dealerHoleCard: deal.dealerHoleCard,
    dealerFinalCards: dealer,
    decisions,
    firstAction: decisions[0]?.action ?? '',
    correctFirstAction: decisions[0]?.correctAction ?? '',
    firstActionCorrect: decisions[0]?.isCorrect ?? true,
    wasDeviationSituation: false,
    insuranceOffered: up.rank === 'A',
    playerTookInsurance: up.rank === 'A' ? insured : undefined,
    countChecked: false,
    actualRC: engine.getRunningCount(),
    actualTC: engine.getTrueCount(),
    playerHandValue: getHandValue(hands[0].cards).best,
    dealerHandValue: getHandValue(dealer).best,
    result: last,
    profit: profit + insuranceTotal,
    bankrollAfter: engine.getHumanBankroll(),
    botResults,
  }
  engine.recordHand(record)

  if (engine.shouldCheckCount(engine.getCurrentHandNumber())) {
    // The check is written into the hand already recorded, as the table does.
    const answer = engine.getRunningCount() + (rand() < 0.4 ? 1 : 0)
    const lastHand = engine.getHandHistory().slice(-1)[0]
    const check = engine.validateCountInput(answer, engine.getTrueCount())
    Object.assign(lastHand, { countChecked: true, playerRC: answer, playerTC: engine.getTrueCount(), ...check })
  }
  if (engine.reshuffleAfterRound()) seen.shuffles++
  return true
}

/**
 * A value as text with its keys in order.
 *
 * Two tables are the same when they hold the same data; the order in which a
 * bot's optional fields were first written (`turnLog`, `lastRoundNet`) is not
 * data, and it differs after a trip through storage — a field that was
 * `undefined` when saved is appended when it is next set.
 */
function canon(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v)
}

const newSeen = (): Seen => ({ splits: 0, doubles: 0, insurances: 0, surrenders: 0, multiBox: 0, shuffles: 0 })

/** Everything that can be observed of a table, as one comparable value. */
function observe(engine: CasinoSessionEngine) {
  return {
    table: engine.snapshot(),
    result: engine.calculateSessionResult(1_000, 61_000),
    trueCount: engine.getTrueCount(),
    freeSeats: engine.getFreeSeats(),
  }
}

/** A session of `hands` rounds; with `saveAfter`, saved and restored after that many. */
function runSession(seed: number, cfg: CasinoSessionConfig, hands: number, saveAfter?: number) {
  const tableRandom = mulberry32(seed)
  vi.spyOn(Math, 'random').mockImplementation(tableRandom)
  const playerRandom = mulberry32(seed ^ 0x5bd1e995)
  const seen = newSeen()
  let engine = new CasinoSessionEngine(cfg)
  let saved: CasinoSessionSnapshot | null = null
  for (let h = 0; h < hands; h++) {
    if (h === saveAfter) {
      // Through text, as storage would hold it.
      saved = JSON.parse(JSON.stringify(engine.snapshot())) as CasinoSessionSnapshot
      const restored = CasinoSessionEngine.restore(saved)
      expect(restored).not.toBeNull()
      engine = restored!
    }
    if (!playRound(engine, cfg, playerRandom, seen)) break
  }
  const seenOut = observe(engine)
  vi.restoreAllMocks()
  return { ...seenOut, seen, saved }
}

afterEach(() => { vi.restoreAllMocks() })

describe('a table saved and restored', () => {
  const tables: [string, Partial<CasinoSessionConfig>][] = [
    ['three bots, several hands, six decks', {}],
    ['a full table of five bots', { numBots: 5, playerSeatIndex: 0 }],
    ['alone at the table, three hands', { numBots: 0 }],
    ['two decks, H17, 6:5, no surrender, no DAS', { numDecks: 2, dealerHitsSoft17: true, blackjackPays: 1.2, surrenderAllowed: false, doubleAfterSplit: false, numBots: 2, penetration: 0.65 }],
    ['eight decks, deep penetration, a count check every hand', { numDecks: 8, penetration: 0.85, countCheckFrequency: 'every', numBots: 4 }],
    ['just blackjack, one hand', { playStyle: 'basic', multiHand: false, numBots: 1 }],
  ]
  const seeds = [1, 7, 20261121, 987654321]

  for (const [name, overrides] of tables) {
    it(`plays on exactly like the uninterrupted one — ${name}`, () => {
      const cfg = config(overrides)
      for (const seed of seeds) {
        const whole = runSession(seed, cfg, 60)
        const resumed = runSession(seed, cfg, 60, 30)
        expect(resumed.saved).not.toBeNull()
        expect(resumed.table.handHistory.length).toBe(whole.table.handHistory.length)
        expect(resumed.table.handHistory.length).toBeGreaterThan(30)
        expect(canon(resumed.table)).toBe(canon(whole.table))
        // As text: storage has no negative zero, and a true count of -0 is 0.
        expect(canon(resumed.result)).toBe(canon(whole.result))
        expect(resumed.trueCount).toBe(whole.trueCount)
        expect(resumed.freeSeats).toEqual(whole.freeSeats)
      }
    })
  }

  it('was tested on sessions that split, doubled, insured, surrendered, played several hands and shuffled', () => {
    const total = newSeen()
    for (const seed of seeds) {
      const run = runSession(seed, config(), 60, 30)
      for (const key of Object.keys(total) as (keyof Seen)[]) total[key] += run.seen[key]
    }
    for (const key of Object.keys(total) as (keyof Seen)[]) expect(total[key], key).toBeGreaterThan(0)
  })

  it('holds at any point between hands, the very start included', () => {
    const cfg = config({ numBots: 4 })
    const whole = runSession(42, cfg, 25)
    for (const at of [0, 1, 2, 13, 24]) {
      expect(canon(runSession(42, cfg, 25, at).table)).toBe(canon(whole.table))
    }
  })

  it('carries everything the result is computed from', () => {
    const cfg = config()
    const { saved } = runSession(3, cfg, 40, 30)
    const live = CasinoSessionEngine.restore(saved)!
    const again = CasinoSessionEngine.restore(JSON.parse(JSON.stringify(live.snapshot())))!
    expect(JSON.stringify(again.calculateSessionResult(0, 90_000))).toBe(JSON.stringify(live.calculateSessionResult(0, 90_000)))
    expect(again.getCurrentHandNumber()).toBe(30)
    expect(again.getHandHistory()).toHaveLength(30)
    expect(again.getHumanBankroll()).toBe(saved!.humanBankroll)
    expect(again.getRunningCount()).toBe(saved!.runningCount)
    expect(again.getCardsDealt()).toBe(saved!.cardsDealt)
    expect(again.getHumanBoxSeats()).toEqual(saved!.humanBoxSeats)
    expect(again.getSeats().map(s => s?.name ?? null)).toEqual(saved!.seats.map(s => s?.name ?? null))
  })

  it('draws no random number when it is restored', () => {
    const { saved } = runSession(5, config(), 10, 5)
    const random = vi.spyOn(Math, 'random')
    CasinoSessionEngine.restore(saved)
    expect(random).not.toHaveBeenCalled()
  })

  it('is a copy: playing on changes neither the snapshot nor the engine it came from', () => {
    const cfg = config()
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(11))
    const rand = mulberry32(12)
    const engine = new CasinoSessionEngine(cfg)
    const seen = newSeen()
    for (let h = 0; h < 5; h++) playRound(engine, cfg, rand, seen)
    const snapshot = engine.snapshot()
    const frozen = JSON.stringify(snapshot)
    const twin = CasinoSessionEngine.restore(snapshot)!
    for (let h = 0; h < 5; h++) playRound(twin, cfg, rand, seen)
    expect(JSON.stringify(snapshot)).toBe(frozen)
    expect(JSON.stringify(engine.snapshot())).toBe(frozen)
    expect(twin.getHandHistory()).toHaveLength(10)
  })

  it('is plain data', () => {
    const { saved, table } = runSession(9, config(), 12, 6)
    expect(JSON.parse(JSON.stringify(table))).toEqual(table)
    expect(saved!.version).toBe(CASINO_SNAPSHOT_VERSION)
  })
})

describe('a snapshot that cannot be trusted', () => {
  /** A real snapshot to break in one place at a time. */
  function good(): CasinoSessionSnapshot {
    return runSession(21, config(), 8).table
  }
  const broken = (change: (s: Record<string, unknown>) => void): unknown => {
    const copy = JSON.parse(JSON.stringify(good())) as Record<string, unknown>
    change(copy)
    return copy
  }

  it('is accepted when nothing is wrong with it', () => {
    expect(parseSnapshot(good())).not.toBeNull()
    expect(CasinoSessionEngine.restore(good())).toBeInstanceOf(CasinoSessionEngine)
  })

  it('is refused from another version, older or newer', () => {
    expect(CasinoSessionEngine.restore(broken(s => { s.version = 0 }))).toBeNull()
    expect(CasinoSessionEngine.restore(broken(s => { s.version = CASINO_SNAPSHOT_VERSION + 1 }))).toBeNull()
    expect(CasinoSessionEngine.restore(broken(s => { delete s.version }))).toBeNull()
  })

  it('is refused when it is not a snapshot at all', () => {
    for (const junk of [null, undefined, 0, 'table', [], {}, { version: CASINO_SNAPSHOT_VERSION }, '{"version":1}']) {
      expect(() => CasinoSessionEngine.restore(junk)).not.toThrow()
      expect(CasinoSessionEngine.restore(junk)).toBeNull()
    }
  })

  const cases: [string, (s: Record<string, unknown>) => void][] = [
    ['a shoe with a card missing', s => { (s.shoe as { cards: number[] }).cards.pop() }],
    ['a shoe with one card too many of a kind', s => { const c = (s.shoe as { cards: number[] }).cards; c[0] = (c[0] + 1) % 52 }],
    ['a card that does not exist', s => { (s.shoe as { cards: number[] }).cards[0] = 52 }],
    ['a deal index past the end', s => { (s.shoe as { dealIndex: number }).dealIndex = 100000 }],
    ['no shoe', s => { delete s.shoe }],
    ['a bankroll that is not a number', s => { s.humanBankroll = '5000' }],
    ['a bankroll of NaN (null after JSON)', s => { s.humanBankroll = null }],
    ['a hand number below zero', s => { s.currentHandNumber = -1 }],
    ['five seats', s => { (s.seats as unknown[]).pop() }],
    ['a bot on the player\'s own seat', s => { const seats = s.seats as unknown[]; const bot = seats.find(x => x !== null) as Record<string, unknown>; seats[2] = { ...bot, seatIndex: 2 } }],
    ['a bot without a bankroll', s => { const bot = (s.seats as (Record<string, unknown> | null)[]).find(x => x !== null)!; delete bot.bankroll }],
    ['a bot of an unknown kind', s => { const bot = (s.seats as (Record<string, unknown> | null)[]).find(x => x !== null)!; bot.skillLevel = 'psychic' }],
    ['the player\'s hand on a bot\'s seat', s => { s.humanBoxSeats = [(s.seats as unknown[]).findIndex(x => x !== null)] }],
    ['no seat for the player', s => { s.humanBoxSeats = [] }],
    ['a hand history that is not a list', s => { s.handHistory = {} }],
    ['a hand without a result', s => { delete (s.handHistory as Record<string, unknown>[])[0].result }],
    ['a hand with a card that is not one', s => { (s.handHistory as { playerCards: unknown[] }[])[0].playerCards = [{ rank: '1', suit: 'Stars' }] }],
    ['no rules', s => { delete s.config }],
    ['a penetration no shoe accepts', s => { (s.config as Record<string, unknown>).penetration = 0.99 }],
    ['an unknown counting system', s => { (s.config as Record<string, unknown>).countingSystem = 'Tarot' }],
    ['a minimum above the maximum', s => { (s.config as Record<string, unknown>).minBet = 100000 }],
    ['zero decks', s => { (s.config as Record<string, unknown>).numDecks = 0 }],
  ]
  for (const [name, change] of cases) {
    it(`is refused with ${name}`, () => {
      const snapshot = broken(change)
      expect(() => CasinoSessionEngine.restore(snapshot)).not.toThrow()
      expect(CasinoSessionEngine.restore(snapshot)).toBeNull()
      expect(parseSnapshot(snapshot)).toBeNull()
    })
  }

  it('is refused when reading it throws', () => {
    const trap = new Proxy(good(), { get: () => { throw new Error('no') } })
    expect(CasinoSessionEngine.restore(trap)).toBeNull()
  })
})


/**
 * A hand the page died in: the bet goes back, the cards do not.
 *
 * Before, the saved copy predated the deal, so restoring it put the same
 * cards back on top of the shoe — a hand could be seen, reloaded away and
 * dealt again.
 */
describe('a hand that is called off', () => {
  const quiet = () => config({ numBots: 2, multiHand: false })

  it('is not dealt a second time: the restored table deals the cards after it', () => {
    const live = new CasinoSessionEngine(quiet())
    const before = live.snapshot()
    live.deductHumanBet(100)
    const first = live.dealNewRound()
    const during = voidOpenHand(live.snapshot(), 100)

    // The defect, for the record: restored from before the deal, the same hand comes again.
    const rewound = CasinoSessionEngine.restore(JSON.parse(JSON.stringify(before)))!
    rewound.deductHumanBet(100)
    expect(rewound.dealNewRound().allDealtCards).toEqual(first.allDealtCards)

    // Restored from the copy written after the deal, it is the next cards of the shoe.
    const restored = CasinoSessionEngine.restore(JSON.parse(JSON.stringify(during)))!
    expect(restored).not.toBeNull()
    restored.deductHumanBet(100)
    const second = restored.dealNewRound()
    // What the uninterrupted shoe holds next is what the restored one deals.
    const order = before.shoe.cards
    const dealtFirst = first.allDealtCards.length
    expect(during.shoe.dealIndex).toBe(before.shoe.dealIndex + dealtFirst)
    expect(during.shoe.cards).toEqual(order)
    expect(restored.snapshot().shoe.dealIndex).toBe(before.shoe.dealIndex + dealtFirst + second.allDealtCards.length)
    expect(second.allDealtCards).not.toEqual(first.allDealtCards)
  })

  it('gives the bet back and frees the hand number, and touches nothing else', () => {
    const live = new CasinoSessionEngine(quiet())
    live.deductHumanBet(150)
    live.dealNewRound()
    const raw = live.snapshot()
    const voided = voidOpenHand(raw, 150)

    expect(voided.humanBankroll).toBe(20000)
    expect(voided.currentHandNumber).toBe(0)
    expect(voided.handHistory).toHaveLength(0)
    // The shoe, the cards out of it and the count are the engine's own.
    expect(voided.shoe).toEqual(raw.shoe)
    expect(voided.cardsDealt).toBe(raw.cardsDealt)
    expect(voided.runningCount).toBe(raw.runningCount)
    expect(voided.peakBankroll).toBe(raw.peakBankroll)
    expect(voided.worstDrawdown).toBe(raw.worstDrawdown)
    // The input is not changed.
    expect(raw.humanBankroll).toBe(20000 - 150)
    expect(raw.currentHandNumber).toBe(1)
  })

  it('is a table the engine accepts and plays on from, hand numbers without a gap', () => {
    const live = new CasinoSessionEngine(quiet())
    live.deductHumanBet(25)
    live.dealNewRound()
    const restored = CasinoSessionEngine.restore(JSON.parse(JSON.stringify(voidOpenHand(live.snapshot(), 25))))!
    expect(restored.getHumanBankroll()).toBe(20000)
    expect(restored.getCardsDealt()).toBe(live.getCardsDealt())
    expect(restored.getRunningCount()).toBe(live.getRunningCount())
    restored.deductHumanBet(25)
    restored.dealNewRound()
    expect(restored.getCurrentHandNumber()).toBe(1)
  })

  it('still owes the shuffle when the cut card came out in that hand', () => {
    const live = new CasinoSessionEngine(config({ numBots: 5, multiHand: false, penetration: 0.65 }))
    let guard = 0
    let owed = false
    while (!live.reshuffleAfterRound() && guard++ < 200) {
      live.deductHumanBet(25)
      live.dealNewRound()
      const voided = voidOpenHand(live.snapshot(), 25)
      const restored = CasinoSessionEngine.restore(JSON.parse(JSON.stringify(voided)))!
      // Whatever the live table owes at the end of this round, the restored one owes too.
      const liveCopy = CasinoSessionEngine.restore(JSON.parse(JSON.stringify(live.snapshot())))!
      const due = liveCopy.reshuffleAfterRound()
      expect(restored.reshuffleAfterRound()).toBe(due)
      owed = owed || due
      live.returnHumanWager(25)
    }
    expect(guard).toBeLessThan(200)
    expect(owed).toBe(true)
  })
})

describe('salvaging a snapshot that cannot be restored', () => {
  const played = () => {
    const engine = new CasinoSessionEngine(config({ numBots: 1, multiHand: false }))
    engine.updateHumanBankroll(-75)
    return engine.snapshot()
  }

  it('reads the hands and the bankroll figures whatever the version and the shoe', () => {
    const snapshot = { ...played(), version: 0, shoe: { nothing: 'usable' } }
    expect(parseSnapshot(snapshot)).toBeNull()
    expect(parseSalvage(snapshot)).toMatchObject({
      version: 0, humanBankroll: 19925, peakBankroll: 20000, worstDrawdown: 75, handHistory: [],
    })
  })

  it('refuses when a figure a session result needs is missing or not a number', () => {
    for (const field of ['humanBankroll', 'peakBankroll', 'worstDrawdown'] as const) {
      expect(parseSalvage({ ...played(), [field]: undefined }), field).toBeNull()
      expect(parseSalvage({ ...played(), [field]: '5000' }), field).toBeNull()
    }
    expect(parseSalvage({ ...played(), handHistory: [{ handNumber: 1 }] })).toBeNull()
    expect(parseSalvage({ ...played(), config: {} })).toBeNull()
    expect(parseSalvage({ ...played(), version: 'one' })).toBeNull()
    expect(parseSalvage(null)).toBeNull()
  })

  it('hands back a copy', () => {
    const snapshot = played()
    const salvage = parseSalvage(snapshot)!
    salvage.config.minBet = 1
    expect(snapshot.config.minBet).toBe(25)
  })
})
