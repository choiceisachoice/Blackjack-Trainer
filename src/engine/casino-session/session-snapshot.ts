import { Shoe } from '../shoe/shoe'
import { Rank, Suit } from '../shoe/types'
import type { Card, ShoeSnapshot } from '../shoe/types'
import { getSystemById } from '../counting/counting-systems'
import type { BotHand, BotPlayer, CasinoSessionConfig, PlayerHandRecord } from './types'

/**
 * A casino table as plain data.
 *
 * The table lives in memory: a closed tab, a dead phone or a reload used to
 * take the shoe, the bankroll and every hand played with it. This is the whole
 * engine written down, so the same table can be put back.
 *
 * The version is part of the data on purpose. A snapshot outlives the build
 * that wrote it, and a table restored from a shape this code does not know is
 * worse than no table: `parseSnapshot` refuses anything but the current
 * version rather than guess.
 *
 * Refusing is not deleting. What a build cannot *play* it may still be able
 * to *count*: the finished hands and the bankroll figures are enough to write
 * the session down (`parseSalvage`), and a push to main must not cost anyone
 * the hands they had played when it went out.
 */
export const CASINO_SNAPSHOT_VERSION = 1

/** Seats at the table; the engine's own constant, repeated for the checks here. */
const SEATS = 6

/** Everything a `CasinoSessionEngine` holds, JSON-serialisable. */
export interface CasinoSessionSnapshot {
  /** `CASINO_SNAPSHOT_VERSION` at the time of writing. */
  version: number
  /** The table's rules and limits. */
  config: CasinoSessionConfig
  /** The shoe: card order, deal index, cut card. */
  shoe: ShoeSnapshot
  /** The six seats: a bot with its bankroll, character and last hands, or null. */
  seats: (BotPlayer | null)[]
  /** Bot names taken, so a new player sitting down never repeats one. */
  usedBotNames: string[]
  /** The running count over every card seen. */
  runningCount: number
  /** Cards out of the shoe. */
  cardsDealt: number
  /** Every hand the player has finished. */
  handHistory: PlayerHandRecord[]
  /** The number of the last hand dealt. */
  currentHandNumber: number
  /** The seats the player's hands lie on. */
  humanBoxSeats: number[]
  /** The player's bankroll. */
  humanBankroll: number
  /** The highest the bankroll has stood. */
  peakBankroll: number
  /** The deepest fall from a peak. */
  worstDrawdown: number
}

const RANKS = new Set<string>(Object.values(Rank))
const SUITS = new Set<string>(Object.values(Suit))
const SESSION_MODES = new Set(['hands', 'time', 'unlimited'])
const COUNT_CHECKS = new Set(['every', 'every5', 'every10', 'never'])
const PLAY_STYLES = new Set(['counting', 'basic'])
const SKILLS = new Set(['basic_strategy', 'timid', 'gambler', 'never_bust'])
const BET_PATTERNS = new Set(['flat', 'minimum', 'press'])
const RESULTS = new Set(['win', 'loss', 'push', 'blackjack', 'surrender'])

type Fields = Record<string, unknown>

const isObject = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isInt = (v: unknown, min: number, max: number): v is number =>
  isNumber(v) && Number.isInteger(v) && v >= min && v <= max
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isString = (v: unknown): v is string => typeof v === 'string'

function isCard(v: unknown): v is Card {
  return isObject(v) && isString(v.rank) && RANKS.has(v.rank) && isString(v.suit) && SUITS.has(v.suit)
}

function isCards(v: unknown): v is Card[] {
  return Array.isArray(v) && v.every(isCard)
}

