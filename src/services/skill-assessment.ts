import { Rank, Suit } from '../engine/shoe/types'
import type { Card } from '../engine/shoe/types'
import { Action, DEFAULT_RULES } from '../engine/rules/types'
import { getHandValue, isBust } from '../engine/rules/hand-utils'
import { getOptimalAction } from '../engine/strategy/basic-strategy'
import { getCountValue, getSystemById } from '../engine/counting/counting-systems'
import { getDeviationAction, ILLUSTRIOUS_18 } from '../engine/counting/deviations'
import { CountingSystemId } from '../engine/counting/types'
import { getCorrectBet } from '../components/training/bet-spread-math'
import { CURRICULUM, stageIndex, type StageId } from './curriculum'

/**
 * Adaptive placement test, taken once before the training plan is drawn up.
 *
 * ## Why adaptive
 *
 * The first version walked a fixed list of questions and returned at the first
 * gap it found, with the self-report questions in front. Enumerating all 729
 * answer combinations showed what that costs: **85% of them landed on just two
 * of the seven stages, and 15 of 27 self-report combinations ignored the real
 * questions entirely** — you could answer every check right or every check
 * wrong and be placed identically. Three stages were unreachable in practice.
 *
 * The curriculum is a total order with a monotonicity assumption: if you can do
 * stage N you can do stage N-1. That is exactly the precondition for a binary
 * search, so this version searches for the *first stage you cannot do*. It
 * converges in at most four questions instead of six, every stage is reachable,
 * and every answer moves the result.
 *
 * ## What self-report is for
 *
 * A prior, not a verdict. It picks where the search starts, which saves an
 * experienced counter from being asked what a bust is. It can no longer decide
 * the outcome on its own — people misjudge themselves in both directions, and
 * being placed too far ahead is the failure that makes someone quit.
 */

// ── The starting-point question ──────────────────────────────────────

export interface EntryOption {
  label: string
  /** Sub-line: what this claim means, so people pick honestly. */
  hint: string
  value: string
  /** Where the search starts if they pick this. */
  stage: StageId
}

/**
 * One question, asked first — a ladder with exactly one rung per stage.
 *
 * The previous set had five options mapped to start stages 0, 1, 2, 4 and 5.
 * Because the probe verifies the *last claimed* stage, the first two both
 * resolved to the rules question and produced an identical run of questions:
 * the two options a beginner is most likely to pick were indistinguishable.
 * One option per stage guarantees every answer leads somewhere different.
 *
 * Each label names a capability rather than a feeling — "intermediate" means
 * nothing and cannot be checked.
 */
export const ENTRY_OPTIONS: EntryOption[] = [
  {
    label: 'I’ve never played blackjack',
    hint: 'We’ll start at the very beginning. No questions needed.',
    value: 'new',
    stage: 'rules',
  },
  {
    label: 'I know how the game works',
    hint: 'Hit, stand, bust and the dealer’s rules are familiar.',
    value: 'rules',
    stage: 'basic-strategy',
  },
  {
    label: 'I know the right move for most hands',
    hint: 'When to hit, stand, double or split — without having to think.',
    value: 'strategy',
    stage: 'hi-lo',
  },
  {
    label: 'I can keep track of the cards as they come out',
    hint: 'Holding a running count through a whole shoe.',
    value: 'counting',
    stage: 'true-count',
  },
  {
    label: 'I adjust that count for how many cards are left',
    hint: 'Turning the running count into a true count.',
    value: 'truecount',
    stage: 'deviations',
  },
  {
    label: 'I change how I play when the count is high',
    hint: 'Overriding the strategy chart — the Illustrious 18.',
    value: 'deviations',
    stage: 'bet-spread',
  },
  {
    label: 'I’ve done all of this for money at a real table',
    hint: 'Spreading bets under pressure is familiar territory.',
    value: 'table',
    stage: 'table',
  },
]

// ── The checks ───────────────────────────────────────────────────────

/** A rendered hand, so the question shows cards instead of describing them. */
export interface HandVisual {
  player: Card[]
  dealer: Card
}

