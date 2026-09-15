import { Action } from '../rules/types'
import type { StrategyAction, StrategyTable } from './types'
import { S17_STRATEGY, H17_STRATEGY } from './basic-strategy-tables'
import { ILLUSTRIOUS_18, FAB_4 } from '../counting/deviations'

/**
 * Flashcard training levels.
 * - `basic`      — Basic Strategy only (no counting): what to do at every hand.
 * - `deviations` — Count-based deviations only (harder): given a True Count, deviate or not.
 * - `mixed`      — A blend of both.
 */
export type FlashLevel = 'basic' | 'deviations' | 'mixed'

/** A single flashcard question. */
export interface FlashQuestion {
  /** Whether the hand is a hard total, soft total, or pair. */
  handKind: 'hard' | 'soft' | 'pair'
  /** Display hand, e.g. "16", "A,7", "8,8", or "*" for Insurance. */
  hand: string
  /** Dealer upcard: "2".."10" or "A". */
  dealer: string
  /** True Count for deviation questions; `null` for basic-strategy questions. */
  trueCount: number | null
  /** The correct action to take. */
  correctAction: Action
  /** The plain Basic-Strategy action (what you'd do without counting). */
  basicAction: Action
  /** True when this is a count-based deviation question. */
  isDeviation: boolean
  /** Internal name of the deviation (not shown to the user; used only for keys). */
  deviationName?: string
}

const DEALERS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'] as const

/**
 * Meaningful Basic-Strategy hands to drill. Trivial always-hit (5–8) and
 * always-stand (18–21) hard totals are excluded so every question is a real decision.
 */
const HARD_HANDS = ['9', '10', '11', '12', '13', '14', '15', '16', '17']
const SOFT_HANDS = ['A,2', 'A,3', 'A,4', 'A,5', 'A,6', 'A,7', 'A,8', 'A,9']
const PAIR_HANDS = ['2,2', '3,3', '4,4', '5,5', '6,6', '7,7', '8,8', '9,9', '10,10', 'A,A']

const ALL_DEVIATIONS = [...ILLUSTRIOUS_18, ...FAB_4]

function rand(): number { return Math.random() }
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(rand() * arr.length)] }

/** Resolves a conditional strategy code to the primary flashcard action. */
export function resolveStrategyAction(a: StrategyAction): Action {
  switch (a) {
    case 'H': return Action.Hit
    case 'S': return Action.Stand
    case 'D':
    case 'Ds': return Action.Double
    case 'P': return Action.Split
    case 'Rh':
    case 'Rs': return Action.Surrender
  }
}

/** Classifies a hand string as hard total, soft total, or pair. */
export function handKindOf(hand: string): 'hard' | 'soft' | 'pair' {
  if (hand.includes(',')) {
    const [a, b] = hand.split(',')
    return a === b ? 'pair' : 'soft'
  }
  return 'hard'
}

/** Looks up the Basic-Strategy action for a hand vs a dealer upcard. */
export function lookupBasicAction(hand: string, dealer: string, table: StrategyTable): Action {
  const kind = handKindOf(hand)
  const sub = kind === 'pair' ? table.pairs : kind === 'soft' ? table.softTotals : table.hardTotals
  const raw = sub[hand]?.[dealer]
  return raw ? resolveStrategyAction(raw) : Action.Hit
}

/** Which actions are offered as buttons for a given question. */
export function enabledActions(q: FlashQuestion): Record<Action, boolean> {
  const isPair = q.handKind === 'pair'
  const dealerAce = q.dealer === 'A'
  return {
    [Action.Hit]: true,
    [Action.Stand]: true,
    [Action.Double]: true,
    [Action.Split]: isPair,
    [Action.Surrender]: true,
    [Action.Insurance]: dealerAce,
  }
}

function makeBasicQuestion(table: StrategyTable): FlashQuestion {
  const kind = pick(['hard', 'soft', 'pair'] as const)
  const hand = kind === 'hard' ? pick(HARD_HANDS) : kind === 'soft' ? pick(SOFT_HANDS) : pick(PAIR_HANDS)
  const dealer = pick(DEALERS)
  const action = lookupBasicAction(hand, dealer, table)
  return { handKind: kind, hand, dealer, trueCount: null, correctAction: action, basicAction: action, isDeviation: false }
}

/** The deviation with this display name, if there is one. */
function deviationByName(name: string): (typeof ALL_DEVIATIONS)[number] | undefined {
  return ALL_DEVIATIONS.find(d => d.name === name)
}