function isConfig(v: unknown): v is CasinoSessionConfig {
  if (!isObject(v)) return false
  if (!isString(v.sessionMode) || !SESSION_MODES.has(v.sessionMode)) return false
  if (!isNumber(v.targetHands) || !isNumber(v.targetMinutes)) return false
  if (!isInt(v.numBots, 0, SEATS - 1) || !isInt(v.playerSeatIndex, 0, SEATS - 1)) return false
  if (v.multiHand !== undefined && !isBool(v.multiHand)) return false
  if (!isNumber(v.minBet) || v.minBet <= 0) return false
  if (!isNumber(v.maxBet) || v.maxBet < v.minBet) return false
  if (!isNumber(v.startingBankroll) || v.startingBankroll <= 0) return false
  if (!isInt(v.numDecks, 1, 8)) return false
  if (!isBool(v.dealerHitsSoft17) || !isBool(v.doubleAfterSplit) || !isBool(v.surrenderAllowed)) return false
  if (!isNumber(v.blackjackPays) || v.blackjackPays <= 0) return false
  if (!isNumber(v.penetration) || !isInt(v.maxSplitHands, 1, 8)) return false
  if (v.playStyle !== undefined && !(isString(v.playStyle) && PLAY_STYLES.has(v.playStyle))) return false
  if (!isBool(v.trainingMode) || !isBool(v.showDeviationHints) || !isBool(v.casinoAmbience)) return false
  if (!isString(v.countCheckFrequency) || !COUNT_CHECKS.has(v.countCheckFrequency)) return false
  if (v.trial !== undefined && !isBool(v.trial)) return false
  if (!isString(v.countingSystem)) return false
  // An id this build does not know: the engine could not count with it.
  getSystemById(v.countingSystem as CasinoSessionConfig['countingSystem'])
  return true
}

function isBotHand(v: unknown): v is BotHand {
  return isObject(v) && isCards(v.cards) && isNumber(v.bet)
    && isBool(v.isDoubled) && isBool(v.isSplit) && isBool(v.isBusted) && isBool(v.isStanding)
}

function isBot(v: unknown, seat: number): v is BotPlayer {
  return isObject(v) && isString(v.id) && isString(v.name) && v.seatIndex === seat
    && isNumber(v.bankroll) && isNumber(v.currentBet) && isNumber(v.flatBetAmount) && isBool(v.isActive)
    && isString(v.skillLevel) && SKILLS.has(v.skillLevel)
    && isString(v.bettingPattern) && BET_PATTERNS.has(v.bettingPattern)
    && Array.isArray(v.hands) && v.hands.every(isBotHand)
}

function isHandRecord(v: unknown): v is PlayerHandRecord {
  return isObject(v) && isNumber(v.handNumber) && isNumber(v.playerBet) && isNumber(v.correctBet)
    && isNumber(v.betError) && isBool(v.betCorrect) && isBool(v.countChecked)
    && isBool(v.wasDeviationSituation) && isBool(v.insuranceOffered)
    && isNumber(v.profit) && isNumber(v.bankrollAfter)
    && isString(v.result) && RESULTS.has(v.result)
    && isCards(v.playerCards) && isCards(v.dealerFinalCards)
    && Array.isArray(v.decisions) && v.decisions.every(d => isObject(d) && isBool(d.isCorrect) && isString(d.action))
    && Array.isArray(v.botResults)
}

/**
 * Reads a snapshot back out of storage.
 *
 * Everything is checked, because nothing about the input is known: it may have
 * been written by an older build, cut short by a full disk, or edited by hand.
 * A snapshot that passes is safe to build an engine from; one that does not is
 * refused whole — a table restored half right would deal from a shoe that does
 * not match its count.
 *
 * @param raw - Whatever came out of `JSON.parse`
 * @returns A deep copy of the snapshot (the input is never kept), or null
 */