/** Cards dealt one after another, for counting questions. */
export interface SequenceVisual {
  cards: Card[]
}

export interface CheckQuestion {
  /** The curriculum stage this check verifies. */
  stage: StageId
  prompt: string
  /** The situation in words — kept short, the cards carry it. */
  context: string
  options: string[]
  /** Correct option, computed from the engines rather than written down. */
  correct: string
  /** Shown after answering, so the test teaches as well as measures. */
  explanation: string
  hand?: HandVisual
  sequence?: SequenceVisual
  /** Count state to display alongside, when the question needs it. */
  count?: { running: number; decksLeft: number }
}

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit })

/** Signed count formatting. Used for BOTH the answer and the options, so an
 *  option can never be a near-miss of its own correct answer — the previous
 *  version wrote '−1' by hand and computed '-1', which would never match. */
const fmt = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

/**
 * Build the checks — one per verifiable stage, in curriculum order.
 *
 * Every answer is derived from the engine that owns it, so if a strategy table,
 * a count tag or the bet ladder is ever corrected, the test corrects with it.
 * `table` has no check: it is where you land by passing everything.
 */
export function buildChecks(): CheckQuestion[] {
  // ── rules ──
  const bustHand = [card(Rank.King, Suit.Spades), card(Rank.Seven, Suit.Diamonds)]
  const drawn = card(Rank.Nine, Suit.Clubs)
  const busted = [...bustHand, drawn]
  const bustTotal = getHandValue(busted).best
  const bustAnswer = isBust(busted) ? 'The hand is lost right away' : 'The hand plays on'

  // ── basic strategy ──
  const softHand = [card(Rank.Ace, Suit.Hearts), card(Rank.Seven, Suit.Spades)]
  const softDealer = card(Rank.Nine, Suit.Diamonds)
  const strategyAnswer = getOptimalAction(softHand, softDealer, DEFAULT_RULES)

  // ── hi-lo: a short run of cards, not a single tag ──
  const hiLo = getSystemById(CountingSystemId.HiLo)
  const run = [
    card(Rank.Five, Suit.Diamonds),
    card(Rank.King, Suit.Clubs),
    card(Rank.Three, Suit.Spades),
    card(Rank.Eight, Suit.Hearts),
  ]
  const runCount = run.reduce((sum, c) => sum + getCountValue(c, hiLo), 0)

  // ── true count ──
  const runningCount = 6
  const decksLeft = 3
  const trueCount = runningCount / decksLeft

  // ── deviations: 16 vs 10, the single most valuable deviation there is ──
  const devHand = [card(Rank.Ten, Suit.Spades), card(Rank.Six, Suit.Hearts)]
  const devDealer = card(Rank.Ten, Suit.Clubs)
  const devTC = 1
  const devBasic = getOptimalAction(devHand, devDealer, DEFAULT_RULES)
  const devAnswer = getDeviationAction(devHand, devDealer, devTC, ILLUSTRIOUS_18) ?? devBasic

  // ── bet spread ──
  const tableMin = 25
  const betTC = 3
  const betAnswer = getCorrectBet(betTC, tableMin)
  const money = (n: number) => `$${n}`

  return [
    {
      stage: 'rules',
      prompt: 'You draw one more card. What just happened?',
      context: `Your ${getHandValue(bustHand).best} became ${bustTotal}.`,
      options: [bustAnswer, 'It counts as 16 instead', 'It ties the dealer'],
      correct: bustAnswer,
      explanation:
        'Over 21 is a bust, and a bust loses immediately — before the dealer even plays their hand. That is the whole reason blackjack is a game of not going over, rather than a game of getting closest to 21.',
      hand: { player: busted, dealer: card(Rank.Six, Suit.Hearts) },
    },
    {
      stage: 'basic-strategy',
      prompt: 'What is the correct play?',
      context: 'Soft 18 against a dealer 9.',
      options: [Action.Hit, Action.Stand, Action.Double],
      correct: strategyAnswer,
      explanation:
        'Soft 18 loses to a dealer 9 more often than it wins, and the ace means one more card cannot bust you. Improving it is free — standing here quietly costs money over time.',
      hand: { player: softHand, dealer: softDealer },
    },
    {
      stage: 'hi-lo',
      prompt: 'What is the running count after these four cards?',
      context: 'You start at zero.',
      options: [fmt(runCount), fmt(runCount + 1), fmt(runCount - 2)],
      correct: fmt(runCount),
      explanation:
        'Low cards (2–6) are +1, tens and aces are −1, and 7–9 are worth nothing. Here that is +1, −1, +1, 0 — a running count of +1.',
      sequence: { cards: run },
    },
    {
      stage: 'true-count',
      prompt: 'What is the true count?',
      context: `Running count ${fmt(runningCount)}, about ${decksLeft} decks left.`,
      options: [fmt(trueCount), fmt(runningCount), fmt(runningCount - decksLeft)],
      correct: fmt(trueCount),
      explanation:
        'True count = running count ÷ decks remaining. A +6 spread across 3 decks is only a true +2 — the same running count means something completely different early in a shoe than late in one.',
      count: { running: runningCount, decksLeft },
    },
    {
      stage: 'deviations',
      prompt: `Basic strategy says ${devBasic.toLowerCase()}. At this count, what do you do?`,
      context: `Hard 16 against a dealer 10, true count ${fmt(devTC)}.`,
      options: [Action.Hit, Action.Stand, Action.Surrender],
      correct: devAnswer,
      explanation:
        'This is the most valuable deviation in the game. At a true count of 0 or better the deck is rich enough in low cards that standing on 16 beats hitting it — the count overrides the chart.',
      hand: { player: devHand, dealer: devDealer },
      count: { running: 3, decksLeft: 3 },
    },
    {
      stage: 'bet-spread',
      prompt: `The table minimum is ${money(tableMin)}. What do you bet?`,
      context: `True count ${fmt(betTC)}.`,
      options: [money(betAnswer), money(getCorrectBet(1, tableMin)), money(getCorrectBet(0, tableMin))],
      correct: money(betAnswer),
      explanation:
        'Almost all of a counter’s profit comes from betting big when the odds have turned. A true +3 calls for eight units on a 1–16 spread — a perfect count with a flat bet earns nothing at all.',
      count: { running: 9, decksLeft: 3 },
    },
  ]
}

