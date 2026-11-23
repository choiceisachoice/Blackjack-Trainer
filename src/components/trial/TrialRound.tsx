import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import { useGameLoop, type TableHouse } from '../casino-session/useGameLoop'
import { CasinoTable } from '../casino-session/CasinoTable'
import { ActionButtons, InsurancePrompt } from '../casino-session/ActionButtons'
import { turnOptions, useAutoStand } from '../casino-session/table-turn'
import { guestTableConfig } from '../casino-session/trial-table'
import { ACTION_KEY } from '../training/deviation-utils'
import { Action } from '../../engine/rules/types'
import type { CasinoSessionResult } from '../../engine/casino-session/types'
import { soundEngine } from '../../services/sound-engine'
import { GUEST_ROUND_HANDS } from '../../services/guest-trial'
import { usePlanPriceStore } from '../../store/plan-price-store'
import { TrialIntro } from './TrialIntro'
import { TrialStage } from './TrialStage'
import { TrialSummary } from './TrialSummary'
import { verdictOf, type HandVerdict, type SettledHand } from './trial-verdict'

/** What a page tells the trial round it hosts. */
export interface TrialRoundProps {
  /** Deal the first hand at once instead of showing the intro — the visitor already asked for it. */
  autoStart?: boolean
  /**
   * Called when a round's first hand is dealt — the first round and every
   * "play another round". The page's own business: bringing the table into
   * view (after the summary, which on a phone is taller than the table, the
   * visitor may be standing below it).
   */
  onStart?: () => void
}

/**
 * The trial round: ten hands at a casino table, without an account.
 *
 * One component for every place the round is offered — `/try` and the
 * landing's play section — so a visitor plays the same thing in both. It is
 * the casino table itself (the same felt, cards, chips, deal and sounds, the
 * same game loop and engine), seated for a guest: one player, one fixed bet,
 * basic strategy graded (`guestTableConfig`). After every hand it says
 * whether the hand was played by basic strategy, and if not, what was right;
 * after the tenth, what the round came to and what to do next.
 *
 * ## Whose round it is
 *
 * Nobody's. The guest table records nothing: no session, no XP, no saved
 * table (`bjt_casino_live`), no account trial hand, no request — the game
 * loop runs as a guest house (`TableHouse.guest`), without a recorder and
 * without a live id. A visitor who signs up afterwards starts clean, and the
 * summary does not say otherwise. The only rule that remains for the host
 * page is that a signed-in visitor does not get the round at all: `/try`
 * redirects, the landing leaves the section out.
 */
export function TrialRound({ autoStart = false, onStart }: TrialRoundProps) {
  // Which round this is; 0 is the intro. A new round is a new table.
  const [round, setRound] = useState(autoStart ? 1 : 0)
  // The page's callback is read when a hand is dealt, not when the round was
  // set up: a new function on every render of the page must not start anything.
  const onStartRef = useRef(onStart)
  useEffect(() => { onStartRef.current = onStart })
  // Once per table, also under React's development double-mount.
  const announced = useRef(false)
  useEffect(() => {
    if (!autoStart || announced.current) return
    announced.current = true
    onStartRef.current?.()
  }, [autoStart])
  // The price the summary names, asked for while the hands are played.
  useEffect(() => { if (round > 0) void usePlanPriceStore.getState().load() }, [round])

  const begin = useCallback(() => {
    soundEngine.prime()
    setRound(1)
    onStartRef.current?.()
  }, [])
  const again = useCallback(() => {
    soundEngine.prime()
    setRound(r => r + 1)
    onStartRef.current?.()
  }, [])

  if (round === 0) return <TrialIntro onStart={begin} />
  return <GuestTable key={round} onAgain={again} />
}

/**
 * One round of ten hands: the game loop, the table it draws, and the
 * verdict after each hand. Remounted for another round, so every round is a
 * fresh shoe and a fresh bankroll.
 */
