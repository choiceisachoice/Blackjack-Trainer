import { useEffect } from 'react'
import { getHandValue, isBust, isPair } from '../../engine/rules/hand-utils'
import { Action } from '../../engine/rules/types'
import type { CasinoSessionConfig } from '../../engine/casino-session/types'
import type { VisibleState } from './useGameLoop'

/** The part of the table's state a turn is decided from. */
type TurnState = Pick<VisibleState,
  'gameStep' | 'humanHands' | 'humanHandInfo' | 'activeHandIndex' | 'currentBet' | 'surrenderedHands' | 'handDoubled'>

/** The table rules a turn depends on. */
type TurnRules = Pick<CasinoSessionConfig, 'maxSplitHands' | 'doubleAfterSplit' | 'surrenderAllowed'>

/** Which of the five buttons the hand in play offers — `ActionButtons`' props, by name. */
export interface TurnOptions {
  canHit: boolean
  canStand: boolean
  canDouble: boolean
  canSplit: boolean
  canSurrender: boolean
  humanBusted: boolean
}

/**
 * What the player may do with the hand in play.
 *
 * The buttons mirror the rules `handleAction` enforces, and these lines were
 * the casino table's own until a second table needed them (the guest table,
 * `components/trial`): two copies of "a split ace takes one card" is how a
 * button comes to offer a move the game then refuses.
 *
 * The rules follow the hand in play, not how many the player holds: a second
 * box is an ordinary hand; one out of a split is not. A doubled hand is done,
 * and a split ace takes one card — its only choice is a second ace (split
 * again, or stand).
 *
 * @param state - The table as the game loop shows it
 * @param rules - The table's split, double and surrender rules
 * @param bankroll - What the player has left to put on a double or a split
 */
export function turnOptions(state: TurnState, rules: TurnRules, bankroll: number): TurnOptions {
  const cards = state.humanHands[state.activeHandIndex] ?? []
  const first = cards.length === 2
  const info = state.humanHandInfo[state.activeHandIndex] ?? { box: 0, split: false }
  const handsInBox = state.humanHandInfo.filter(h => h.box === info.box).length
  const done = state.handDoubled.has(state.activeHandIndex)
  const splitAce = info.split && cards[0]?.rank === 'A'
  const aceReSplitOffer = splitAce && cards.length === 2 && cards[1].rank === 'A'
  return {
    canHit: !splitAce && !done,
    canStand: !done && (!splitAce || aceReSplitOffer),
    canDouble: first && bankroll >= state.currentBet && (!info.split || rules.doubleAfterSplit) && !splitAce && !done,
    canSplit: first && isPair(cards) && handsInBox < rules.maxSplitHands && bankroll >= state.currentBet,
    canSurrender: first && rules.surrenderAllowed && !info.split && !state.surrenderedHands.has(state.activeHandIndex),
    humanBusted: cards.length > 0 && isBust(cards),
  }
}

/**
 * Stand a hand that has reached 21, half a second after it did — only a hand
 * that would otherwise wait for a click.
 *
 * A doubled hand already moves on by itself, and split aces are dealt and
 * stood by their own sequence; standing those a second time used to move on
 * twice, dealing the next hand twice or playing the bots and the dealer
 * again. The stand is not graded (`handleAction` knows a 21 is not a
 * decision).
 *
 * @param state - The table as the game loop shows it
 * @param handleAction - The game loop's action
 */
export function useAutoStand(state: TurnState, handleAction: (action: Action) => void): void {
  const { gameStep, humanHands, humanHandInfo, activeHandIndex, handDoubled } = state
  useEffect(() => {
    if (gameStep !== 'human_playing') return
    const cards = humanHands[activeHandIndex] ?? []
    if (cards.length < 2) return
    if (isBust(cards)) return
    if (handDoubled.has(activeHandIndex)) return
    if ((humanHandInfo[activeHandIndex]?.split ?? false) && cards[0].rank === 'A') return
    if (getHandValue(cards).best === 21) {
      const t = setTimeout(() => handleAction(Action.Stand), 500)
      return () => clearTimeout(t)
    }
  }, [gameStep, humanHands, humanHandInfo, activeHandIndex, handDoubled, handleAction])
}