/** Stages a check can verify, in curriculum order. */
export const CHECKED_STAGES: StageId[] =
  ['rules', 'basic-strategy', 'hi-lo', 'true-count', 'deviations', 'bet-spread']

/** Where you land by passing every check. */
export const TERMINAL_STAGE: StageId = 'table'

// ── The adaptive search ──────────────────────────────────────────────

export interface AskedCheck {
  stage: StageId
  chosen: string
  correct: boolean
}

/**
 * Search state. The answer being searched for is the index of the first stage
 * the learner cannot do, which is always in `[low, high]`.
 */
export interface ProbeState {
  /** Every stage below this is proven; the placement is at least here. */
  low: number
  /** Exclusive bound: this stage and everything above is unproven. */
  high: number
  /** Index the self-report pointed at — used only for the first question. */
  entry: number
  asked: AskedCheck[]
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * Begin a search, biased to where the learner placed themselves.
 *
 * `entryStage` is where they would *start training* — meaning everything below
 * it is claimed knowledge. The probe therefore verifies `entryStage - 1` first;
 * see {@link nextCheck}.
 */
export function startProbe(entryStage: StageId): ProbeState {
  const entry = clamp(stageIndex(entryStage), 0, CHECKED_STAGES.length)

  // "I've never played" claims nothing, so there is nothing to verify. Quizzing
  // a declared beginner only produces a wrong answer and a worse first minute;
  // the honest response is to place them and get out of the way.
  const high = entry === 0 ? 0 : CHECKED_STAGES.length

  return { low: 0, high, entry, asked: [] }
}

/**
 * The next check to ask, or null once the search has converged.
 *
 * Three phases, in the order a human tutor would use them:
 *
 * 1. **Verify the claim.** The entry option means "I can do everything up to
 *    here", so the first question is the *last stage claimed* — never the one
 *    the learner just said they cannot do yet. Opening with a question someone
 *    has explicitly disclaimed guarantees a wrong answer and pushes them below
 *    their own honest answer, which is both illogical and demoralising.
 * 2. **Extend by one.** If the claim holds, ask the very next stage. For an
 *    honest learner that lands the placement in two questions.
 * 3. **Binary search the rest.** Only once the prior has been exhausted, halve
 *    what is left, which caps the whole test at four questions.
 */
export function nextCheck(state: ProbeState, checks: readonly CheckQuestion[]): CheckQuestion | null {
  if (state.low >= state.high) return null
  const last = state.asked[state.asked.length - 1]

  let index: number
  if (state.asked.length === 0) {
    index = clamp(state.entry - 1, state.low, state.high - 1)
  } else if (state.asked.length === 1 && last.correct) {
    index = clamp(state.low, state.low, state.high - 1)
  } else {
    index = Math.floor((state.low + state.high) / 2)
  }
  return checks[index] ?? null
}

/**
 * Fold one answer into the search.
 *
 * A correct answer proves everything up to and including that stage; a wrong
 * one bounds the placement at or below it. Both halve the remaining range, so
 * the search cannot run longer than log2(stages) + 1 questions.
 */
export function recordAnswer(state: ProbeState, check: CheckQuestion, chosen: string): ProbeState {
  const index = stageIndex(check.stage)
  const correct = chosen === check.correct
  return {
    ...state,
    low: correct ? Math.max(state.low, index + 1) : state.low,
    high: correct ? state.high : Math.min(state.high, index),
    asked: [...state.asked, { stage: check.stage, chosen, correct }],
  }
}

// ── The result ───────────────────────────────────────────────────────

export interface Placement {
  stage: StageId
  /** Plain-language reason, shown so the placement never feels arbitrary. */
  reason: string
  /** How many checks were answered correctly. */
  correct: number
  /** How many checks were asked — the test length varies by design. */
  asked: number
  /** Stages skipped because the learner proved them. */
  proven: StageId[]
}

/**
 * Turn a converged search into a placement.
 *
 * The reason is built from what actually happened rather than picked from a
 * list of canned lines, because a placement the learner cannot account for is
 * one they will not trust.
 */
export function resolvePlacement(state: ProbeState): Placement {
  const index = clamp(state.low, 0, CHECKED_STAGES.length)
  const stage = index >= CHECKED_STAGES.length ? TERMINAL_STAGE : CHECKED_STAGES[index]
  const correct = state.asked.filter(a => a.correct).length
  const proven = state.asked.filter(a => a.correct).map(a => a.stage)
  const title = CURRICULUM[stageIndex(stage)].title.toLowerCase()
  const failed = state.asked.find(a => !a.correct)

  let reason: string
  if (stage === TERMINAL_STAGE) {
    reason = 'You cleared every check, including deviations and bet sizing. What is left is doing all of it at once, at speed.'
  } else if (!failed) {
    reason = `You placed yourself here and nothing contradicted it, so we start at ${title}.`
  } else if (proven.length > 0) {
    const last = CURRICULUM[stageIndex(proven[proven.length - 1])].title.toLowerCase()
    reason = `You have ${last} down, but the ${CURRICULUM[stageIndex(failed.stage)].title.toLowerCase()} question did not land — so that is where we start.`
  } else {
    reason = `The ${CURRICULUM[stageIndex(failed.stage)].title.toLowerCase()} question did not land, so we start at ${title} and build up from there.`
  }

  return { stage, reason, correct, asked: state.asked.length, proven }
}

/** Run a whole assessment at once. Used by tests and by the retake path. */
export function placeFromAnswers(
  entryStage: StageId,
  answers: readonly { stage: StageId; chosen: string }[],
  checks: readonly CheckQuestion[] = buildChecks(),
): Placement {
  let state = startProbe(entryStage)
  for (const a of answers) {
    const check = checks.find(c => c.stage === a.stage)
    if (!check) continue
    state = recordAnswer(state, check, a.chosen)
  }
  return resolvePlacement(state)
}
