import type { CasinoSessionConfig } from '../../engine/casino-session/types'
import type { CountingSystemId } from '../../engine/counting/types'
import { DEFAULT_CONFIG } from './helpers'

/**
 * The table of the free trial.
 *
 * The real table, set up once and not adjustable: the setup screen is fifteen
 * decisions, and somebody with ten hands should spend them playing.
 *
 * What it is — the table Pro opens with by default: six decks, dealer stands
 * on soft 17, 3:2, two other players, $25 to $500, the review after every
 * hand. That last one is the product: a table that says what the right play
 * was.
 *
 * What it leaves out, and why:
 *
 * - **The count** (`playStyle: 'basic'`, no count checks, no deviation hints).
 *   A free account has the rules, basic strategy and the Hi-Lo drill; bet
 *   sizing and deviations are Pro stages. A counting table would quiz people
 *   on things the free tier never taught and hand them an F at the paywall —
 *   a number about the trial's setup, not about them. On basic strategy the
 *   grade is one they can earn.
 * - **Several hands, own rules, own bankroll, session targets.** They are the
 *   setup screen, and that stays Pro.
 * - **A target** (`sessionMode: 'unlimited'`). The trial's own count ends the
 *   table; a second limit would ask "cash out or keep playing?" in the middle
 *   of ten hands.
 */
export function trialTableConfig(countingSystem: CountingSystemId = DEFAULT_CONFIG.countingSystem): CasinoSessionConfig {
  return {
    ...DEFAULT_CONFIG,
    sessionMode: 'unlimited',
    numBots: 2,
    multiHand: false,
    playStyle: 'basic',
    trainingMode: true,
    countCheckFrequency: 'never',
    showDeviationHints: false,
    countingSystem,
    trial: true,
  }
}

/** The guest table's one bet, in play money: every hand, the same. */
export const GUEST_TABLE_BET = 100
/** What the guest table starts with, in play money. Ten bets, and room for a split doubled twice. */
export const GUEST_TABLE_BANKROLL = 1000

/**
 * The guest table: the landing's play section and `/try`, for a visitor
 * without an account.
 *
 * The trial table's rules (six decks, S17, 3:2, late surrender, double after
 * split, basic strategy graded) with three things taken away, each a decision
 * the visitor has not come to make:
 *
 * - **The other players** (`numBots: 0`). They make a table feel alive, and
 *   they make a stranger wait: a seated player thinks for two seconds before
 *   every card, and ten hands with two of them run a minute longer. On a phone
 *   they are also a second row of cards above the visitor's own. The empty
 *   circles on the felt still say "table".
 * - **The bet** (`minBet` = `maxBet` = `GUEST_TABLE_BET`). The first thing
 *   the real table asks is a chip; here the first thing is the first card.
 * - **The review step** (`trainingMode: false`). The guest table says what
 *   the right play was at the settlement itself, under the result on the
 *   felt, so a hand takes one press to leave instead of two.
 *
 * No ambience either: a page somebody is reading does not start a casino
 * crowd. The dealt cards and the chips make their usual sounds.
 */
export function guestTableConfig(): CasinoSessionConfig {
  return {
    ...trialTableConfig(),
    trial: false,
    numBots: 0,
    startingBankroll: GUEST_TABLE_BANKROLL,
    minBet: GUEST_TABLE_BET,
    maxBet: GUEST_TABLE_BET,
    trainingMode: false,
    casinoAmbience: false,
  }
}

/**
 * Whether a table is being played as the trial: it was dealt as one, and the
 * account still has no Pro. Somebody who subscribes in the middle of their
 * ten hands keeps the table and loses the limit.
 *
 * @param config - The table's settings
 * @param isPro - Whether the account has Pro
 */
export function isTrialTable(config: Pick<CasinoSessionConfig, 'trial'>, isPro: boolean): boolean {
  return config.trial === true && !isPro
}
