import { useEffect, useMemo, useState } from 'react'
import { BotSeat } from '../components/casino-session/SeatView'
import { buildSplitReplay, type ReplayStatus } from '../components/casino-session/split-replay'
import { playBotTurn } from '../engine/casino-session/bot-player'
import type { BotPlayer, BotTurnHandView, BotTurnStep } from '../engine/casino-session/types'
import { DEFAULT_RULES } from '../engine/rules/types'
import { Rank, Suit, type Card } from '../engine/shoe/types'

/**
 * Dev-only: a bot's re-split, replayed on the real seat, on demand.
 *
 * A re-split happens in a live session perhaps once in a few hundred hands, so
 * it cannot be checked by playing. This plays Darius' case from 8 Oct 2026 —
 * 8♥8♠ against a 6, the first hand catching the 8♦ — through the same engine
 * and the same replay the table uses. What to see: two hands slide apart, the
 * first is dealt the 8♦, *then* the third hand appears, and each hand is played
 * out before the next one gets its card.
 */
const c = (rank: Rank, suit: Suit = Suit.Hearts): Card => ({ rank, suit })
const DEALER_UP = c(Rank.Six, Suit.Clubs)
const DRAWS = [c(Rank.Eight, Suit.Diamonds), c(Rank.Four), c(Rank.Ten, Suit.Spades), c(Rank.Seven, Suit.Diamonds)]

function playCase(): { bot: BotPlayer; log: BotTurnStep[] } {
  const bot: BotPlayer = {
    id: 'bot-preview', name: 'Sam', seatIndex: 2, bankroll: 2000, currentBet: 20,
    hands: [{ cards: [c(Rank.Eight), c(Rank.Eight, Suit.Spades)], bet: 20, isDoubled: false, isSplit: false, isBusted: false, isStanding: false }],
    isActive: true, skillLevel: 'basic_strategy', bettingPattern: 'flat', flatBetAmount: 20,
  }
  const log: BotTurnStep[] = []
  let i = 0
  bot.hands = playBotTurn(bot, DEALER_UP, () => DRAWS[i++], { ...DEFAULT_RULES, surrenderAllowed: 'none', doubleAfterSplit: true, maxSplitHands: 4 }, log)
  bot.turnLog = log
  return { bot, log }
}

export function SplitPreview() {
  const { bot, log } = useMemo(() => playCase(), [])
  const [run, setRun] = useState(0)
  const [hands, setHands] = useState<BotTurnHandView[] | undefined>(undefined)
  const [active, setActive] = useState(-1)
  const [status, setStatus] = useState<ReplayStatus | 'wait'>('wait')

  useEffect(() => {
    if (run === 0) return
    const timers: number[] = []
    // Reset to the dealt pair, then play the frames on the table's own timings.
    timers.push(window.setTimeout(() => { setHands(undefined); setActive(-1); setStatus('thinking') }, 0))
    let at = 1200
    for (const f of buildSplitReplay(log, () => 1500)) {
      timers.push(window.setTimeout(() => {
        if (f.hands) setHands(f.hands)
        if (f.active !== undefined) setActive(f.active)
        if (f.status) setStatus(f.status)
      }, at))
      at += f.delayMs
    }
    timers.push(window.setTimeout(() => { setActive(-1); setHands(log.at(-1)!.hands) }, at))
    return () => timers.forEach(clearTimeout)
  }, [run, log])

  return (
    <div className="app-canvas min-h-screen p-10 text-content" data-testid="split-preview">
      <h1 className="text-2xl font-bold">Bot re-split, replayed</h1>
      <p className="mt-2 text-sm text-content/60 max-w-2xl">
        8♥ 8♠ against a dealer 6. Hand 1 is dealt the 8♦ and splits again. Then 8♥ + 4, 8♦ + 10, 8♠ + 7 —
        one hand at a time.
      </p>
      <button onClick={() => setRun(r => r + 1)} data-testid="split-preview-play"
        className="mt-4 px-5 py-2 rounded-lg font-semibold bg-gold text-on-gold cursor-pointer">
        {run === 0 ? 'Play' : 'Play again'}
      </button>
      <div className="mt-8 rounded-3xl p-12 grid place-items-center min-h-[320px]"
        style={{ background: 'radial-gradient(ellipse at 50% 35%, var(--color-felt), color-mix(in srgb, var(--color-felt) 62%, black))' }}>
        <BotSeat
          bot={bot}
          botStatus={status}
          botSettlement={undefined}
          visibleLimit={2}
          gameStep={run === 0 ? 'betting' : 'bot_playing'}
          isActivePlayer={run > 0 && active >= 0}
          isDimmed={false}
          activeSplitHand={active}
          splitHands={hands}
        />
      </div>
    </div>
  )
}