export function parseSnapshot(raw: unknown): CasinoSessionSnapshot | null {
  try {
    if (!isObject(raw) || raw.version !== CASINO_SNAPSHOT_VERSION) return null
    if (!isConfig(raw.config)) return null
    const config = raw.config
    if (Shoe.restore(config, raw.shoe) === null) return null

    const size = config.numDecks * 52
    if (!isInt(raw.cardsDealt, 0, size) || !isNumber(raw.runningCount)) return null
    if (!isInt(raw.currentHandNumber, 0, Number.MAX_SAFE_INTEGER)) return null
    if (!isNumber(raw.humanBankroll) || !isNumber(raw.peakBankroll) || !isNumber(raw.worstDrawdown)) return null

    const seats = raw.seats
    if (!Array.isArray(seats) || seats.length !== SEATS) return null
    if (!seats.every((seat, i) => seat === null || isBot(seat, i))) return null
    // The player's own seat is theirs, and their hands lie on free seats only.
    if (seats[config.playerSeatIndex] !== null) return null
    const boxes = raw.humanBoxSeats
    if (!Array.isArray(boxes) || boxes.length === 0 || new Set(boxes).size !== boxes.length) return null
    if (!boxes.every(seat => isInt(seat, 0, SEATS - 1) && seats[seat] === null)) return null

    if (!Array.isArray(raw.usedBotNames) || !raw.usedBotNames.every(isString)) return null
    if (!Array.isArray(raw.handHistory) || !raw.handHistory.every(isHandRecord)) return null

    // Through JSON once more: the caller gets its own copy, and anything that
    // is not data (a prototype, an accessor) does not survive the trip.
    return JSON.parse(JSON.stringify({
      version: CASINO_SNAPSHOT_VERSION,
      config,
      shoe: raw.shoe,
      seats,
      usedBotNames: raw.usedBotNames,
      runningCount: raw.runningCount,
      cardsDealt: raw.cardsDealt,
      handHistory: raw.handHistory,
      currentHandNumber: raw.currentHandNumber,
      humanBoxSeats: boxes,
      humanBankroll: raw.humanBankroll,
      peakBankroll: raw.peakBankroll,
      worstDrawdown: raw.worstDrawdown,
    })) as CasinoSessionSnapshot
  } catch {
    // Never throws: an unknown counting system, a getter that explodes — all
    // of it is "not a snapshot".
    return null
  }
}

/**
 * A snapshot taken with a hand on the felt, turned into the table as it stands
 * if that hand is called off.
 *
 * The rule for a hand the page died in: **the bet goes back, the cards do
 * not.** The shoe, the cards dealt and the count stay exactly as the engine
 * had them — every card that left the shoe is burned, so the same hand can
 * never be dealt a second time. The main bets (with every double and split)
 * return to the bankroll, and the hand's number is given back, because no hand
 * was recorded under it: the next deal takes it again and the history has no
 * gap. An insurance bet already settled stays settled.
 *
 * The result is a table the engine can really be in at the betting step: the
 * bots have lost what they staked on the hand, which is how a round they all
 * stood and lost on leaves them, and the shuffle a passed cut card owes is
 * still owed by the shoe itself.
 *
 * @param snapshot - `CasinoSessionEngine.snapshot()`, taken between the deal and the settlement
 * @param openWager - What the player has on the felt: bets, doubles and splits
 * @returns A new snapshot; the input is not changed
 */
export function voidOpenHand(snapshot: CasinoSessionSnapshot, openWager: number): CasinoSessionSnapshot {
  return {
    ...snapshot,
    humanBankroll: snapshot.humanBankroll + Math.max(0, openWager),
    currentHandNumber: Math.max(0, snapshot.currentHandNumber - 1),
  }
}

/** What is left of a table this build cannot put back: enough to write the session down. */
export interface SnapshotSalvage {
  /** The version the snapshot was written with. */
  version: number
  config: CasinoSessionConfig
  handHistory: PlayerHandRecord[]
  humanBankroll: number
  peakBankroll: number
  worstDrawdown: number
}

/**
 * Reads the finished hands and the bankroll figures out of a snapshot that
 * `parseSnapshot` refuses — another version, a shoe that does not add up.
 *
 * Nothing is filled in. Every figure a session result is made of has to be
 * there and be what it should be; if one is missing there is no salvage, and
 * the caller leaves the record where it is.
 *
 * @param raw - Whatever came out of `JSON.parse`
 * @returns A deep copy of what could be read, or null
 */
export function parseSalvage(raw: unknown): SnapshotSalvage | null {
  try {
    if (!isObject(raw) || !isInt(raw.version, 0, Number.MAX_SAFE_INTEGER)) return null
    if (!isConfig(raw.config)) return null
    if (!Array.isArray(raw.handHistory) || !raw.handHistory.every(isHandRecord)) return null
    if (!isNumber(raw.humanBankroll) || !isNumber(raw.peakBankroll) || !isNumber(raw.worstDrawdown)) return null
    return JSON.parse(JSON.stringify({
      version: raw.version,
      config: raw.config,
      handHistory: raw.handHistory,
      humanBankroll: raw.humanBankroll,
      peakBankroll: raw.peakBankroll,
      worstDrawdown: raw.worstDrawdown,
    })) as SnapshotSalvage
  } catch {
    return null
  }
}