function GuestTable({ onAgain }: { onAgain: () => void }) {
  const { t } = useTranslation()
  const [config] = useState(guestTableConfig)
  const [settled, setSettled] = useState<SettledHand[]>([])
  const [result, setResult] = useState<CasinoSessionResult | null>(null)
  /** Hands settled so far, for the house's question between hands. */
  const settledCount = useRef(0)
  const [house] = useState<TableHouse>(() => ({
    guest: true,
    onHandSettled: (record, hands) => {
      settledCount.current += 1
      // A copy: the loop's arrays are replaced, never edited, but the summary
      // must not depend on that.
      const lying = hands.map(h => [...h])
      setSettled(s => [...s, { record, hands: lying }])
    },
    isClosed: () => settledCount.current >= GUEST_ROUND_HANDS,
  }))

  const {
    state, actions, seatLayout, cardsRemaining, cardsDealt, discardCount, totalCards, bankroll, handNum, initSession,
  } = useGameLoop(config, null, setResult, undefined, house)

  /*
    The visitor asked for a hand: deal it as soon as the table waits for a
    bet. There is no bet to place — the chips go down with the first card —
    so "betting" is only the moment between two hands. Armed on mount (the
    first hand was asked for by the click that opened the table) and by
    "Next hand"; set again with the table, because React's development
    double-mount starts a second table on the same component.
  */
  const wantDeal = useRef(true)
  useEffect(() => {
    initSession()
    wantDeal.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount, like the casino table
  }, [])
  useEffect(() => {
    if (state.gameStep !== 'betting' || result || !wantDeal.current) return
    wantDeal.current = false
    actions.confirmBet()
  }, [state.gameStep, result, actions])

  useAutoStand(state, actions.handleAction)

  const last = settled.at(-1)
  const finalHand = settled.length >= GUEST_ROUND_HANDS || bankroll < config.minBet
  const next = useCallback(() => {
    // A click, so the next hand's sounds are heard on a phone too.
    soundEngine.prime()
    wantDeal.current = true
    actions.nextHand()
  }, [actions])

  /*
    The keys the casino table answers to — while the table is on screen. This
    is a page people read and scroll: a key pressed far below it, or Space to
    scroll, must not play a hand. So no Space either, and Enter only where no
    button has the focus (a focused button answers Enter itself).
  */
  const frame = useRef<HTMLDivElement>(null)
  const step = state.gameStep
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target instanceof HTMLElement ? e.target : null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      const box = frame.current?.getBoundingClientRect()
      if (!box || box.bottom < 0 || box.top > window.innerHeight) return
      const key = e.key.toLowerCase()
      if (step === 'human_playing') {
        const action = ({ h: Action.Hit, s: Action.Stand, d: Action.Double, p: Action.Split, r: Action.Surrender } as Record<string, Action>)[key]
        if (action) actions.handleAction(action)
      } else if (step === 'insurance') {
        if (key === 'y') actions.handleInsurance(true)
        else if (key === 'n') actions.handleInsurance(false)
      } else if (step === 'settlement' && e.key === 'Enter') {
        if (target?.closest('button, a')) return
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, actions, next])

  if (result) return <TrialSummary round={settled} onAgain={onAgain} />

  let controls: ReactNode = null
  if (step === 'insurance') {
    controls = <InsurancePrompt hand={null} onAnswer={actions.handleInsurance} />
  } else if (step === 'human_playing') {
    controls = <ActionButtons onAction={actions.handleAction} {...turnOptions(state, config, bankroll)} />
  } else if (step === 'settlement' && last) {
    controls = (
      <div className="flex flex-col items-center gap-2.5 text-center" data-testid="try-verdict-block">
        <Verdict verdict={verdictOf(last)} />
        <button
          type="button"
          onClick={next}
          data-testid="next-hand"
          className="px-6 py-2 rounded-xl font-bold cursor-pointer bg-gold text-on-gold hover:bg-gold/90"
        >
          {finalHand ? t('try.table.toResult') : withoutKeyHintOnTouch(t('casino.hud.nextHand'))}
        </button>
      </div>
    )
  }

  return (
    <TrialStage
      frameRef={frame}
      status={t('try.table.hand',{ n: Math.min(GUEST_ROUND_HANDS, Math.max(1, handNum)), total: GUEST_ROUND_HANDS })}
      felt={(
        <CasinoTable
          dealerPrompt={null}
          dealerCards={state.dealerCards}
          dealerHoleRevealed={state.dealerHoleRevealed}
          gameStep={state.gameStep}
          isDealPhase={state.gameStep === 'dealing'}
          seatLayout={seatLayout}
          humanHands={state.humanHands}
          humanHandInfo={state.humanHandInfo}
          boxes={state.boxes}
          surrenderedHands={state.surrenderedHands}
          humanBoxSettlements={state.humanBoxSettlements}
          humanVisibleCards={state.humanVisibleCards}
          activeHandIndex={state.activeHandIndex}
          currentBet={state.currentBet}
          boxBets={state.boxBets}
          insuranceBox={state.insuranceBox}
          boxSeats={state.boxSeats}
          handDoubled={state.handDoubled}
          isSurrendered={state.isSurrendered}
          humanSettlement={state.humanSettlement}
          activeBotId={state.activeBotId}
          botStatuses={state.botStatuses}
          botResults={state.botResults}
          botVisibleCards={state.botVisibleCards}
          botActiveSplitHands={state.botActiveSplitHands}
          botSplitHands={state.botSplitHands}
          bankroll={bankroll}
          cardsRemaining={cardsRemaining}
          cardsDealt={cardsDealt}
          discardCount={discardCount}
          totalCards={totalCards}
          penetration={config.penetration}
          blackjackPays={config.blackjackPays}
          dealerHitsSoft17={config.dealerHitsSoft17}
        />
      )}
      controls={controls}
    />
  )
}

/** "Next Hand (Enter)" on a keyboard; on a touch screen there is no Enter to name. */
function withoutKeyHintOnTouch(label: string): string {
  const touch = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  return touch ? label.replace(/\s*\([^)]*\)\s*$/, '') : label
}

/**
 * The verdict on the hand just settled, in one calm line: the right play, or
 * the spot and what was right there. The colour is in the mark, not in the
 * sentence — a hand that lost money was not necessarily played wrong, and
 * one played wrong is a lesson, not an alarm.
 */
function Verdict({ verdict }: { verdict: HandVerdict }) {
  const { t } = useTranslation()
  let mark: ReactNode = null
  let text: string
  if (verdict.kind === 'right') {
    mark = <Check size={16} className="text-success shrink-0" aria-hidden />
    text = t('try.table.right')
  } else if (verdict.kind === 'none') {
    text = t(verdict.reason === 'blackjack' ? 'try.table.noneBlackjack' : verdict.reason === 'dealerBlackjack' ? 'try.table.noneDealer' : 'try.table.none')
  } else {
    mark = <X size={16} className="text-error shrink-0" aria-hidden />
    const miss = verdict.first
    text = miss.kind === 'insurance'
      ? t('try.table.wrongInsurance')
      : t('try.table.wrong', { spot: t('try.end.hand', { hand: miss.hand, dealer: miss.dealer }), action: t(ACTION_KEY[miss.correct]) })
  }
  return (
    <p
      className="flex items-start justify-center gap-1.5 text-sm text-content/85 leading-snug max-w-[46ch]"
      role="status"
      data-testid="try-verdict"
      data-verdict={verdict.kind}
    >
      {mark && <span className="mt-0.5">{mark}</span>}
      <span>{text}</span>
    </p>
  )
}
