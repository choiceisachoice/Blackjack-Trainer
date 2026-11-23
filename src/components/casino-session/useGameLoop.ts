import { useState, useCallback, useRef, useMemo, useEffect } from 'react'

/** How a hand can end, as the settlement reports it. */
export type HandOutcome = 'blackjack' | 'win' | 'loss' | 'push' | 'surrender'

const OUTCOMES: readonly HandOutcome[] = ['blackjack', 'win', 'loss', 'push', 'surrender']

/**
 * Narrow the engine's loosely-typed result string.
 *
 * `surrender` is the fallback for the same reason the old ternary chain ended
 * there: it is the only outcome that is not one of the four the engine names
 * explicitly, so anything unrecognised was already being shown as a surrender.
 */
function asOutcome(result: string): HandOutcome {
  return (OUTCOMES as readonly string[]).includes(result)
    ? (result as HandOutcome)
    : 'surrender'
}
import { soundEngine } from '../../services/sound-engine'
import { useAppStore, DEALING_SPEED_MULTIPLIER } from '../../store/app-store'
import { CasinoSessionEngine, canReSplitAces } from '../../engine/casino-session/session-engine'
import { getHandValue, isBlackjack, isBust, isPair } from '../../engine/rules/hand-utils'
import { Action } from '../../engine/rules/types'
import { formatCard } from '../../services/session-recorder'
import type { Card } from '../../engine/shoe/types'
import type {
  CasinoSessionConfig,
  CasinoSessionResult,
  PlayerHandRecord,
  BotPlayer,
  BotRoundResult,
  BotTurnHandView,
  DealResult,
} from '../../engine/casino-session/types'
import type { SessionRecorder } from '../../services/session-recorder'
import type { GameStep, BotStatus, HandInfo } from './helpers'
import { isNaturalBlackjack, visibleForBox } from './helpers'
import { MAX_PLAYER_HANDS } from '../../engine/casino-session/types'
import { buildSplitReplay } from './split-replay'
import { sessionLimitReached, type SessionLimit } from './session-limit'
import { useStepAnimation, type AnimStep } from './useStepAnimation'
import { clearLiveSession, isRecorded, saveLiveSession, type SavedLiveSession } from '../../services/casino-live-session'
import { getLocalOwner } from '../../services/storage/local-owner'
import { voidOpenHand } from '../../engine/casino-session/session-snapshot'
import { useLiveSessionStore } from '../../store/live-session-store'
import { useAuthStore, isSupabaseConfigured } from '../../store/auth-store'
import { recordCasinoSession, registerOpenTable } from './record-session'

/**
 * The table as it is kept on the device: the id it is saved and recorded
 * under, and — when the player picked a saved table up again — the copy to
 * continue from.
 */
export interface LiveTable {
  id: string
  resume: SavedLiveSession | null
}

/**
 * What the house adds to a table from outside the game: the free trial counts
 * its hands and closes the table when they are used up. The game loop knows
 * nothing of trials — it reports a settled hand and asks whether it may deal
 * another.
 */
export interface TableHouse {
  /**
   * A hand was settled — called once per hand, at the moment it is recorded.
   *
   * @param hand - The hand's record, as the review after it reads it
   * @param hands - The player's hands as they lie on the table at the
   *   settlement — one, or several after a split (the record holds the first)
   */
  onHandSettled?: (hand: PlayerHandRecord, hands: Card[][]) => void
  /**
   * Asked when the player leaves a finished hand: true ends the session
   * there, the way an empty bankroll does. Never asked in the middle of a hand.
   */
  isClosed?: () => boolean
  /**
   * A table that belongs to no account: the landing's and `/try`'s guest
   * table. Read once, when the table opens.
   *
   * The other two ways out of the recording are the caller's already — no
   * `recorder`, no `live` id (so nothing is saved to `bjt_casino_live`), an
   * `onSessionEnd` that writes nothing. What only the loop can switch off is
   * its own reach for the statistics: it announces the open table to the
   * sign-out (`registerOpenTable`), which then records it, and its unmount
   * hands an unfinished session to `onSessionEnd`. A guest table does
   * neither. It ends when it is closed, and what was played on it is gone.
   */
  guest?: boolean
}

/** Seats at the table. */
const TABLE_SEATS = 6

// ─── Visible State ───────────────────────────────────

export interface VisibleState {
  gameStep: GameStep
  isPaused: boolean
  elapsedSeconds: number

  humanHands: Card[][]
  /**
   * For each of `humanHands`: the box it belongs to and whether a split made
   * it. The player may take several hands (boxes) a round; a split adds hands
   * to one box. Same order and length as `humanHands`.
   */
  humanHandInfo: HandInfo[]
  /** How many hands the player takes: chosen while betting, held for the round. */
  boxes: number
  /** Hands the player surrendered this round, by index into `humanHands`. */
  surrenderedHands: Set<number>
  /** How each box ended and what it paid; empty until the round is settled. */
  humanBoxSettlements: { result: HandOutcome; profit: number }[]
  activeHandIndex: number
  dealerCards: Card[]
  dealerHoleRevealed: boolean
  seats: (BotPlayer | null)[]
  botResults: BotRoundResult[]
  botStatuses: Record<string, BotStatus>
  activeBotId: string | null
  botVisibleCards: Record<string, number>
  humanVisibleCards: number

  /**
   * The bet in focus: while betting, the selected hand's (the first hand's
   * when all are selected); during play, the bet of the hand being played.
   */
  currentBet: number
  /** The bet on each of the player's hands, by box. Same length as `boxes`. */
  boxBets: number[]
  /** The seat each of the player's hands lies on, left to right. Same length as `boxes`. */
  boxSeats: number[]
  /** Seats no bot sits in: where the player's hands are or could be. */
  freeSeats: number[]
  /**
   * The hand the chips go on while betting, or null for all of them at once.
   * A click on a hand at the table selects it; a second click lets go.
   */
  selectedBox: number | null
  /** The hand insurance is being offered on, or -1 when it is not. */
  insuranceBox: number
  /**
   * How the player's own hand ended, and what it paid.
   *
   * The **result**, not a label. It used to carry the finished English string
   * ("Blackjack!", "Win", …) and `SeatView` decided its styling by comparing
   * against `'Blackjack!'` — so the text was simultaneously the display and
   * the condition, and translating it would have silently taken the gold
   * blackjack treatment with it.
   */
  humanSettlement: { result: HandOutcome; profit: number } | null

  showInsurance: boolean
  isSurrendered: boolean
  handDoubled: Set<number>

  rcInput: string
  tcInput: string
  countFeedback: { rcCorrect: boolean; tcCorrect: boolean; actualRC: number; actualTC: number } | null

  handReview: PlayerHandRecord | null
  showReshuffle: boolean
  botActiveSplitHands: Record<string, number>
  /** Per bot, the split hands as they lie on the table right now (see split-replay). */
  botSplitHands: Record<string, BotTurnHandView[]>
  /**
   * The target the player set has been reached (see session-limit). During a
   * hand that only shows a notice; before the next bet it asks: cash out or
   * keep playing.
   */
  limitReached: SessionLimit
  /**
   * This table was cashed out in another tab. It is over here too: nothing
   * more is dealt, saved or recorded, and the only thing on offer is the way
   * back to the menu.
   */
  closedElsewhere: boolean
}

// ─── Game Actions ────────────────────────────────────

export interface GameActions {
  confirmBet: () => void
  /** `timedOut`: the decision clock ran out and the table stands for the player. */
  handleAction: (action: Action, timedOut?: boolean) => void
  handleInsurance: (take: boolean) => void
  submitCount: () => void
  nextHand: () => void
  setBet: (bet: number) => void
  /** Take this many hands from the next round on (1–3, as far as the bankroll reaches). */
  setBoxes: (boxes: number) => void
  /** Put the chips on this hand only; the same hand again, or null, is all hands. */
  selectBox: (box: number | null) => void
  /** Take this hand off the table for the next round (never the last one). */
  closeBox: (box: number) => void
  /** Open a hand on this free seat for the next round. */
  openBoxAt: (seat: number) => void
  setRcInput: (v: string) => void
  setTcInput: (v: string) => void
  setPaused: (v: boolean) => void
  /** End the session and show the result: the cash-out, from the HUD, the pause panel or the end prompt. */
  quitSession: () => void
  /** Drop the session without recording it — for "start fresh". */
  discardSession: () => void
  /** Play on past the reached target; no target applies for the rest of the session. */
  keepPlaying: () => void
}

// ─── Seat Layout ─────────────────────────────────────

interface SeatLayoutEntry {
  type: 'bot' | 'human'
  bot?: BotPlayer
  seatIndex: number
}

// ─── Hook ────────────────────────────────────────────

/** A base delay scaled by the live dealing-speed setting (slow/normal/fast). */
function scaledDelay(ms: number): number {
  return ms * DEALING_SPEED_MULTIPLIER[useAppStore.getState().dealingSpeed]
}