/**
 * Which of these names are deviations the flashcards can drill.
 *
 * The Analytics panel hands over the names it ranked; they came from earlier
 * sessions, so a name from a deviation that has since been renamed or removed
 * is possible and is simply dropped rather than failing the whole request.
 *
 * @param names - Deviation names as recorded in a session's `perDeviation`
 * @returns The subset that can be drilled, in the order given, without duplicates
 */
export function drillableDeviationNames(names: readonly string[]): string[] {
  return Array.from(new Set(names.filter(n => deviationByName(n) !== undefined)))
}

function makeDeviationQuestion(table: StrategyTable, dev = pick(ALL_DEVIATIONS)): FlashQuestion {
  const above = rand() < 0.5
  const tc = above
    ? dev.trueCountThreshold + Math.floor(rand() * 5)
    : dev.trueCountThreshold - 1 - Math.floor(rand() * 4)
  const correct = tc >= dev.trueCountThreshold ? dev.actionAbove : dev.actionBelow

  const isInsurance = dev.playerHand === '*'
  const hand = dev.playerHand
  const basic = isInsurance ? Action.Hit : lookupBasicAction(dev.playerHand, dev.dealerUpcard, table)

  return {
    handKind: isInsurance ? 'hard' : handKindOf(hand),
    hand,
    dealer: dev.dealerUpcard,
    trueCount: tc,
    correctAction: correct,
    basicAction: basic,
    isDeviation: true,
    deviationName: dev.name,
  }
}

/** A stable key used to avoid two identical questions in a row. */
function questionKey(q: FlashQuestion): string {
  return `${q.hand}|${q.dealer}|${q.trueCount ?? 'b'}`
}

/**
 * Builds a finite flashcard session of the given length with no two identical
 * questions in a row.
 *
 * @param level - basic / deviations / mixed
 * @param count - number of questions
 * @param dealerHitsSoft17 - use the H17 strategy table when true
 */
export function buildFlashSession(level: FlashLevel, count: number, dealerHitsSoft17 = false): FlashQuestion[] {
  const table = dealerHitsSoft17 ? H17_STRATEGY : S17_STRATEGY
  const questions: FlashQuestion[] = []
  let prevKey = ''
  let guard = 0

  while (questions.length < count && guard < count * 50) {
    guard++
    const useDeviation = level === 'deviations' ? true : level === 'basic' ? false : rand() < 0.4
    const q = useDeviation ? makeDeviationQuestion(table) : makeBasicQuestion(table)
    const key = questionKey(q)
    if (key === prevKey) continue
    questions.push(q)
    prevKey = key
  }
  return questions
}

/**
 * Builds a session drilling only the named deviations.
 *
 * This is what "Drill these hands" on the Analytics page starts. The button
 * used to open the ordinary flashcards, which drew from every hand at random —
 * so a person who came to fix their 16 vs 10 saw it perhaps once in twenty
 * questions. Here every question is one of the named hands, with the count
 * sometimes above and sometimes below the index, and the hands take turns in
 * a shuffled cycle so a session of 20 over 5 hands asks each of them 4 times
 * rather than leaving one to chance.
 *
 * Names that are not drillable are ignored (see `drillableDeviationNames`). If
 * none remain, the session is empty and the caller should fall back to the
 * ordinary drill rather than start a session with nothing in it.
 *
 * @param names - Deviation names to drill, e.g. `['16 vs 10', 'Insurance']`
 * @param count - Number of questions
 * @param dealerHitsSoft17 - Use the H17 strategy table when true
 */
export function buildFocusFlashSession(names: readonly string[], count: number, dealerHitsSoft17 = false): FlashQuestion[] {
  const table = dealerHitsSoft17 ? H17_STRATEGY : S17_STRATEGY
  const devs = drillableDeviationNames(names).map(n => deviationByName(n)!)
  if (devs.length === 0) return []

  const questions: FlashQuestion[] = []
  let cycle: typeof devs = []
  let prevKey = ''
  let guard = 0

  while (questions.length < count && guard < count * 50) {
    guard++
    if (cycle.length === 0) cycle = shuffled(devs)
    const q = makeDeviationQuestion(table, cycle[cycle.length - 1])
    const key = questionKey(q)
    // With a single hand every question shares hand and dealer; only the count
    // can differ, and the retry below is what makes it differ.
    if (key === prevKey) continue
    cycle.pop()
    questions.push(q)
    prevKey = key
  }
  return questions
}

/** A shuffled copy (Fisher–Yates). */
function shuffled<T>(arr: readonly T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