export function useGameLoop(
  config: CasinoSessionConfig,
  recorder: SessionRecorder | null,
  onSessionEnd: (result: CasinoSessionResult) => void,
  live?: LiveTable,
  house?: TableHouse,
) {
  const engineRef = useRef<CasinoSessionEngine | null>(null)
  /** The house's callbacks as of the last render, for the callbacks below that outlive one. */
  const houseRef = useRef<TableHouse | undefined>(house)
  useEffect(() => { houseRef.current = house }, [house])
  /** A guest table (see `TableHouse.guest`), decided when the table opens. */
  const [guest] = useState(() => house?.guest === true)
  /** The player chose to play on past the target — mirrored for `persist`. */
  const keptPlayingRef = useRef(false)
  /**
   * How many hands the table held when this component took it over: none for
   * a new session, the saved ones for a table that was picked up again. See
   * the unmount cleanup for what it decides.
   */
  const handsAtStartRef = useRef(0)
  const startTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** True once the session has been recorded, so it can never be recorded twice. */
  const endedRef = useRef(false)
  /**
   * Whose local data this table writes into: the owner on the device when the
   * table opened. See `stillOurs`.
   */
  const ownerRef = useRef<string | null>(null)
  /** The bets of the round just played, by box, offered again for the next one. */
  const lastBetsRef = useRef<number[]>([])
  /**
   * What is on the table and not yet decided: the bet, plus every double and
   * split since. Zero between hands. It is what a session that ends mid-hand
   * has to hand back — see `closeOpenHand`.
   */
  const openWagerRef = useRef(0)
  /** Each box's insurance result this round, for the box's total. Empty when none was offered. */
  const insuranceNetsRef = useRef<number[]>([])
  /** The answers given so far while insurance is asked hand by hand. */
  const insuranceTakenRef = useRef<boolean[]>([])
  const insuranceBoxRef = useRef(-1)
  /** All pending gameplay timeouts, cleared together on unmount. */
  const pendingTimeouts = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  /** Pause bookkeeping so the session clock excludes paused time. */
  const isPausedRef = useRef(false)
  const pauseStartRef = useRef(0)
  const dealResultRef = useRef<DealResult | null>(null)
  const handRecordRef = useRef<Partial<PlayerHandRecord> & { _built?: unknown }>({})
  const decisionsRef = useRef<{ action: string; correctAction: string; isCorrect: boolean; cardReceived?: Card; handValueAfter: number; handIndex?: number }[]>([])

  // Shadow refs for stale closure avoidance
  const boxBetsRef = useRef<number[]>([0])
  const boxSeatsRef = useRef<number[]>([config.playerSeatIndex])
  /**
   * The last seat whose bot has played this round. Play goes round the table
   * seat by seat: before one of the player's hands is played, the bots sitting
   * before it are, and whatever sits after the last hand plays before the
   * dealer. -1 when nobody has.
   */
  const botsPlayedToRef = useRef(-1)
  const selectedBoxRef = useRef<number | null>(null)
  const humanHandsRef = useRef<Card[][]>([[]])
  const handDoubledRef = useRef<Set<number>>(new Set())
  const handInfoRef = useRef<HandInfo[]>([{ box: 0, split: false }])
  const surrenderedRef = useRef<Set<number>>(new Set())
  const boxesRef = useRef(1)
  const prevDealerCardCount = useRef(0)

  // Step animation
  const animation = useStepAnimation()

  /**
   * setTimeout that registers itself so the unmount cleanup can cancel it.
   * Every gameplay delay goes through this — a stray timeout firing against a
   * dead component would draw cards / setState after the session is gone.
   */
  const schedule = useCallback((fn: () => void, ms: number): void => {
    const id = setTimeout(() => {
      pendingTimeouts.current.delete(id)
      fn()
    }, ms)
    pendingTimeouts.current.add(id)
  }, [])

  // ─── State ─────────────────────────────────────────

  const [gameStep, setGameStep] = useState<GameStep>('betting')
  const [isPaused, setIsPaused] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  /** The player chose to play on past the target: no target for the rest of the session. */
  const [keptPlaying, setKeptPlaying] = useState(false)
  /** The table was cashed out in another tab (see `persist`). */
  const [closedElsewhere, setClosedElsewhere] = useState(false)

  const [humanHands, setHumanHands] = useState<Card[][]>([[]])
  const [activeHandIndex, setActiveHandIndex] = useState(0)
  /**
   * The hand in play, readable from a scheduled callback. Moving on from a hand
   * is scheduled (after a bust, after a double) and also triggered by the
   * auto-stand at 21; reading the index from a render's closure let both fire
   * for the same hand, so the next hand was dealt twice and — on the last hand —
   * the bots and the dealer were played a second time, their cards appearing
   * all at once. Every move goes through `setActive` so this stays true.
   */
  const activeHandRef = useRef(0)
  /** Hands already moved on from this round: a second move from one is a duplicate. */
  const advancedFromRef = useRef<Set<number>>(new Set())
  /** The bots after the player and the dealer play once per round, never twice. */
  const postHumanRanRef = useRef(false)
  const setActive = useCallback((i: number) => {
    activeHandRef.current = i
    setActiveHandIndex(i)
  }, [])
  const [dealerCards, setDealerCards] = useState<Card[]>([])
  const [dealerHoleRevealed, setDealerHoleRevealed] = useState(false)
  const [seats, setSeats] = useState<(BotPlayer | null)[]>([])
  const [botResults, setBotResults] = useState<BotRoundResult[]>([])
  const [botStatuses, setBotStatuses] = useState<Record<string, BotStatus>>({})
  const [activeBotId, setActiveBotId] = useState<string | null>(null)
  const [botVisibleCards, setBotVisibleCards] = useState<Record<string, number>>({})
  const [humanVisibleCards, setHumanVisibleCards] = useState(999)

  const [boxBets, setBoxBetsState] = useState<number[]>([0])
  const [boxSeats, setBoxSeatsState] = useState<number[]>([config.playerSeatIndex])
  const [selectedBox, setSelectedBoxState] = useState<number | null>(null)
  const [insuranceBox, setInsuranceBoxState] = useState(-1)
  /** The bets and the ref the game logic reads them from, always together. */
  const applyBets = useCallback((bets: number[]) => {
    boxBetsRef.current = bets
    setBoxBetsState(bets)
  }, [])
  /** The seats of the player's hands: ref, state, the count and the engine, always together. */
  const applySeats = useCallback((seats: number[]) => {
    boxSeatsRef.current = seats
    setBoxSeatsState(seats)
    boxesRef.current = seats.length
    setBoxesState(seats.length)
    engineRef.current?.setHumanBoxSeats(seats)
  }, [])
  const applySelected = useCallback((box: number | null) => {
    selectedBoxRef.current = box
    setSelectedBoxState(box)
  }, [])
  const applyInsuranceBox = useCallback((box: number) => {
    insuranceBoxRef.current = box
    setInsuranceBoxState(box)
  }, [])
  /** The opening bet of the box a hand belongs to: what a double or a split costs. */
  const betOfHand = useCallback((idx: number): number =>
    boxBetsRef.current[handInfoRef.current[idx]?.box ?? 0] ?? 0, [])
  const [humanSettlement, setHumanSettlement] = useState<{ result: HandOutcome; profit: number } | null>(null)

  const [showInsurance, setShowInsurance] = useState(false)
  const [surrenderedHands, setSurrenderedHands] = useState<Set<number>>(new Set())
  const [handDoubled, setHandDoubled] = useState<Set<number>>(new Set())
  const [handInfo, setHandInfo] = useState<HandInfo[]>([{ box: 0, split: false }])
  const [boxes, setBoxesState] = useState(1)
  const [boxSettlements, setBoxSettlements] = useState<{ result: HandOutcome; profit: number }[]>([])

  const [rcInput, setRcInput] = useState('')
  const [tcInput, setTcInput] = useState('')
  const [countFeedback, setCountFeedback] = useState<{ rcCorrect: boolean; tcCorrect: boolean; actualRC: number; actualTC: number } | null>(null)

  const [handReview, setHandReview] = useState<PlayerHandRecord | null>(null)
  const [showReshuffle, setShowReshuffle] = useState(false)
  // Cards physically in the discard tray. Unlike cardsDealt (which leaves the
  // shoe in real time), this only grows when a round is collected at settlement.
  const [discardCount, setDiscardCount] = useState(0)
  const [botActiveSplitHands, setBotActiveSplitHands] = useState<Record<string, number>>({})
  const [botSplitHands, setBotSplitHands] = useState<Record<string, BotTurnHandView[]>>({})

  // ─── Derived ───────────────────────────────────────

  const seatLayout = useMemo((): SeatLayoutEntry[] => {
    const layout: SeatLayoutEntry[] = []
    const activeBots = seats.filter((s): s is BotPlayer => s !== null && s.isActive)
    for (const bot of activeBots) {
      layout.push({ type: 'bot', bot, seatIndex: bot.seatIndex })
    }
    layout.push({ type: 'human', seatIndex: config.playerSeatIndex })
    layout.sort((a, b) => a.seatIndex - b.seatIndex)
    return layout
  }, [seats, config.playerSeatIndex])

  /**
   * `gameStep` and `elapsedSeconds` are triggers, not inputs.
   *
   * The body reads `engineRef.current`, which the linter cannot follow, so it
   * reports both as unnecessary. Removing them would freeze the shoe indicator
   * on its first value for the rest of the session — the rule is wrong here in
   * a way that breaks the feature rather than merely tidying it.
   */
  const shoeProgress = useMemo(() => {
    const engine = engineRef.current
    if (!engine) return 0
    return engine.getCardsDealt() / engine.getTotalCards()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- triggers for a ref read, not inputs
  }, [gameStep, elapsedSeconds])

  const totalCards = config.numDecks * 52

  // Cards still in the shoe = total − discarded − cards currently REVEALED on
  // the table. Driving the shoe off revealed (not engine-drawn) cards makes it
  // shrink in step with the deal animation instead of dropping all at once.
  const cardsRemaining = useMemo(() => {
    let revealed = 0
    humanHands.forEach((h, i) => {
      revealed += humanVisibleCards >= 999 ? h.length : Math.min(h.length, visibleForBox(humanVisibleCards, i, humanHands.length))
    })
    for (const seat of seats) {
      if (!seat || !seat.isActive) continue
      const sv = botSplitHands[seat.id]
      if (seat.hands.length > 1 && sv) {
        for (const h of sv) revealed += h.cards.length
      } else if (seat.hands.length > 1) {
        // Split by the engine, replay not started: the pair is what lies there.
        revealed += 2
      } else {
        const lim = botVisibleCards[seat.id]
        const count = seat.hands[0]?.cards.length ?? 0
        revealed += lim !== undefined ? Math.min(count, lim) : count
      }
    }
    revealed += dealerCards.length
    return Math.max(0, totalCards - discardCount - revealed)
  }, [humanHands, humanVisibleCards, seats, botVisibleCards, botSplitHands, dealerCards, discardCount, totalCards])

  const cardsDealt = useMemo(() => {
    const engine = engineRef.current
    if (!engine) return 0
    return engine.getCardsDealt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStep, elapsedSeconds, humanHands, dealerCards])

  // ─── Helpers ───────────────────────────────────────

  const resetRoundState = useCallback(() => {
    animation.clear()
    setHumanHands([[]])
    setActive(0)
    advancedFromRef.current = new Set()
    postHumanRanRef.current = false
    setDealerCards([])
    setDealerHoleRevealed(false)
    setBotResults([])
    setShowInsurance(false)
    setSurrenderedHands(new Set())
    surrenderedRef.current = new Set()
    setHandInfo([{ box: 0, split: false }])
    handInfoRef.current = [{ box: 0, split: false }]
    setBoxSettlements([])
    setHandDoubled(new Set())
    setCountFeedback(null)
    setHandReview(null)
    setHumanSettlement(null)
    setShowReshuffle(false)
    setBotVisibleCards({})
    setHumanVisibleCards(999)
    setActiveBotId(null)
    setBotActiveSplitHands({})
    setBotSplitHands({})
    // The last bet stays on the spot, as chips do at a table. It used to go
    // back to $0, with the Deal button disabled until a chip was clicked —
    // under a label that read "Deal $25". Flat betting cost two clicks a
    // hand, and nothing on screen said why the button was dead. Whatever the
    // bankroll and the table limits no longer allow is cleared instead.
    const engineNow = engineRef.current
    // Several hands are several bets: fewer hands, if the bankroll no longer
    // covers the minimum on each.
    const funds = engineNow ? engineNow.getHumanBankroll() : 0
    let hands = boxesRef.current
    while (hands > 1 && Math.floor(funds / hands) < config.minBet) hands--
    if (hands !== boxesRef.current) applySeats(boxSeatsRef.current.slice(0, hands))
    else engineNow?.setHumanBoxSeats(boxSeatsRef.current)
    // Each hand keeps its own bet. If together they are more than is left,
    // what is left is shared out evenly.
    const last = lastBetsRef.current
    let nextBets = Array.from({ length: hands }, (_, i) => {
      const carried = Math.min(last[i] ?? last[0] ?? 0, config.maxBet)
      return carried >= config.minBet ? carried : 0
    })
    if (nextBets.reduce((a, b) => a + b, 0) > funds) {
      const each = Math.min(config.maxBet, Math.floor(funds / hands))
      nextBets = nextBets.map(() => (each >= config.minBet ? each : 0))
    }
    applyBets(nextBets)
    // Chips go on every hand unless the hands carry different bets — then on
    // the hand that was selected, so the amount shown is that hand's.
    const even = nextBets.every(b => b === nextBets[0])
    applySelected(even ? null : Math.min(selectedBoxRef.current ?? 0, hands - 1))
    applyInsuranceBox(-1)
    insuranceTakenRef.current = []
    humanHandsRef.current = [[]]
    handDoubledRef.current = new Set()
    setRcInput('')
    setTcInput('')
    handRecordRef.current = {}
    decisionsRef.current = []
    dealResultRef.current = null
    // Reset bot statuses to 'wait'
    const engine = engineRef.current
    if (engine) {
      const newStatuses: Record<string, BotStatus> = {}
      for (const seat of engine.getSeats()) {
        if (seat) newStatuses[seat.id] = 'wait'
      }
      setBotStatuses(newStatuses)
    }
  }, [animation, setActive, config.maxBet, config.minBet, applyBets, applySelected, applyInsuranceBox, applySeats])

  const updateHandCards = useCallback((idx: number, newCards: Card[]) => {
    setHumanHands(prev => {
      const updated = [...prev]
      updated[idx] = newCards
      humanHandsRef.current = updated
      return updated
    })
  }, [])

  // ─── Session Lifecycle ─────────────────────────────

  const liveId = live?.id
  const resume = live?.resume ?? null

  /**
   * Whether this device's data still belongs to whoever sat down here.
   *
   * The belt under the sign-out's own work (`registerOpenTable` below). A
   * sign-out wipes the device and only then unmounts the table; anything the
   * table wrote after that — the saved copy, the session, XP — landed in
   * storage with no owner and was handed to the next account to sign in.
   * Two signs that the wipe has happened, either is enough: the owner record
   * is gone or is someone else's, or nobody is signed in.
   *
   * An owner that appears where there was none is the first sign-in adopting
   * guest data, not a change of hands. And without Supabase there are no
   * accounts at all (the offline build, the tests): the auth status is then
   * permanently "signed out" and says nothing.
   */
  const stillOurs = useCallback((): boolean => {
    const owner = getLocalOwner()
    if (ownerRef.current === null && owner !== null) ownerRef.current = owner
    if (owner !== ownerRef.current) return false
    return !isSupabaseConfigured || useAuthStore.getState().status === 'signedIn'
  }, [])

  /**
   * Write the table to the device, so a closed tab, a reload or a dead phone
   * does not take the session with it.
   *
   * Called when the session starts, after every settled hand (at the
   * settlement, after the count check that belongs to it, and back at the
   * betting step) — and during a hand, every time cards have left the shoe:
   * after the deal, after each card the player draws, after the bots and the
   * dealer have drawn theirs.
   *
   * The rule for a hand that was in progress when the page died: it is NOT
   * replayed, **its bet is returned and its cards are burned.** The copy
   * written during a hand is the table as it stands if the hand is called off
   * (`voidOpenHand`): the shoe, the cards dealt and the count as they are now,
   * the bets back in the bankroll, the hand's number free again. So the table
   * comes back at the betting step of the next hand, and the next deal comes
   * from further down the shoe.
   *
   * It used to be written only between hands. The copy then predated the
   * deal, and a reload put the cards back: look at a losing hand, reload,
   * "Continue", and the identical hand was dealt again — to be played
   * differently, or reloaded away until it won.
   *
   * What this does not do: a hand that is reloaded away is still a hand
   * without a result. Forfeiting the bet instead would close that, and would
   * also take the money of everyone whose phone died on a blackjack.
   *
   * The count in a copy written mid-hand includes every card the engine has
   * drawn, also one the animation had not shown yet when the page died.
   *
   * A table that turns out to have been cashed out in another tab stops here:
   * see `closedElsewhere`.
   */
  const persist = useCallback(() => {
    const engine = engineRef.current
    if (!engine || !liveId || endedRef.current || !stillOurs()) return
    const now = Date.now()
    const open = openWagerRef.current
    const snapshot = engine.snapshot()
    const saved = saveLiveSession({
      id: liveId,
      snapshot: open > 0 ? voidOpenHand(snapshot, open) : snapshot,
      config,
      // Frozen at the start of a pause, like the clock on screen.
      elapsedSeconds: Math.max(0, Math.floor(((pauseStartRef.current || now) - startTimeRef.current) / 1000)),
      savedAt: now,
      ui: { lastBets: lastBetsRef.current, keptPlaying: keptPlayingRef.current },
    })
    /*
      Refused because the session is already recorded: another tab cashed this
      table out. Playing on would end in a summary of hands that are written
      down nowhere — the row exists and a second one is refused. So the table
      stops, says why, and offers the menu. (A write refused for any other
      reason — a full quota — costs nothing and the table plays on.)
    */
    if (!saved && isRecorded(liveId)) {
      endedRef.current = true
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      pendingTimeouts.current.forEach(clearTimeout)
      pendingTimeouts.current.clear()
      animation.clear()
      setClosedElsewhere(true)
    }
  }, [liveId, config, stillOurs, animation])

  const initSession = useCallback(() => {
    // A table that was picked up again is put back exactly as it was saved;
    // if the copy cannot be read after all, a new table is better than none.
    const restored = resume ? CasinoSessionEngine.restore(resume.snapshot, recorder ?? undefined) : null
    const engine = restored ?? new CasinoSessionEngine(config, recorder ?? undefined)
    engineRef.current = engine
    ownerRef.current = getLocalOwner()
    handsAtStartRef.current = engine.getHandHistory().length
    // The session clock goes on from where it was saved.
    const elapsed = restored && resume ? resume.elapsedSeconds : 0
    startTimeRef.current = Date.now() - elapsed * 1000
    setElapsedSeconds(elapsed)
    setGameStep('betting')
    const kept = restored && resume ? resume.ui.keptPlaying : false
    keptPlayingRef.current = kept
    setKeptPlaying(kept)
    if (restored && resume) {
      // The betting screen as it was: the player's hands on their seats and
      // the last bets on the spots. Set before `resetRoundState`, which reads
      // both.
      lastBetsRef.current = resume.ui.lastBets
      const boxSeats = engine.getHumanBoxSeats()
      boxSeatsRef.current = boxSeats
      setBoxSeatsState(boxSeats)
      boxesRef.current = boxSeats.length
      setBoxesState(boxSeats.length)
      // Saved at the settlement, before the table went back to betting: the
      // shuffle that belongs to the end of that round has not happened yet.
      // (Saved after it, this finds nothing to shuffle.)
      if (engine.reshuffleAfterRound()) {
        setDiscardCount(0)
        setShowReshuffle(true)
        schedule(() => setShowReshuffle(false), 1800)
      } else {
        // Every card out of the shoe is in the tray: nothing is on the felt.
        setDiscardCount(engine.getCardsDealt())
      }
    } else {
      lastBetsRef.current = []
      setDiscardCount(0)
    }
    setSeats(engine.getSeats())
    setBotStatuses({})
    resetRoundState()
    persist()

    // Start timer. While paused the clock is frozen (the pause effect below
    // shifts startTime forward on resume so paused time never counts).
    isPausedRef.current = false
    pauseStartRef.current = 0
    timerRef.current = setInterval(() => {
      if (isPausedRef.current) return
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
  }, [config, recorder, resetRoundState, resume, persist, schedule])

  // Keep the session clock honest across pauses: freeze it on pause, and on
  // resume push startTime forward by the paused duration so a time-limited
  // session can't expire while the player is paused.
  useEffect(() => {
    isPausedRef.current = isPaused
    if (isPaused) {
      pauseStartRef.current = Date.now()
    } else if (pauseStartRef.current) {
      startTimeRef.current += Date.now() - pauseStartRef.current
      pauseStartRef.current = 0
    }
  }, [isPaused])

  const endSession = useCallback(() => {
    const engine = engineRef.current
    if (!engine || endedRef.current) return // idempotent: a double-quit records once
    endedRef.current = true
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    closeOpenHand(engine)
    const sessionResult = engine.calculateSessionResult(startTimeRef.current, sessionEndTime())
    onSessionEnd(sessionResult)
  }, [onSessionEnd])

  /**
   * Give back the bets of a hand that will never be settled.
   *
   * Cash out in the status bar is disabled mid-hand for exactly this reason,
   * but "Quit" in the pause overlay, a navigation away and a closed tab all
   * end the session at any moment. The bets had left the bankroll when they
   * were placed, so a doubled $100 hand quit before the dealer played was
   * booked $200 down — into the statistics and the real-money-style bankroll
   * log — whatever the cards were. An unfinished hand is void: the money goes
   * back and the hand is not counted.
   */
  function closeOpenHand(engine: CasinoSessionEngine) {
    if (openWagerRef.current > 0) engine.returnHumanWager(openWagerRef.current)
    openWagerRef.current = 0
  }

  /**
   * When the session ended, for its duration.
   *
   * A pause is only subtracted on resume. Quitting *from* the pause overlay —
   * the usual way to quit — therefore counted the whole pause as play.
   */
  function sessionEndTime(): number {
    return pauseStartRef.current || Date.now()
  }

  /**
   * Mark the session as over without recording it.
   *
   * "Start fresh" on the resume panel unmounts the game, and the cleanup below
   * flushes any un-ended session with a hand in it — so the choice that says
   * "discard this" wrote it to the statistics, paid its XP and showed the
   * summary instead of the setup. Closing it here is what makes the cleanup
   * skip it.
   */
  const discardSession = useCallback(() => {
    endedRef.current = true
    // Thrown away means thrown away: the saved copy too, or the setup screen
    // would offer to resume it.
    if (liveId) clearLiveSession(liveId)
    useLiveSessionStore.getState().refreshSaved()
  }, [liveId])

  // On unmount (navigate away, quit): stop the clock, cancel every pending
  // gameplay timeout so none fire against a dead component, and flush a session
  // that was played but never ended — otherwise those hands are silently lost.
  useEffect(() => {
    const timeouts = pendingTimeouts.current
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      timeouts.forEach(clearTimeout)
      timeouts.clear()
      const engine = engineRef.current
      // A guest table hands nothing on: there is nobody to hand it to.
      if (guest) return
      // Not after a sign-out has wiped the device: see `stillOurs`. The
      // sign-out itself ended and recorded the table before it wiped.
      if (engine && !endedRef.current && stillOurs()) {
        closeOpenHand(engine)
        const result = engine.calculateSessionResult(startTimeRef.current, sessionEndTime())
        if (result.hands.length === 0) {
          // Nothing was played: there is nothing to record and nothing worth
          // coming back to. (A reload at this point still finds the table —
          // this is the app itself putting it away.)
          if (liveId) clearLiveSession(liveId)
        } else if (result.hands.length > handsAtStartRef.current) {
          endedRef.current = true
          onSessionEnd(result)
        }
        /*
          Otherwise: a table that was picked up again and left before a hand
          was finished. Nothing has changed since it was saved, so it stays
          saved — still in progress, still on the resume card — rather than
          being recorded as over.

          This case is also what React's development double-mount looks like
          (mount, unmount, mount, within one commit): without it, pressing
          "Continue" in development recorded the session and showed its
          summary before the table had drawn.
        */
        useLiveSessionStore.getState().refreshSaved()
      }
    }
  }, [onSessionEnd, liveId, stillOurs, guest])

  /**
   * A sign-out ends the table first, while the statistics still have an owner.
   *
   * Exactly a cash-out, minus the summary screen: the open hand's bets go
   * back, the session is recorded under the table's id, the saved copy goes
   * with it. `endedRef` then makes the unmount that follows the wipe a no-op.
   */
  useEffect(() => {
    // A guest table is nobody's statistics: the sign-out has nothing to settle.
    if (guest) return
    return registerOpenTable(() => {
      const engine = engineRef.current
      if (!engine || endedRef.current) return
      endedRef.current = true
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      pendingTimeouts.current.forEach(clearTimeout)
      pendingTimeouts.current.clear()
      closeOpenHand(engine)
      recordCasinoSession(
        engine.calculateSessionResult(startTimeRef.current, sessionEndTime()),
        { liveId: liveId ?? null },
      )
    })
  }, [liveId, guest])

  // ─── Settlement ────────────────────────────────────

  const settleRoundCore = useCallback((
    handResult: string,
    profit: number,
    playerCards: Card[],
    finalDealerCards: Card[],
    currentBotResults: BotRoundResult[],
  ) => {
    const engine = engineRef.current
    if (!engine) return

    // What a table sounds like when a hand is settled is chips: paid, or
    // taken. The two tones that used to play here ("correct" / "wrong") are
    // the trainer's verdict on an answer, and losing a hand is not a mistake.
    if (profit > 0) {
      soundEngine.chipCollect()
    } else if (profit < 0) {
      soundEngine.chipsTaken()
    }

    const playerValue = playerCards.length > 0 ? getHandValue(playerCards).best : 0
    const dealerValue = finalDealerCards.length > 0 ? getHandValue(finalDealerCards).best : 0
    const playerHasBJ = isBlackjack(playerCards)
    const dealerHasBJ = isBlackjack(finalDealerCards)
    recorder?.recordSettlement(
      'human', handResult, profit, playerValue, playerHasBJ,
      dealerValue, dealerHasBJ, boxBetsRef.current.reduce((a, b) => a + b, 0),
      engine.getCurrentHandNumber(),
    )

    setHumanSettlement({ result: asOutcome(handResult), profit })
    setGameStep('settlement')

    const dr = dealResultRef.current
    const record: PlayerHandRecord = {
      handNumber: handRecordRef.current.handNumber ?? 0,
      trueCountAtBet: handRecordRef.current.trueCountAtBet ?? 0,
      runningCountAtBet: handRecordRef.current.runningCountAtBet ?? 0,
      remainingDecks: handRecordRef.current.remainingDecks ?? 0,
      playerBet: handRecordRef.current.playerBet ?? 0,
      correctBet: handRecordRef.current.correctBet ?? 0,
      betCorrect: handRecordRef.current.betCorrect ?? false,
      betError: handRecordRef.current.betError ?? 0,
      playerCards,
      dealerUpCard: dr?.dealerUpCard ?? finalDealerCards[0],
      dealerHoleCard: dr?.dealerHoleCard ?? finalDealerCards[1],
      dealerFinalCards: finalDealerCards,
      decisions: decisionsRef.current,
      firstAction: handRecordRef.current.firstAction ?? '',
      correctFirstAction: handRecordRef.current.correctFirstAction ?? '',
      firstActionCorrect: handRecordRef.current.firstActionCorrect ?? true,
      wasDeviationSituation: handRecordRef.current.wasDeviationSituation ?? false,
      deviationName: handRecordRef.current.deviationName,
      deviationCorrectAction: handRecordRef.current.deviationCorrectAction,
      playerFollowedDeviation: handRecordRef.current.playerFollowedDeviation,
      insuranceOffered: handRecordRef.current.insuranceOffered ?? false,
      playerTookInsurance: handRecordRef.current.playerTookInsurance,
      correctInsuranceDecision: handRecordRef.current.correctInsuranceDecision,
      trueCountAtInsurance: handRecordRef.current.trueCountAtInsurance,
      countChecked: false,
      actualRC: engine.getRunningCount(),
      actualTC: engine.getTrueCount(),
      playerHandValue: getHandValue(playerCards).best,
      dealerHandValue: getHandValue(finalDealerCards).best,
      result: handResult as PlayerHandRecord['result'],
      profit,
      bankrollAfter: engine.getHumanBankroll(),
      botResults: currentBotResults,
    }

    engine.recordHand(record)
    houseRef.current?.onHandSettled?.(record, humanHandsRef.current)
    handRecordRef.current._built = record as unknown
    // The hand is settled: this is the moment it becomes safe from a closed
    // tab. Everything from here to the next bet only adds to it.
    persist()
  }, [recorder, persist])

  const settleDealerRound = useCallback((finalDealerCards: Card[]) => {
    const engine = engineRef.current
    if (!engine) return

    const hands = humanHandsRef.current
    const doubled = handDoubledRef.current
    const surrendered = surrenderedRef.current
    const info = handInfoRef.current
    const dealerValue = finalDealerCards.length > 0 ? getHandValue(finalDealerCards).best : 0
    const dealerHasBJ = isBlackjack(finalDealerCards)
    const hn = engine.getCurrentHandNumber()

    let totalProfit = 0
    let lastResult = 'push'
    // Per box: what its hands made together, how many there were, and the
    // result of the last one (which is the box's result when it was not split).
    const perBox: { profit: number; hands: number; result: string }[] = []
    for (let i = 0; i < hands.length; i++) {
      const hCards = hands[i]
      const isD = doubled.has(i)
      const handBet = betOfHand(i) * (isD ? 2 : 1)
      // A hand out of a split cannot be a blackjack; a second or third box can.
      const fromSplit = info[i]?.split ?? false
      const { result: handResult, profit } = engine.settleHand(
        hCards,
        finalDealerCards,
        handBet,
        isD,
        surrendered.has(i),
        fromSplit,
      )
      totalProfit += profit
      lastResult = handResult
      const box = info[i]?.box ?? 0
      const entry = perBox[box] ?? (perBox[box] = { profit: 0, hands: 0, result: 'push' })
      entry.profit += profit
      entry.hands++
      entry.result = handResult

      if (hands.length > 1) {
        const pv = getHandValue(hCards).best
        recorder?.recordSettlement(
          `human_split_${i + 1}`, handResult, profit, pv,
          isBlackjack(hCards) && !fromSplit,
          dealerValue, dealerHasBJ, handBet, hn,
        )
      }
    }

    if (hands.length > 1) {
      if (totalProfit > 0) lastResult = 'win'
      else if (totalProfit < 0) lastResult = 'loss'
      else lastResult = 'push'
    }

    const totalBet = hands.reduce((sum, _, i) => sum + betOfHand(i) * (doubled.has(i) ? 2 : 1), 0)
    engine.updateHumanBankroll(totalBet + totalProfit)
    // Decided: nothing of this hand is open any more.
    openWagerRef.current = 0

    const bResults = engine.settleBotHands(finalDealerCards)
    setBotResults(bResults)

    const settledStatuses: Record<string, BotStatus> = {}
    for (const br of bResults) {
      settledStatuses[br.id] = br.result === 'blackjack' ? 'blackjack'
        : br.result === 'win' ? 'win'
        : br.result === 'push' ? 'push'
        : br.result === 'surrender' ? 'surrender' : 'loss'
    }
    setBotStatuses(prev => ({ ...prev, ...settledStatuses }))

    // The hand's figure includes its insurance. The side bet is settled the
    // moment the dealer checks, and was then left out of the total: insure,
    // win the hand, and the label read "Win +$25" over a bankroll up $12.50.
    // What each box shows. Insurance is decided hand by hand, so each box
    // carries its own side bet.
    const insuranceNets = insuranceNetsRef.current
    setBoxSettlements(perBox.map((b, k) => {
      const profit = b.profit + (insuranceNets[k] ?? 0)
      const result = b.hands === 1 ? asOutcome(b.result) : profit > 0 ? 'win' : profit < 0 ? 'loss' : 'push'
      return { result, profit }
    }))

    const insuranceTotal = insuranceNets.reduce((a, b) => a + b, 0)
    settleRoundCore(lastResult, totalProfit + insuranceTotal, hands[0] ?? [], finalDealerCards, bResults)
  }, [recorder, settleRoundCore, betOfHand])

  // ─── Animation Step Builders ───────────────────────

  const buildBotAnimSteps = useCallback((bot: BotPlayer, initialCardCount: number): AnimStep[] => {
    const engine = engineRef.current
    if (!engine) return []

    const updatedBot = engine.getSeats()[bot.seatIndex]
    if (!updatedBot) return []

    const steps: AnimStep[] = []

    // Natural blackjack — ONLY possible on an unsplit two-card hand. After an
    // ace split, hand 0 can be [A,10] = 21, which is a 21 but NOT a natural
    // blackjack, so it must fall through to the split animation below.
    if (isNaturalBlackjack(updatedBot.hands.length, updatedBot.hands[0]?.cards ?? [])) {
      steps.push({
        execute: () => {
          setActiveBotId(updatedBot.id)
          setBotStatuses(prev => ({ ...prev, [updatedBot.id]: 'blackjack' }))
        },
        delayMs: 1200,
      })
      steps.push({ execute: () => setActiveBotId(null), delayMs: 500 })
      return steps
    }

    // Thinking
    steps.push({
      execute: () => {
        setActiveBotId(updatedBot.id)
        setBotStatuses(prev => ({ ...prev, [updatedBot.id]: 'thinking' }))
      },
      delayMs: 1500 + Math.random() * 1000,
    })

    // ─── Split: replayed from the engine's log, one dealt card at a time ───
    // The final hands cannot say when a re-split happened, so the replay
    // follows the turn as it was played: the pair slides apart, the first hand
    // is dealt and played out, and only then does the next hand get its card.
    // A third hand appears on the split that made it and not before.
    if (updatedBot.hands.length > 1) {
      const botId = updatedBot.id
      const log = updatedBot.turnLog ?? []
      const frames = buildSplitReplay(log, () => 1500 + Math.floor(Math.random() * 800))

      for (const f of frames) {
        steps.push({
          execute: () => {
            if (f.hands) {
              const hands = f.hands
              setBotSplitHands(prev => ({ ...prev, [botId]: hands }))
            }
            if (f.active !== undefined) {
              const active = f.active
              setBotActiveSplitHands(prev => ({ ...prev, [botId]: active }))
            }
            if (f.status) {
              const status = f.status
              setBotStatuses(prev => ({ ...prev, [botId]: status }))
            }
            if (f.sound === 'card') soundEngine.cardDeal()
            else if (f.sound === 'chip') soundEngine.chipPlace()
            else if (f.sound === 'click') soundEngine.buttonClick()
          },
          delayMs: f.delayMs,
        })
      }

      // Bot done — the hands as the engine settled them, no hand in play.
      const settled = log.at(-1)?.hands
        ?? updatedBot.hands.map((h, k) => ({ id: k, cards: h.cards }))
      steps.push({
        execute: () => {
          setActiveBotId(null)
          setBotActiveSplitHands(prev => ({ ...prev, [botId]: -1 }))
          setBotSplitHands(prev => ({ ...prev, [botId]: settled }))
        },
        delayMs: 500,
      })
      return steps
    }

    const finalHand = updatedBot.hands[0]
    const finalCardCount = finalHand?.cards.length ?? 2
    const botId = updatedBot.id

    // Surrender
    if (finalHand?.result === 'surrender') {
      steps.push({
        execute: () => {
          setBotStatuses(prev => ({ ...prev, [botId]: 'surrender' }))
          soundEngine.buttonClick()
        },
        delayMs: 800,
      })
      steps.push({ execute: () => setActiveBotId(null), delayMs: 500 })
      return steps
    }

    // Stand (no new cards)
    if (finalCardCount <= initialCardCount) {
      steps.push({
        execute: () => {
          setBotStatuses(prev => ({ ...prev, [botId]: 'stand' }))
          soundEngine.buttonClick()
        },
        delayMs: 700,
      })
      steps.push({ execute: () => setActiveBotId(null), delayMs: 500 })
      return steps
    }

    // Double: Status FIRST → Card SECOND
    if (finalHand?.isDoubled) {
      steps.push({
        execute: () => {
          setBotStatuses(prev => ({ ...prev, [botId]: 'double' }))
          soundEngine.chipPlace()
        },
        delayMs: 700,
      })
      steps.push({
        execute: () => {
          setBotVisibleCards(prev => ({ ...prev, [botId]: finalCardCount }))
          soundEngine.cardDeal()
        },
        delayMs: 800,
      })
      if (finalHand.isBusted) {
        steps.push({
          execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'bust' })),
          delayMs: 1000,
        })
      } else {
        const valAfterDouble = getHandValue(finalHand.cards).best
        if (valAfterDouble === 21) {
          steps.push({
            execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'twentyone' })),
            delayMs: 600,
          })
        }
      }
      steps.push({ execute: () => setActiveBotId(null), delayMs: 500 })
      return steps
    }

    // Hits: Status FIRST → Card SECOND, with 21 detection
    let reached21 = false
    for (let c = initialCardCount; c < finalCardCount; c++) {
      const visCount = c + 1
      const isFirstHit = c === initialCardCount

      // Think before each hit (except first — already thinking from initial step)
      if (!isFirstHit) {
        steps.push({
          execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'thinking' })),
          delayMs: 1500 + Math.floor(Math.random() * 800),
        })
      }

      // "Hit" status FIRST
      steps.push({
        execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'hit' })),
        delayMs: 500,
      })

      // Reveal card SECOND
      steps.push({
        execute: () => {
          setBotVisibleCards(prev => ({ ...prev, [botId]: visCount }))
          soundEngine.cardDeal()
        },
        delayMs: 800,
      })

      // Check 21 after card
      if (finalHand) {
        const valAfterHit = getHandValue(finalHand.cards.slice(0, visCount)).best
        if (valAfterHit === 21) {
          steps.push({
            execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'twentyone' })),
            delayMs: 600,
          })
          reached21 = true
          break
        }
      }
    }

    if (!reached21) {
      if (finalHand?.isBusted) {
        steps.push({
          execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'bust' })),
          delayMs: 1000,
        })
      } else {
        // Stand: Think → "Stand"
        steps.push({
          execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'thinking' })),
          delayMs: 1500 + Math.floor(Math.random() * 800),
        })
        steps.push({
          execute: () => {
            setBotStatuses(prev => ({ ...prev, [botId]: 'stand' }))
            soundEngine.buttonClick()
          },
          delayMs: 700,
        })
      }
    }

    steps.push({ execute: () => setActiveBotId(null), delayMs: 500 })
    return steps
  }, [])

  const computeBotsAndBuildSteps = useCallback((seatIndices: number[], dealerUpCard: Card): AnimStep[] => {
    const engine = engineRef.current
    if (!engine || seatIndices.length === 0) return []

    const initialCounts: Record<number, number> = {}
    for (const seatIdx of seatIndices) {
      const bot = engine.getSeats()[seatIdx]
      if (!bot || !bot.isActive) continue
      initialCounts[seatIdx] = bot.hands[0]?.cards.length ?? 2
      engine.playBotAtSeat(seatIdx, dealerUpCard)
    }
    // Their cards are out of the shoe now, whatever the replay has shown.
    persist()

    const updatedSeats = engine.getSeats()
    setSeats([...updatedSeats])

    const visLimits: Record<string, number> = {}
    for (const seatIdx of seatIndices) {
      const bot = updatedSeats[seatIdx]
      if (bot && bot.isActive) {
        visLimits[bot.id] = initialCounts[seatIdx] ?? 2
      }
    }
    setBotVisibleCards(prev => ({ ...prev, ...visLimits }))

    const allSteps: AnimStep[] = []
    allSteps.push({ execute: () => setGameStep('bot_playing'), delayMs: 0 })

    for (const seatIdx of seatIndices) {
      const bot = updatedSeats[seatIdx]
      if (!bot || !bot.isActive) continue
      allSteps.push(...buildBotAnimSteps(bot, initialCounts[seatIdx] ?? 2))
    }

    return allSteps
  }, [buildBotAnimSteps, persist])

  const buildDealerSteps = useCallback((): AnimStep[] => {
    const engine = engineRef.current
    const dr = dealResultRef.current
    if (!engine || !dr) return []

    const originalDealerCards: Card[] = [dr.dealerUpCard, dr.dealerHoleCard]
    // The dealer only draws if the human still has a live hand — one that is
    // not busted, not surrendered, and not a natural blackjack (naturals are
    // already resolved). Bot hands are evaluated inside the engine.
    const humanHandsNow = humanHandsRef.current
    const humanNeedsDealer = humanHandsNow.some((h, i) => {
      if (surrenderedRef.current.has(i)) return false
      if (isBust(h)) return false
      if (!(handInfoRef.current[i]?.split ?? false) && isBlackjack(h)) return false
      return true
    })
    const finalDealerCards = engine.playDealerHand([...originalDealerCards], humanNeedsDealer)
    persist()

    recorder?.recordDealerUpCardCheck(
      formatCard(dr.dealerUpCard), formatCard(dr.dealerUpCard),
      engine.getCurrentHandNumber(),
    )

    const steps: AnimStep[] = []
    steps.push({ execute: () => setGameStep('dealer_playing'), delayMs: 0 })

    // Reveal hole card
    steps.push({
      execute: () => {
        setDealerHoleRevealed(true)
        soundEngine.cardFlip()
      },
      delayMs: 1200,
    })

    // Reveal hit cards
    const extraCards = finalDealerCards.slice(2)
    for (let i = 0; i < extraCards.length; i++) {
      const sliceEnd = 3 + i
      steps.push({
        execute: () => {
          prevDealerCardCount.current = sliceEnd - 1
          setDealerCards(finalDealerCards.slice(0, sliceEnd))
          soundEngine.cardDeal()
        },
        delayMs: 900,
      })
    }

    // Settle
    const capturedFinalDealerCards = finalDealerCards
    steps.push({
      execute: () => settleDealerRound(capturedFinalDealerCards),
      delayMs: 800,
    })

    return steps
  }, [recorder, settleDealerRound, persist])

  // ─── Play goes round the table ─────────────────────

  /**
   * The steps that play every bot sitting before `seat` that has not played
   * yet this round. The engine plays them now; the steps replay it.
   */
  const botStepsBefore = useCallback((seat: number): AnimStep[] => {
    const engine = engineRef.current
    const dr = dealResultRef.current
    if (!engine || !dr) return []
    const due: number[] = []
    engine.getSeats().forEach((bot, i) => {
      if (bot && bot.isActive && i > botsPlayedToRef.current && i < seat) due.push(i)
    })
    botsPlayedToRef.current = Math.max(botsPlayedToRef.current, seat - 1)
    return due.length > 0 ? computeBotsAndBuildSteps(due, dr.dealerUpCard) : []
  }, [computeBotsAndBuildSteps])

  /**
   * Give one of the player's hands the turn — after the bots that sit before
   * it. With several hands at a table, a bot between two of them plays between
   * them, as it would at a casino.
   */
  const enterHand = useCallback((idx: number) => {
    const seat = boxSeatsRef.current[handInfoRef.current[idx]?.box ?? 0] ?? config.playerSeatIndex
    const steps = botStepsBefore(seat)
    const give = () => { setActive(idx); setGameStep('human_playing') }
    if (steps.length > 0) animation.run(steps, give)
    else give()
  }, [animation, botStepsBefore, setActive, config.playerSeatIndex])

  // ─── Post-Human Flow ───────────────────────────────

  const runPostHumanFlow = useCallback(() => {
    const dr = dealResultRef.current
    if (!dr || postHumanRanRef.current) return
    postHumanRanRef.current = true

    // Whoever sits after the player's last hand, then the dealer.
    animation.run([...botStepsBefore(Number.POSITIVE_INFINITY), ...buildDealerSteps()])
  }, [animation, botStepsBefore, buildDealerSteps])

  // ─── Advance To Next Hand ──────────────────────────

  /** An unsplit two-card 21: a blackjack, which is not played. */
  function isNaturalAt(i: number): boolean {
    const hand = humanHandsRef.current[i]
    return !!hand && !(handInfoRef.current[i]?.split ?? false) && isBlackjack(hand)
  }

  /** How many hands the box of hand `i` holds — the limit a split counts against. */
  function handsInBoxOf(i: number): number {
    const box = handInfoRef.current[i]?.box ?? 0
    return handInfoRef.current.filter(h => h.box === box).length
  }

  const advanceToNextHand = useCallback((scheduledFrom?: number) => {
    const engine = engineRef.current
    // From refs, not from this render: the call may come from a scheduled
    // callback holding an older render (see activeHandRef). A scheduled call
    // names the hand it was scheduled for; if play is no longer on that hand,
    // it is late and must not move on from the hand that is.
    const from = activeHandRef.current
    if (scheduledFrom !== undefined && scheduledFrom !== from) return
    if (advancedFromRef.current.has(from)) return
    advancedFromRef.current.add(from)
    const currentHumanHands = humanHandsRef.current

    // A box that was dealt a blackjack is not played: it waits for the dealer.
    let nextIdx = from + 1
    while (nextIdx < currentHumanHands.length && isNaturalAt(nextIdx)) {
      advancedFromRef.current.add(nextIdx)
      nextIdx++
    }

    if (nextIdx < currentHumanHands.length && engine) {
      const nextHand = currentHumanHands[nextIdx]

      if (nextHand && nextHand.length === 1) {
        // 1. Switch focus FIRST: dim the finished hand, un-dim the next one.
        setActive(nextIdx)
        // 2. Only THEN — once the switch is visible — deal the next card to
        //    the now-active hand (so the card never arrives on a dimmed hand).
        schedule(() => {
          const newCard = engine.drawCard()
          persist()
          soundEngine.cardDeal()
          updateHandCards(nextIdx, [...nextHand, newCard])
        }, scaledDelay(500))
      } else {
        schedule(() => enterHand(nextIdx), scaledDelay(400))
      }
    } else {
      runPostHumanFlow()
    }
  }, [updateHandCards, runPostHumanFlow, schedule, setActive, enterHand, persist])

  /**
   * Hand the table to the player: the first hand that is theirs to play.
   * Boxes dealt a blackjack are passed over; if every box has one there is
   * nothing to play and the round goes on to the bots and the dealer.
   */
  const beginHumanTurn = useCallback(() => {
    const hands = humanHandsRef.current
    let first = 0
    while (first < hands.length && isNaturalAt(first)) {
      advancedFromRef.current.add(first)
      first++
    }
    if (first >= hands.length) { runPostHumanFlow(); return }
    enterHand(first)
  }, [runPostHumanFlow, enterHand])

  // ─── Betting Phase ─────────────────────────────────

  const confirmBet = useCallback(() => {
    const engine = engineRef.current
    // A table that is over — cashed out elsewhere, or ended by a sign-out —
    // deals nothing more, whatever key arrives.
    if (!engine || endedRef.current) return
    // The target is reached: the end prompt is up, and the next hand waits for
    // the player's answer (Enter must not deal past it).
    if (sessionLimitReached(config, engine.getCurrentHandNumber(), elapsedSeconds, keptPlaying)) return

    // Every hand the player takes needs at least the minimum; with too little
    // money for that, fewer hands are dealt.
    const funds = engine.getHumanBankroll()
    let handCount = boxesRef.current
    while (handCount > 1 && Math.floor(funds / handCount) < config.minBet) handCount--
    if (handCount !== boxesRef.current) applySeats(boxSeatsRef.current.slice(0, handCount))

    // Each hand's own bet; a hand left empty plays the minimum. If together
    // they are more than the bankroll, it is shared out evenly instead.
    let bets = Array.from({ length: handCount }, (_, i) =>
      Math.min(boxBetsRef.current[i] || config.minBet, config.maxBet))
    if (bets.reduce((a, b) => a + b, 0) > funds) {
      const each = Math.min(config.maxBet, Math.floor(funds / handCount))
      bets = bets.map(() => each)
    }
    if (bets.some(b => b < config.minBet)) return
    lastBetsRef.current = bets
    const totalBet = bets.reduce((a, b) => a + b, 0)
    // What the round is graded on: the bet per hand (the same number as before
    // when every hand carries the same).
    const clampedBet = Math.round(totalBet / handCount)

    // The count this bet will be played at — a fresh shoe's, if the cut card is out.
    const { trueCount: tc, runningCount: rc } = engine.getCountForNextRound()
    // Without a count there is no bet to size from, so the bet the player
    // chose *is* the correct bet — flat betting is the whole strategy.
    const basic = engine.isBasicPlay()
    const correctBet = basic ? clampedBet : engine.getCorrectBet(tc)
    const betCorrect = basic ? true : bets.every(b => engine.isBetCorrect(b, correctBet))

    soundEngine.chipPlace()

    const hn = engine.getCurrentHandNumber() + 1
    handRecordRef.current = {
      handNumber: hn,
      trueCountAtBet: tc,
      runningCountAtBet: rc,
      remainingDecks: engine.getRemainingDecks(),
      playerBet: clampedBet,
      correctBet,
      betCorrect,
      betError: clampedBet - correctBet,
    }

    recorder?.recordBetPlaced('human', clampedBet, correctBet, tc, hn)

    engine.deductHumanBet(totalBet)
    openWagerRef.current = totalBet
    insuranceNetsRef.current = []
    insuranceTakenRef.current = []
    applyInsuranceBox(-1)
    applyBets(bets)

    const dealResult = engine.dealNewRound(boxSeatsRef.current)
    botsPlayedToRef.current = -1
    dealResultRef.current = dealResult
    // The cards are out of the shoe: from here a reload must not bring them
    // back. The copy holds the bets returned and the cards burned.
    persist()
    // That write is also where a table learns it was cashed out in another
    // tab; it is closed then, and this hand is not laid out.
    if (endedRef.current) return
    // A fresh shoe empties the discard tray.
    if (dealResult.reshuffled) setDiscardCount(0)

    // Reshuffle handled as leading animation steps (Fix 5)

    prevDealerCardCount.current = 0

    const dealtHands = dealResult.humanBoxCards
    const dealtInfo: HandInfo[] = dealtHands.map((_, box) => ({ box, split: false }))
    setHumanHands(dealtHands)
    humanHandsRef.current = dealtHands
    setHandInfo(dealtInfo)
    handInfoRef.current = dealtInfo
    setBoxSettlements([])
    setActive(0)
    advancedFromRef.current = new Set()
    postHumanRanRef.current = false
    setDealerCards([])
    setSeats([...engine.getSeats()])
    setHandDoubled(new Set())
    handDoubledRef.current = new Set()
    setSurrenderedHands(new Set())
    surrenderedRef.current = new Set()

    handRecordRef.current.playerCards = [...dealResult.humanCards]
    handRecordRef.current.dealerUpCard = dealResult.dealerUpCard
    handRecordRef.current.dealerHoleCard = dealResult.dealerHoleCard

    setGameStep('dealing')
    setHumanVisibleCards(0)

    const initBotVis: Record<string, number> = {}
    for (const s of engine.getSeats()) {
      if (s) initBotVis[s.id] = 0
    }
    setBotVisibleCards(initBotVis)

    // Build deal animation steps
    const currentSeatLayout = seatLayout
    const steps: AnimStep[] = []

    // Reshuffle overlay before deal (Fix 5)
    if (dealResult.reshuffled) {
      steps.push({ execute: () => setShowReshuffle(true), delayMs: 2000 })
      steps.push({ execute: () => setShowReshuffle(false), delayMs: 400 })
    }

    // Round 1: first card to each seat in turn, then dealer
    {
      let shown = 0
      for (let seatIdx = 0; seatIdx < TABLE_SEATS; seatIdx++) {
        if (dealResult.humanBoxSeats.includes(seatIdx)) {
          const upTo = ++shown
          steps.push({
            execute: () => {
              setHumanVisibleCards(upTo)
              soundEngine.cardDeal()
            },
            delayMs: 500,
          })
          continue
        }
        const bot = currentSeatLayout.find(e => e.type === 'bot' && e.seatIndex === seatIdx)?.bot
        if (!bot) continue
        const botId = bot.id
        steps.push({
          execute: () => {
            setBotVisibleCards(prev => ({ ...prev, [botId]: 1 }))
            soundEngine.cardDeal()
          },
          delayMs: 500,
        })
      }
    }
    // Dealer up card
    steps.push({
      execute: () => {
        setDealerCards([dealResult.dealerUpCard])
        soundEngine.cardDeal()
      },
      delayMs: 500,
    })

    // Round 2: second card to each seat in turn, then dealer hole card
    {
      let shown = handCount
      for (let seatIdx = 0; seatIdx < TABLE_SEATS; seatIdx++) {
        if (dealResult.humanBoxSeats.includes(seatIdx)) {
          const upTo = ++shown
          steps.push({
            execute: () => {
              setHumanVisibleCards(upTo)
              soundEngine.cardDeal()
            },
            delayMs: 500,
          })
          continue
        }
        const bot = currentSeatLayout.find(e => e.type === 'bot' && e.seatIndex === seatIdx)?.bot
        if (!bot) continue
        const botId = bot.id
        steps.push({
          execute: () => {
            setBotVisibleCards(prev => ({ ...prev, [botId]: 2 }))
            soundEngine.cardDeal()
          },
          delayMs: 500,
        })
      }
    }
    // Dealer hole card (face down)
    steps.push({
      execute: () => {
        setDealerCards([dealResult.dealerUpCard, dealResult.dealerHoleCard])
        soundEngine.cardDeal()
      },
      delayMs: 600,
    })

    // Run deal animation, then handle post-deal decision via onComplete (Fix 4)
    animation.run(steps, () => {
      const engine = engineRef.current
      if (!engine) return

      // All dealt cards now visible
      setBotVisibleCards({})
      setHumanVisibleCards(999)
      prevDealerCardCount.current = 2

      // ─── Dealer Blackjack Check (10-value up card) ─────────
      // When dealer shows 10/J/Q/K, check immediately — no insurance.
      // If dealer has BJ: reveal hole card, settle all hands, done.
      const upRank = dealResult.dealerUpCard.rank
      if (['10', 'J', 'Q', 'K'].includes(upRank)) {
        const dealerBJ = isBlackjack([dealResult.dealerUpCard, dealResult.dealerHoleCard])
        if (dealerBJ) {
          const bjSteps: AnimStep[] = []
          // Reveal hole card
          bjSteps.push({
            execute: () => {
              setDealerHoleRevealed(true)
              setGameStep('dealer_playing')
              soundEngine.cardFlip()
            },
            delayMs: 1500,
          })
          // Settle: count hole card via playDealerHand, then settle all hands
          bjSteps.push({
            execute: () => {
              const finalDC = engine.playDealerHand([dealResult.dealerUpCard, dealResult.dealerHoleCard])
              settleDealerRound(finalDC)
            },
            delayMs: 800,
          })
          animation.run(bjSteps)
          return
        }
      }

      // ─── Insurance (Ace up card) ───────────────────────────
      if (dealResult.dealerUpCard.rank === 'A') {
        // Asked hand by hand, first hand first.
        insuranceTakenRef.current = []
        applyInsuranceBox(0)
        setShowInsurance(true)
        setGameStep('insurance')
        return
      }

      // ─── Player Blackjack (no dealer BJ possible at this point) ─
      if (dealResult.humanBoxCards.every(h => isBlackjack(h))) {
        const allBotSeats = currentSeatLayout
          .filter(s => s.type === 'bot')
          .map(s => s.seatIndex)
        botsPlayedToRef.current = TABLE_SEATS
        const botSteps = allBotSeats.length > 0
          ? computeBotsAndBuildSteps(allBotSeats, dealResult.dealerUpCard)
          : []
        const dealerSteps = buildDealerSteps()
        animation.run([...botSteps, ...dealerSteps])
        return
      }

      // Normal — play goes round the table to the player's first hand.
      beginHumanTurn()
    })
  }, [config, seatLayout, elapsedSeconds, keptPlaying, animation, computeBotsAndBuildSteps, buildDealerSteps, settleDealerRound, recorder, setActive, beginHumanTurn, applyBets, applyInsuranceBox, applySeats, persist])

  // ─── Insurance ─────────────────────────────────────

  const handleInsurance = useCallback((take: boolean) => {
    const engine = engineRef.current
    const dr = dealResultRef.current
    if (!engine || !dr || endedRef.current) return

    // Not being asked (a key pressed after the last answer): nothing to do.
    const asked = insuranceBoxRef.current
    if (asked < 0) return

    const tc = engine.getTrueCount()
    const correctInsurance = engine.getCorrectInsurance(tc)
    recorder?.recordInsurance(take, tc, take === correctInsurance, engine.getCurrentHandNumber())

    // Insurance is a side bet on one hand, so it is asked hand by hand: each
    // box insures half of its own bet, or does not.
    const taken = [...insuranceTakenRef.current]
    taken[asked] = take
    insuranceTakenRef.current = taken
    const boxCount = humanHandsRef.current.length
    if (asked + 1 < boxCount) {
      applyInsuranceBox(asked + 1)
      return
    }
    applyInsuranceBox(-1)

    handRecordRef.current.insuranceOffered = true
    handRecordRef.current.playerTookInsurance = taken.some(Boolean)
    handRecordRef.current.correctInsuranceDecision = taken.every(x => x === correctInsurance)
    handRecordRef.current.trueCountAtInsurance = tc

    setShowInsurance(false)

    const dealerHasBJ = isBlackjack([dr.dealerUpCard, dr.dealerHoleCard])

    // Settle the insurance side bets in every case: each pays 2:1 on a dealer
    // blackjack, otherwise the half-bet stake is lost. (Previously a losing
    // insurance bet was never deducted — insurance was effectively free.)
    // All stakes come out of the bankroll as it is now, then all are booked:
    // one hand's insurance win never pays for the next hand's stake.
    const nets = engine.settleInsurances(
      Array.from({ length: boxCount }, (_, b) => boxBetsRef.current[b] ?? 0),
      Array.from({ length: boxCount }, (_, b) => taken[b] ?? false),
      dealerHasBJ,
    )
    for (const net of nets) engine.updateHumanBankroll(net)
    insuranceNetsRef.current = nets
    // A side bet is settled the moment the dealer checks, and stays settled
    // if the hand is then lost to a reload.
    persist()

    if (dealerHasBJ) {
      setDealerHoleRevealed(true)
      setGameStep('dealer_playing')

      // Count hole card and get final dealer cards
      const finalDC = engine.playDealerHand([dr.dealerUpCard, dr.dealerHoleCard])

      // Settle all hands (human + bots) via the standard path
      settleDealerRound(finalDC)
      return
    }

    const currentSeatLayout = seatLayout

    if (humanHandsRef.current.every(h => isBlackjack(h))) {
      const allBotSeats = currentSeatLayout
        .filter(s => s.type === 'bot')
        .map(s => s.seatIndex)
      botsPlayedToRef.current = TABLE_SEATS
      const botSteps = allBotSeats.length > 0
        ? computeBotsAndBuildSteps(allBotSeats, dr.dealerUpCard)
        : []
      const dealerSteps = buildDealerSteps()
      animation.run([...botSteps, ...dealerSteps])
    } else {
      beginHumanTurn()
    }
  }, [applyInsuranceBox, seatLayout, animation, computeBotsAndBuildSteps, buildDealerSteps, recorder, settleDealerRound, beginHumanTurn, persist])

  // ─── Human Play ────────────────────────────────────

  /**
   * Deal the remaining split aces their one card each, in order, and stand
   * them — stopping only where a second ace offers a re-split. Also the way on
   * after a declined re-split, so those hands can never be hit or doubled.
   * Each ace hand is marked as moved-on-from as soon as it stands, which is
   * what keeps clicks and keys off it during the pause before the next.
   */
  const advanceAceHands = useCallback((from: number) => {
    const engine = engineRef.current
    if (!engine) return
    const step = (idx: number) => {
      const hands = humanHandsRef.current
      if (idx >= hands.length) {
        runPostHumanFlow()
        return
      }
      const hand = hands[idx]
      if (!hand) { step(idx + 1); return }
      if (hand.length !== 1) {
        // Not an ace waiting for its card. A hand of the player's next box,
        // not yet played, is theirs to play in the ordinary way; anything
        // already moved on from, or a blackjack, is passed over.
        if (!advancedFromRef.current.has(idx) && !isNaturalAt(idx)) { enterHand(idx); return }
        advancedFromRef.current.add(idx)
        step(idx + 1)
        return
      }
      // Switch focus to this hand first (un-dim), then deal its card.
      setActive(idx)
      schedule(() => {
        const nc = engine.drawCard()
        persist()
        soundEngine.cardDeal()
        updateHandCards(idx, [...hand, nc])
        // A second ace and room for another hand: the player decides.
        if (canReSplitAces([hand[0], nc], handsInBoxOf(idx), config.maxSplitHands) &&
            engine.getHumanBankroll() >= betOfHand(idx)) {
          return
        }
        advancedFromRef.current.add(idx)
        schedule(() => step(idx + 1), scaledDelay(600))
      }, scaledDelay(500))
    }
    step(from)
  }, [runPostHumanFlow, schedule, setActive, updateHandCards, config.maxSplitHands, betOfHand, enterHand, persist])

  const handleAction = useCallback((action: Action, timedOut = false) => {
    const engine = engineRef.current
    const dr = dealResultRef.current
    if (!engine || !dr || gameStep !== 'human_playing' || endedRef.current) return

    const cards = humanHands[activeHandIndex] ?? []
    if (cards.length < 2) return
    const idx = activeHandIndex
    // A double or a split costs this hand's own bet, not another hand's.
    const currentBet = betOfHand(idx)
    // What this hand may do depends on the hand, not on how many the player
    // holds: a second box is an ordinary hand, a hand out of a split is not.
    const fromSplit = handInfoRef.current[idx]?.split ?? false
    const canSplitHand = cards.length === 2 && isPair(cards) && handsInBoxOf(idx) < config.maxSplitHands && engine.getHumanBankroll() >= currentBet
    const isFirstAction = cards.length === 2
    const canSurrenderNow = isFirstAction && !surrenderedRef.current.has(idx) && config.surrenderAllowed && !fromSplit
    const canDoubleHand = isFirstAction && engine.getHumanBankroll() >= currentBet && (!fromSplit || config.doubleAfterSplit)
    const splitAce = fromSplit && cards[0].rank === 'A'

    // Does this hand accept input at all? Clicks and keys arrive during the
    // short transitions too — 600 ms after a bust or a double, while a split
    // ace waits to stand — and each one used to be acted on: a Hit after a
    // double, a Stand that moved on from the *next* hand, a card dealt to a
    // hand twice (one of them counted but never shown). Checked before anything
    // is recorded, so a refused key leaves no trace in the history either.
    if (idx !== activeHandRef.current) return
    if (advancedFromRef.current.has(idx) || isBust(cards) || handDoubledRef.current.has(idx) || surrenderedRef.current.has(idx)) return
    // A split ace takes one card and stands. The only choice it can offer is
    // a second ace: split again, or decline (Stand).
    if (splitAce && !(cards.length === 2 && cards[1].rank === 'A' && (action === Action.Split || action === Action.Stand))) return
    // A move the table does not allow here is refused, not turned into another
    // move (keyboard `d` used to become a Hit, or double a split hand at a
    // no-DAS table).
    if (action === Action.Double && !canDoubleHand) return
    if (action === Action.Split && !canSplitHand) return
    if (action === Action.Surrender && !canSurrenderNow) return

    const tc = engine.getTrueCount()
    const { action: correctAction, isDeviation, deviationName } = engine.getCorrectAction(
      cards,
      dr.dealerUpCard,
      tc,
      canSplitHand,
      canDoubleHand,
      canSurrenderNow,
    )

    const isCorrect = action === correctAction
    // Standing on 21 is not a decision. The table does it for the player
    // after half a second, and it was stored as a graded, correct play —
    // every 21 raised the play accuracy and the decision count a little.
    // Nor is a stand the clock made. A player who looked away for thirty
    // seconds on 11 against a 6 did not "stand on 11": the hand is played,
    // and nothing is written into the accuracy or the hand review.
    const forced = action === Action.Stand && (timedOut || getHandValue(cards).best === 21)
    const decision = {
      action: action.toString(),
      correctAction: correctAction.toString(),
      isCorrect,
      cardReceived: undefined as Card | undefined,
      handValueAfter: getHandValue(cards).best,
      handIndex: activeHandIndex,
    }

    if (!forced && decisionsRef.current.length === 0) {
      handRecordRef.current.firstAction = action.toString()
      handRecordRef.current.correctFirstAction = correctAction.toString()
      handRecordRef.current.firstActionCorrect = isCorrect

      if (isDeviation) {
        handRecordRef.current.wasDeviationSituation = true
        handRecordRef.current.deviationName = deviationName
        handRecordRef.current.deviationCorrectAction = correctAction.toString()
        handRecordRef.current.playerFollowedDeviation = isCorrect
      }
    }

    if (!forced) recorder?.recordPlayerAction(
      'human', action.toString(), getHandValue(cards).best,
      formatCard(dr.dealerUpCard), correctAction.toString(),
      isCorrect, false, engine.getCurrentHandNumber(),
    )

    if (action === Action.Stand) {
      decision.handValueAfter = getHandValue(cards).best
      if (!forced) decisionsRef.current.push(decision)
      soundEngine.buttonClick()
      if (splitAce) {
        // A declined re-split: the remaining aces follow the ace rules.
        advancedFromRef.current.add(idx)
        advanceAceHands(idx + 1)
      } else {
        advanceToNextHand()
      }
      return
    }

    if (action === Action.Hit) {
      const card = engine.drawCard()
      persist()
      const newCards = [...cards, card]
      decision.cardReceived = card
      decision.handValueAfter = getHandValue(newCards).best
      decisionsRef.current.push(decision)
      updateHandCards(activeHandIndex, newCards)
      soundEngine.cardDeal()

      if (isBust(newCards)) {
        schedule(() => advanceToNextHand(idx), scaledDelay(600))
      }
      return
    }

    if (action === Action.Double) {
      engine.deductHumanBet(currentBet)
      openWagerRef.current += currentBet
      const newDoubled = new Set(handDoubled).add(activeHandIndex)
      setHandDoubled(newDoubled)
      handDoubledRef.current = newDoubled
      const card = engine.drawCard()
      persist()
      const newCards = [...cards, card]
      decision.cardReceived = card
      decision.handValueAfter = getHandValue(newCards).best
      decisionsRef.current.push(decision)
      updateHandCards(activeHandIndex, newCards)
      soundEngine.cardDeal()
      soundEngine.chipPlace()
      schedule(() => advanceToNextHand(idx), scaledDelay(600))
      return
    }

    if (action === Action.Surrender) {
      // This hand is given up; the player's other hands are still to play.
      const given = new Set(surrenderedRef.current).add(idx)
      surrenderedRef.current = given
      setSurrenderedHands(given)
      decision.handValueAfter = getHandValue(cards).best
      decisionsRef.current.push(decision)
      soundEngine.buttonClick()
      advanceToNextHand()
      return
    }

    if (action === Action.Split) {
      if (!canSplitHand) return
      engine.deductHumanBet(currentBet)
      openWagerRef.current += currentBet
      soundEngine.chipPlace()

      const card1 = cards[0]
      const card2 = cards[1]
      const isAces = card1.rank === 'A'

      const splitHands = [...humanHands]
      splitHands[activeHandIndex] = [card1]
      splitHands.splice(activeHandIndex + 1, 0, [card2])
      setHumanHands(splitHands)
      humanHandsRef.current = splitHands
      // Both halves stay in the box that was split, and neither is a first hand.
      const box = handInfoRef.current[activeHandIndex]?.box ?? 0
      const splitInfo = [...handInfoRef.current]
      splitInfo[activeHandIndex] = { box, split: true }
      splitInfo.splice(activeHandIndex + 1, 0, { box, split: true })
      setHandInfo(splitInfo)
      handInfoRef.current = splitInfo

      decision.handValueAfter = getHandValue([card1]).best
      decisionsRef.current.push(decision)

      const hi = activeHandIndex

      schedule(() => {
        const newCard1 = engine.drawCard()
        persist()
        soundEngine.cardDeal()
        updateHandCards(hi, [card1, newCard1])
        setActive(hi)

        if (isAces) {
          // Check if re-split is possible on this hand
          if (canReSplitAces([card1, newCard1], handsInBoxOf(hi), config.maxSplitHands) &&
              engine.getHumanBankroll() >= betOfHand(hi)) {
            // Player can re-split — hand shows [A, A], split button enabled
            return
          }

          // Auto-stand this hand, then deal the remaining aces in order.
          advancedFromRef.current.add(hi)
          schedule(() => advanceAceHands(hi + 1), scaledDelay(600))
        }
      }, scaledDelay(600))

      return
    }
  }, [humanHands, activeHandIndex, gameStep, betOfHand, config, handDoubled, updateHandCards, advanceToNextHand, advanceAceHands, recorder, schedule, setActive, persist])

  // ─── Count Check ───────────────────────────────────

  /** Whether the count check on screen has already been answered. */
  const countSubmittedRef = useRef(false)

  const submitCount = useCallback(() => {
    const engine = engineRef.current
    if (!engine || endedRef.current) return
    // Once per check. Enter submits, and a second Enter — pressed to get past
    // the feedback — submitted again and scheduled a second `proceedAfterHand`
    // two seconds behind the first. By then the next hand had been bet and
    // dealt; the second callback wiped it, kept the bet, and left its unseen
    // cards in the engine's count, so every later check was wrong.
    if (countSubmittedRef.current) return
    countSubmittedRef.current = true

    const rc = parseInt(rcInput) || 0
    const tc = parseFloat(tcInput) || 0

    const validation = engine.validateCountInput(rc, tc)
    setCountFeedback({
      rcCorrect: validation.rcCorrect,
      tcCorrect: validation.tcCorrect,
      actualRC: engine.getRunningCount(),
      actualTC: engine.getTrueCount(),
    })

    recorder?.recordCountCheck(
      engine.getCurrentHandNumber(), rc, engine.getRunningCount(),
      tc, engine.getTrueCount(),
    )

    const lastHand = engine.getHandHistory().slice(-1)[0]
    if (lastHand) {
      lastHand.countChecked = true
      lastHand.playerRC = rc
      lastHand.playerTC = tc
      lastHand.rcCorrect = validation.rcCorrect
      lastHand.tcCorrect = validation.tcCorrect
      lastHand.rcError = validation.rcError
      lastHand.tcError = validation.tcError
      // The answer belongs to the hand already saved.
      persist()
    }

    if (validation.rcCorrect && validation.tcCorrect) {
      soundEngine.correct()
    } else {
      soundEngine.wrong()
    }

    schedule(() => {
      if (config.trainingMode && handRecordRef.current._built) {
        setHandReview(handRecordRef.current._built as PlayerHandRecord)
        setGameStep('hand_review')
      } else {
        proceedAfterHand()
      }
    }, 2000)
    // `proceedAfterHand` cannot go in here: it is declared *below* this callback,
    // so naming it in the dependency array is a temporal-dead-zone ReferenceError.
    // The linter's suggestion is not merely unwise here, it does not run.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- declared later; naming it here throws
  }, [rcInput, tcInput, config, recorder, persist])

  // ─── Next Hand / End ───────────────────────────────

  const proceedAfterHand = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return

    // A reached target does not end the session here: the table goes back to
    // betting and asks there (cash out or keep playing). Only running out of
    // money ends it on its own — there is no next bet to ask about — and a
    // table the house has closed (the free trial's hands are used up).
    if (engine.getHumanBankroll() < config.minBet || houseRef.current?.isClosed?.()) {
      endSession()
      return
    }

    // Only NOW — when the player leaves the finished hand — are its cards
    // collected into the discard tray (the cards were still on the table until
    // this point). A fresh shoe resets the tray in confirmBet.
    setDiscardCount(engine.getCardsDealt())

    resetRoundState()
    // The cut card came out during that round: the shoe is shuffled now,
    // before the next bet, as at a table. The count the player sees while
    // betting is then the count the bet is played at.
    if (engine.reshuffleAfterRound()) {
      setDiscardCount(0)
      setShowReshuffle(true)
      window.setTimeout(() => setShowReshuffle(false), 1800)
    }
    setSeats([...engine.getSeats()])
    setGameStep('betting')
    // Back at the betting step, shuffle done if one was due: the table exactly
    // as a resume will show it.
    persist()
  }, [config, endSession, resetRoundState, persist])

  const nextHand = useCallback(() => {
    const engine = engineRef.current
    if (endedRef.current) return
    if (!engine) { proceedAfterHand(); return }

    if (gameStep === 'settlement') {
      if (engine.shouldCheckCount(engine.getCurrentHandNumber())) {
        setCountFeedback(null)
        setRcInput('')
        setTcInput('')
        countSubmittedRef.current = false
        setGameStep('count_check')
        return
      }
      if (config.trainingMode && handRecordRef.current._built) {
        setHandReview(handRecordRef.current._built as PlayerHandRecord)
        setGameStep('hand_review')
        return
      }
    }
    proceedAfterHand()
  }, [gameStep, config, proceedAfterHand])

  /** What the hands may carry together, and the bets fitted to it. */
  const fitBets = (bets: number[]): number[] => {
    const funds = engineRef.current ? engineRef.current.getHumanBankroll() : 0
    if (bets.reduce((a, b) => a + b, 0) <= funds) return bets
    // More hands may leave less for each: then what there is, shared evenly.
    const each = Math.min(config.maxBet, Math.floor(funds / bets.length))
    return bets.map(() => (each >= config.minBet ? each : 0))
  }
  /** How many hands the bankroll and the free seats allow. */
  const handsAllowed = (): number => {
    const engine = engineRef.current
    if (!engine) return 1
    return Math.max(1, Math.min(MAX_PLAYER_HANDS, engine.getFreeSeats().length, Math.floor(engine.getHumanBankroll() / config.minBet)))
  }

  /**
   * Take this many hands: the player's own seat and the free seats nearest to
   * it. A hand that is opened starts with the bet of the selected hand (or the
   * last one).
   */
  const setBoxes = (wanted: number) => {
    const engine = engineRef.current
    if (!engine) return
    const hands = Math.max(1, Math.min(handsAllowed(), Math.floor(wanted) || 1))
    // Grow and shrink from the seats the player holds. Rebuilding them as
    // "own seat and its neighbours" moved hands off the seats that had been
    // chosen and left each bet on whatever seat now had its index — $100 put
    // on the first seat turned up two seats along.
    const own = engine.getHumanSeatIndex()
    const held = boxSeatsRef.current.map((seat, i) => ({ seat, bet: boxBetsRef.current[i] ?? 0 }))
    const seed = boxBetsRef.current[selectedBoxRef.current ?? boxBetsRef.current.length - 1] ?? 0
    while (held.length > hands) {
      // The hand furthest from the player's own seat goes first; the own seat last.
      const far = held.reduce((a, b) => (Math.abs(b.seat - own) > Math.abs(a.seat - own) ? b : a))
      held.splice(held.indexOf(far), 1)
    }
    while (held.length < hands) {
      const taken = new Set(held.map(h => h.seat))
      const free = engine.getFreeSeats().filter(s => !taken.has(s))
        .sort((a, b) => Math.abs(a - own) - Math.abs(b - own) || b - a)
      if (free.length === 0) break
      held.push({ seat: free[0], bet: seed })
    }
    held.sort((a, b) => a.seat - b.seat)
    applySeats(held.map(h => h.seat))
    applyBets(fitBets(held.map(h => h.bet)))
    applySelected(null)
  }

  /** Open a hand on a free seat; it starts with the bet of the selected hand, or its neighbour's. */
  const openBoxAt = (seat: number) => {
    const engine = engineRef.current
    if (!engine || gameStep !== 'betting') return
    const seats = boxSeatsRef.current
    if (seats.includes(seat) || !engine.getFreeSeats().includes(seat) || seats.length >= handsAllowed()) return
    const next = [...seats, seat].sort((a, b) => a - b)
    const at = next.indexOf(seat)
    const current = boxBetsRef.current
    const seed = current[selectedBoxRef.current ?? Math.max(0, at - 1)] ?? current[0] ?? 0
    const bets = [...current]
    bets.splice(at, 0, seed)
    applySeats(next)
    applyBets(fitBets(bets))
    applySelected(null)
    soundEngine.chipPlace()
  }

  /** Take a hand off the table (never the last one). */
  const closeBox = (box: number) => {
    const seats = boxSeatsRef.current
    if (seats.length <= 1 || box < 0 || box >= seats.length || gameStep !== 'betting') return
    applySeats(seats.filter((_, i) => i !== box))
    applyBets(boxBetsRef.current.filter((_, i) => i !== box))
    applySelected(null)
  }

  // ─── Build Visible State ───────────────────────────

  const state: VisibleState = {
    gameStep,
    isPaused,
    elapsedSeconds,
    humanHands,
    humanHandInfo: handInfo,
    boxes,
    surrenderedHands,
    humanBoxSettlements: boxSettlements,
    activeHandIndex,
    dealerCards,
    dealerHoleRevealed,
    seats,
    botResults,
    botStatuses,
    activeBotId,
    botVisibleCards,
    humanVisibleCards,
    currentBet: boxBets[gameStep === 'betting' ? (selectedBox ?? 0) : (handInfo[activeHandIndex]?.box ?? 0)] ?? 0,
    boxBets,
    boxSeats,
    freeSeats: engineRef.current?.getFreeSeats() ?? [config.playerSeatIndex],
    selectedBox,
    insuranceBox,
    humanSettlement,
    showInsurance,
    isSurrendered: surrenderedHands.size > 0,
    handDoubled,
    rcInput,
    tcInput,
    countFeedback,
    handReview,
    showReshuffle,
    botActiveSplitHands,
    botSplitHands,
    limitReached: sessionLimitReached(config, engineRef.current?.getCurrentHandNumber() ?? 0, elapsedSeconds, keptPlaying),
    closedElsewhere,
  }

  const actions: GameActions = {
    confirmBet,
    handleAction,
    handleInsurance,
    submitCount,
    nextHand,
    setBet: (bet: number) => {
      // On the selected hand, or on every hand when none is singled out.
      const sel = selectedBoxRef.current
      applyBets(boxBetsRef.current.map((b, i) => (sel === null || sel === i ? bet : b)))
    },
    setBoxes,
    selectBox: (box: number | null) => {
      if (box === null || box < 0 || box >= boxesRef.current || box === selectedBoxRef.current) applySelected(null)
      else applySelected(box)
    },
    closeBox,
    openBoxAt,
    setRcInput,
    setTcInput,
    setPaused: setIsPaused,
    quitSession: endSession,
    discardSession,
    keepPlaying: () => { keptPlayingRef.current = true; setKeptPlaying(true); persist() },
  }

  return {
    state,
    actions,
    seatLayout,
    shoeProgress,
    cardsRemaining,
    cardsDealt,
    totalCards,
    bankroll: engineRef.current?.getHumanBankroll() ?? 0,
    handNum: engineRef.current?.getCurrentHandNumber() ?? 0,
    discardCount,
    initSession,
  }
}
