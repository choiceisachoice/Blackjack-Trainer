import { useState, useCallback, useRef, useMemo } from 'react'
import { soundEngine } from '../../services/sound-engine'
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
  DealResult,
} from '../../engine/casino-session/types'
import type { SessionRecorder } from '../../services/session-recorder'
import type { GameStep, BotStatus } from './helpers'
import { formatDollar } from './helpers'
import { useStepAnimation, type AnimStep } from './useStepAnimation'

// ─── Visible State ───────────────────────────────────

export interface VisibleState {
  gameStep: GameStep
  isPaused: boolean
  elapsedSeconds: number

  humanHands: Card[][]
  activeHandIndex: number
  dealerCards: Card[]
  dealerHoleRevealed: boolean
  seats: (BotPlayer | null)[]
  botResults: BotRoundResult[]
  botStatuses: Record<string, BotStatus>
  activeBotId: string | null
  botVisibleCards: Record<string, number>
  humanVisibleCards: number

  currentBet: number
  humanSettlement: { label: string; profit: number } | null
  settlementMsg: string | null

  showInsurance: boolean
  isSurrendered: boolean
  handDoubled: Set<number>

  rcInput: string
  tcInput: string
  countFeedback: { rcCorrect: boolean; tcCorrect: boolean; actualRC: number; actualTC: number } | null

  handReview: PlayerHandRecord | null
  showReshuffle: boolean
  botActiveSplitHands: Record<string, number>
  botSplitVisibleCards: Record<string, number[]>
}

// ─── Game Actions ────────────────────────────────────

export interface GameActions {
  confirmBet: () => void
  handleAction: (action: Action) => void
  handleInsurance: (take: boolean) => void
  submitCount: () => void
  nextHand: () => void
  setBet: (bet: number) => void
  setRcInput: (v: string) => void
  setTcInput: (v: string) => void
  setPaused: (v: boolean) => void
  quitSession: () => void
}

// ─── Seat Layout ─────────────────────────────────────

interface SeatLayoutEntry {
  type: 'bot' | 'human'
  bot?: BotPlayer
  seatIndex: number
}

// ─── Hook ────────────────────────────────────────────

export function useGameLoop(
  config: CasinoSessionConfig,
  recorder: SessionRecorder | null,
  onSessionEnd: (result: CasinoSessionResult) => void,
) {
  const engineRef = useRef<CasinoSessionEngine | null>(null)
  const startTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dealResultRef = useRef<DealResult | null>(null)
  const handRecordRef = useRef<Partial<PlayerHandRecord> & { _built?: unknown }>({})
  const decisionsRef = useRef<{ action: string; correctAction: string; isCorrect: boolean; cardReceived?: Card; handValueAfter: number; handIndex?: number }[]>([])
  const postHumanBotsRef = useRef<number[]>([])

  // Shadow refs for stale closure avoidance
  const currentBetRef = useRef(0)
  const humanHandsRef = useRef<Card[][]>([[]])
  const handDoubledRef = useRef<Set<number>>(new Set())
  const isSurrenderedRef = useRef(false)
  const prevDealerCardCount = useRef(0)

  // Step animation
  const animation = useStepAnimation()

  // ─── State ─────────────────────────────────────────

  const [gameStep, setGameStep] = useState<GameStep>('betting')
  const [isPaused, setIsPaused] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const [humanHands, setHumanHands] = useState<Card[][]>([[]])
  const [activeHandIndex, setActiveHandIndex] = useState(0)
  const [dealerCards, setDealerCards] = useState<Card[]>([])
  const [dealerHoleRevealed, setDealerHoleRevealed] = useState(false)
  const [seats, setSeats] = useState<(BotPlayer | null)[]>([])
  const [botResults, setBotResults] = useState<BotRoundResult[]>([])
  const [botStatuses, setBotStatuses] = useState<Record<string, BotStatus>>({})
  const [activeBotId, setActiveBotId] = useState<string | null>(null)
  const [botVisibleCards, setBotVisibleCards] = useState<Record<string, number>>({})
  const [humanVisibleCards, setHumanVisibleCards] = useState(999)

  const [currentBet, setCurrentBet] = useState(0)
  const [humanSettlement, setHumanSettlement] = useState<{ label: string; profit: number } | null>(null)
  const [settlementMsg, setSettlementMsg] = useState<string | null>(null)

  const [showInsurance, setShowInsurance] = useState(false)
  const [isSurrendered, setIsSurrendered] = useState(false)
  const [handDoubled, setHandDoubled] = useState<Set<number>>(new Set())

  const [rcInput, setRcInput] = useState('')
  const [tcInput, setTcInput] = useState('')
  const [countFeedback, setCountFeedback] = useState<{ rcCorrect: boolean; tcCorrect: boolean; actualRC: number; actualTC: number } | null>(null)

  const [handReview, setHandReview] = useState<PlayerHandRecord | null>(null)
  const [showReshuffle, setShowReshuffle] = useState(false)
  const [botActiveSplitHands, setBotActiveSplitHands] = useState<Record<string, number>>({})
  const [botSplitVisibleCards, setBotSplitVisibleCards] = useState<Record<string, number[]>>({})

  // ─── Derived ───────────────────────────────────────

  const humanCards = humanHands[activeHandIndex] ?? []

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

  const shoeProgress = useMemo(() => {
    const engine = engineRef.current
    if (!engine) return 0
    return engine.getCardsDealt() / engine.getTotalCards()
  }, [gameStep, elapsedSeconds])

  const totalCards = config.numDecks * 52

  const cardsRemaining = useMemo(() => {
    const engine = engineRef.current
    if (!engine) return totalCards
    return engine.getTotalCards() - engine.getCardsDealt()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStep, elapsedSeconds, humanHands, dealerCards, totalCards])

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
    setActiveHandIndex(0)
    setDealerCards([])
    setDealerHoleRevealed(false)
    setBotResults([])
    setShowInsurance(false)
    setIsSurrendered(false)
    setHandDoubled(new Set())
    setCountFeedback(null)
    setHandReview(null)
    setSettlementMsg(null)
    setHumanSettlement(null)
    setShowReshuffle(false)
    setBotVisibleCards({})
    setHumanVisibleCards(999)
    setActiveBotId(null)
    setBotActiveSplitHands({})
    setBotSplitVisibleCards({})
    setCurrentBet(0)
    currentBetRef.current = 0
    humanHandsRef.current = [[]]
    handDoubledRef.current = new Set()
    isSurrenderedRef.current = false
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
  }, [animation])

  const updateHandCards = useCallback((idx: number, newCards: Card[]) => {
    setHumanHands(prev => {
      const updated = [...prev]
      updated[idx] = newCards
      humanHandsRef.current = updated
      return updated
    })
  }, [])

  // ─── Session Lifecycle ─────────────────────────────

  const initSession = useCallback(() => {
    const engine = new CasinoSessionEngine(config, recorder ?? undefined)
    engineRef.current = engine
    startTimeRef.current = Date.now()
    setElapsedSeconds(0)
    setGameStep('betting')
    setSeats(engine.getSeats())
    setBotStatuses({})
    resetRoundState()

    // Start timer
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
  }, [config, recorder, resetRoundState])

  const endSession = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    const sessionResult = engine.calculateSessionResult(startTimeRef.current, Date.now())
    onSessionEnd(sessionResult)
  }, [onSessionEnd])

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

    if (profit > 0) {
      soundEngine.chipCollect()
      soundEngine.correct()
    } else if (profit < 0) {
      soundEngine.wrong()
    }

    const playerValue = playerCards.length > 0 ? getHandValue(playerCards).best : 0
    const dealerValue = finalDealerCards.length > 0 ? getHandValue(finalDealerCards).best : 0
    const playerHasBJ = isBlackjack(playerCards)
    const dealerHasBJ = isBlackjack(finalDealerCards)
    recorder?.recordSettlement(
      'human', handResult, profit, playerValue, playerHasBJ,
      dealerValue, dealerHasBJ, currentBetRef.current,
      engine.getCurrentHandNumber(),
    )

    const resultLabel = handResult === 'blackjack' ? 'Blackjack!'
      : handResult === 'win' ? 'Win'
      : handResult === 'loss' ? 'Loss'
      : handResult === 'push' ? 'Push'
      : 'Surrender'

    const sign = profit > 0 ? '+' : ''
    setSettlementMsg(`${resultLabel} ${sign}${formatDollar(profit)}`)
    setHumanSettlement({ label: resultLabel, profit })
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
    handRecordRef.current._built = record as unknown
  }, [recorder])

  const settleDealerRound = useCallback((finalDealerCards: Card[]) => {
    const engine = engineRef.current
    if (!engine) return

    const hands = humanHandsRef.current
    const bet = currentBetRef.current
    const doubled = handDoubledRef.current
    const surrendered = isSurrenderedRef.current
    const dealerValue = finalDealerCards.length > 0 ? getHandValue(finalDealerCards).best : 0
    const dealerHasBJ = isBlackjack(finalDealerCards)
    const hn = engine.getCurrentHandNumber()

    let totalProfit = 0
    let lastResult = 'push'
    for (let i = 0; i < hands.length; i++) {
      const hCards = hands[i]
      const isD = doubled.has(i)
      const handBet = isD ? bet * 2 : bet
      const { result: handResult, profit } = engine.settleHand(
        hCards,
        finalDealerCards,
        handBet,
        isD,
        i === 0 && surrendered,
        hands.length > 1,
      )
      totalProfit += profit
      lastResult = handResult

      if (hands.length > 1) {
        const pv = getHandValue(hCards).best
        recorder?.recordSettlement(
          `human_split_${i + 1}`, handResult, profit, pv,
          isBlackjack(hCards) && hands.length === 1,
          dealerValue, dealerHasBJ, handBet, hn,
        )
      }
    }

    if (hands.length > 1) {
      if (totalProfit > 0) lastResult = 'win'
      else if (totalProfit < 0) lastResult = 'loss'
      else lastResult = 'push'
    }

    const totalBet = hands.reduce((sum, _, i) => {
      const isD = doubled.has(i)
      return sum + (isD ? bet * 2 : bet)
    }, 0)
    engine.updateHumanBankroll(totalBet + totalProfit)

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

    settleRoundCore(lastResult, totalProfit, hands[0] ?? [], finalDealerCards, bResults)
  }, [recorder, settleRoundCore])

  // ─── Animation Step Builders ───────────────────────

  const buildBotAnimSteps = useCallback((bot: BotPlayer, initialCardCount: number): AnimStep[] => {
    const engine = engineRef.current
    if (!engine) return []

    const updatedBot = engine.getSeats()[bot.seatIndex]
    if (!updatedBot) return []

    const steps: AnimStep[] = []

    // Blackjack
    if (updatedBot.hands[0] && isBlackjack(updatedBot.hands[0].cards)) {
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

    // ─── Split: casino-accurate per-hand sequential animation ───
    // Engine already computed all split results. We animate them
    // one hand at a time, with IDENTICAL timings to normal play.
    if (updatedBot.hands.length > 1) {
      const numHands = updatedBot.hands.length
      const botId = updatedBot.id

      // ═══ PHASE 1: "Split" announcement (1.5s) ═══
      steps.push({
        execute: () => {
          setBotStatuses(prev => ({ ...prev, [botId]: 'split' }))
          soundEngine.chipPlace()
        },
        delayMs: 1500,
      })

      // ═══ PHASE 2: Cards slide apart (1.0s) ═══
      // Show exactly 2 hands with 1 card each. Hand 0 active, rest dimmed.
      // For re-splits (3+ hands), extra hands revealed later during play.
      const visArr: number[] = new Array(numHands).fill(0)
      visArr[0] = 1
      visArr[1] = 1
      steps.push({
        execute: () => {
          setBotSplitVisibleCards(prev => ({ ...prev, [botId]: [...visArr] }))
          setBotActiveSplitHands(prev => ({ ...prev, [botId]: 0 }))
        },
        delayMs: 1000,
      })

      // ═══ PHASE 3: Play each hand sequentially ═══
      for (let h = 0; h < numHands; h++) {
        const hand = updatedBot.hands[h]
        const hIdx = h
        const isAcesSplit = hand.cards[0]?.rank === 'A' && hand.isSplit

        // Re-split: reveal this hand if not yet visible (h >= 2)
        if (h >= 2) {
          steps.push({
            execute: () => {
              setBotStatuses(prev => ({ ...prev, [botId]: 'split' }))
              soundEngine.chipPlace()
              setBotSplitVisibleCards(prev => {
                const arr = [...(prev[botId] ?? visArr)]
                arr[hIdx] = 1
                return { ...prev, [botId]: arr }
              })
            },
            delayMs: 1500,
          })
        }

        // ─── Activate this hand (0.5s) ───
        steps.push({
          execute: () => {
            setBotActiveSplitHands(prev => ({ ...prev, [botId]: hIdx }))
          },
          delayMs: 500,
        })

        // ─── Deal second card to this hand (0.8s) ───
        if (hand.cards.length >= 2) {
          const revealH = hIdx
          steps.push({
            execute: () => {
              setBotSplitVisibleCards(prev => {
                const arr = [...(prev[botId] ?? visArr)]
                arr[revealH] = 2
                return { ...prev, [botId]: arr }
              })
              soundEngine.cardDeal()
            },
            delayMs: 800,
          })
        }

        // ─── Check 21 after second card (e.g. split 10s + A) ───
        let handComplete = false
        if (hand.cards.length >= 2) {
          const valAfterDeal = getHandValue(hand.cards.slice(0, 2)).best
          if (valAfterDeal === 21) {
            steps.push({
              execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'twentyone' })),
              delayMs: 600,
            })
            handComplete = true
          }
        }

        // ─── Aces: auto-stand per casino rules (no decision) ───
        if (!handComplete && isAcesSplit) {
          steps.push({
            execute: () => {
              setBotStatuses(prev => ({ ...prev, [botId]: 'stand' }))
              soundEngine.buttonClick()
            },
            delayMs: 600,
          })
        }
        // ─── Double (Think 1.5-2.3s → "Double" 0.7s → Card 0.8s) ───
        else if (!handComplete && hand.isDoubled) {
          steps.push({
            execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'thinking' })),
            delayMs: 1500 + Math.floor(Math.random() * 800),
          })
          steps.push({
            execute: () => {
              setBotStatuses(prev => ({ ...prev, [botId]: 'double' }))
              soundEngine.chipPlace()
            },
            delayMs: 700,
          })
          if (hand.cards.length >= 3) {
            const revealH = hIdx
            steps.push({
              execute: () => {
                setBotSplitVisibleCards(prev => {
                  const arr = [...(prev[botId] ?? visArr)]
                  arr[revealH] = 3
                  return { ...prev, [botId]: arr }
                })
                soundEngine.cardDeal()
              },
              delayMs: 800,
            })
          }
          if (hand.isBusted) {
            steps.push({
              execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'bust' })),
              delayMs: 1000,
            })
          } else {
            const valAfterDouble = getHandValue(hand.cards).best
            if (valAfterDouble === 21) {
              steps.push({
                execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'twentyone' })),
                delayMs: 600,
              })
            }
          }
        }
        // ─── Regular play: hits + stand/bust ───
        else if (!handComplete) {
          // Each hit: Think (1.5-2.3s) → "Hit" (0.5s) → Card (0.8s)
          let reached21 = false
          for (let c = 2; c < hand.cards.length; c++) {
            const visCount = c + 1
            const revealH = hIdx
            // Think
            steps.push({
              execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'thinking' })),
              delayMs: 1500 + Math.floor(Math.random() * 800),
            })
            // "Hit" label FIRST
            steps.push({
              execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'hit' })),
              delayMs: 500,
            })
            // Reveal card SECOND
            steps.push({
              execute: () => {
                setBotSplitVisibleCards(prev => {
                  const arr = [...(prev[botId] ?? visArr)]
                  arr[revealH] = visCount
                  return { ...prev, [botId]: arr }
                })
                soundEngine.cardDeal()
              },
              delayMs: 800,
            })

            // Check 21 after card
            const valAfterHit = getHandValue(hand.cards.slice(0, visCount)).best
            if (valAfterHit === 21) {
              steps.push({
                execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'twentyone' })),
                delayMs: 600,
              })
              reached21 = true
              break
            }
          }

          // Final outcome
          if (!reached21) {
            if (hand.isBusted) {
              // Bust (1.0s)
              steps.push({
                execute: () => setBotStatuses(prev => ({ ...prev, [botId]: 'bust' })),
                delayMs: 1000,
              })
            } else {
              // Stand: Think (1.5-2.3s) → "Stand" (0.7s)
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
        }

        // ─── Pause between hands (0.8s) ───
        if (h < numHands - 1) {
          steps.push({ execute: () => {}, delayMs: 800 })
        }
      }

      // ═══ PHASE 4: Bot done — all hands visible, no active hand ═══
      steps.push({
        execute: () => {
          setActiveBotId(null)
          setBotActiveSplitHands(prev => ({ ...prev, [botId]: -1 }))
          setBotSplitVisibleCards(prev => ({
            ...prev,
            [botId]: updatedBot.hands.map(hnd => hnd.cards.length),
          }))
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
  }, [buildBotAnimSteps])

  const buildDealerSteps = useCallback((): AnimStep[] => {
    const engine = engineRef.current
    const dr = dealResultRef.current
    if (!engine || !dr) return []

    const originalDealerCards: Card[] = [dr.dealerUpCard, dr.dealerHoleCard]
    const finalDealerCards = engine.playDealerHand([...originalDealerCards])

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
  }, [recorder, settleDealerRound])

  // ─── Post-Human Flow ───────────────────────────────

  const runPostHumanFlow = useCallback(() => {
    const dr = dealResultRef.current
    if (!dr) return

    const steps: AnimStep[] = []

    const postBots = postHumanBotsRef.current
    if (postBots.length > 0) {
      steps.push(...computeBotsAndBuildSteps(postBots, dr.dealerUpCard))
    }
    steps.push(...buildDealerSteps())

    animation.run(steps)
  }, [animation, computeBotsAndBuildSteps, buildDealerSteps])

  // ─── Advance To Next Hand ──────────────────────────

  const advanceToNextHand = useCallback(() => {
    const engine = engineRef.current
    const currentActiveHandIndex = activeHandIndex
    const currentHumanHands = humanHands

    if (currentActiveHandIndex < currentHumanHands.length - 1 && engine) {
      const nextIdx = currentActiveHandIndex + 1
      const nextHand = currentHumanHands[nextIdx]

      if (nextHand && nextHand.length === 1) {
        const newCard = engine.drawCard()
        soundEngine.cardDeal()
        updateHandCards(nextIdx, [...nextHand, newCard])
        setTimeout(() => setActiveHandIndex(nextIdx), 500)
      } else {
        setActiveHandIndex(nextIdx)
      }
    } else {
      runPostHumanFlow()
    }
  }, [activeHandIndex, humanHands, updateHandCards, runPostHumanFlow])

  // ─── Betting Phase ─────────────────────────────────

  const confirmBet = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return

    const bet = currentBet || config.minBet
    const clampedBet = Math.min(bet, config.maxBet, engine.getHumanBankroll())
    if (clampedBet < config.minBet) return

    const tc = engine.getTrueCount()
    const rc = engine.getRunningCount()
    const correctBet = engine.getCorrectBet(tc)
    const betCorrect = engine.isBetCorrect(clampedBet, correctBet)

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

    engine.deductHumanBet(clampedBet)
    setCurrentBet(clampedBet)
    currentBetRef.current = clampedBet

    const dealResult = engine.dealNewRound()
    dealResultRef.current = dealResult

    // Reshuffle handled as leading animation steps (Fix 5)

    prevDealerCardCount.current = 0

    setHumanHands([dealResult.humanCards])
    humanHandsRef.current = [dealResult.humanCards]
    setActiveHandIndex(0)
    setDealerCards([])
    setSeats([...engine.getSeats()])
    setHandDoubled(new Set())
    handDoubledRef.current = new Set()
    setIsSurrendered(false)
    isSurrenderedRef.current = false

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

    // Round 1: first card to each seat, then dealer
    for (const seat of currentSeatLayout) {
      if (seat.type === 'bot' && seat.bot) {
        const botId = seat.bot.id
        steps.push({
          execute: () => {
            setBotVisibleCards(prev => ({ ...prev, [botId]: 1 }))
            soundEngine.cardDeal()
          },
          delayMs: 500,
        })
      } else if (seat.type === 'human') {
        steps.push({
          execute: () => {
            setHumanVisibleCards(1)
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

    // Round 2: second card to each seat, then dealer hole card
    for (const seat of currentSeatLayout) {
      if (seat.type === 'bot' && seat.bot) {
        const botId = seat.bot.id
        steps.push({
          execute: () => {
            setBotVisibleCards(prev => ({ ...prev, [botId]: 2 }))
            soundEngine.cardDeal()
          },
          delayMs: 500,
        })
      } else if (seat.type === 'human') {
        steps.push({
          execute: () => {
            setHumanVisibleCards(2)
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
        setShowInsurance(true)
        setGameStep('insurance')
        return
      }

      // ─── Player Blackjack (no dealer BJ possible at this point) ─
      if (isBlackjack(dealResult.humanCards)) {
        const allBotSeats = currentSeatLayout
          .filter(s => s.type === 'bot')
          .map(s => s.seatIndex)
        const botSteps = allBotSeats.length > 0
          ? computeBotsAndBuildSteps(allBotSeats, dealResult.dealerUpCard)
          : []
        const dealerSteps = buildDealerSteps()
        animation.run([...botSteps, ...dealerSteps])
        return
      }

      // Normal — compute pre-human bots, then human_playing
      const preHumanBots = currentSeatLayout
        .filter(s => s.type === 'bot' && s.seatIndex < config.playerSeatIndex)
        .map(s => s.seatIndex)
      const postHumanBots = currentSeatLayout
        .filter(s => s.type === 'bot' && s.seatIndex > config.playerSeatIndex)
        .map(s => s.seatIndex)
      postHumanBotsRef.current = postHumanBots

      if (preHumanBots.length > 0) {
        const preSteps = computeBotsAndBuildSteps(preHumanBots, dealResult.dealerUpCard)
        animation.run(preSteps, () => setGameStep('human_playing'))
      } else {
        setGameStep('human_playing')
      }
    })
  }, [currentBet, config, seatLayout, animation, computeBotsAndBuildSteps, buildDealerSteps, settleDealerRound, recorder])

  // ─── Insurance ─────────────────────────────────────

  const handleInsurance = useCallback((take: boolean) => {
    const engine = engineRef.current
    const dr = dealResultRef.current
    if (!engine || !dr) return

    const tc = engine.getTrueCount()
    const correctInsurance = engine.getCorrectInsurance(tc)

    handRecordRef.current.insuranceOffered = true
    handRecordRef.current.playerTookInsurance = take
    handRecordRef.current.correctInsuranceDecision = take === correctInsurance
    handRecordRef.current.trueCountAtInsurance = tc

    recorder?.recordInsurance(take, tc, take === correctInsurance, engine.getCurrentHandNumber())

    setShowInsurance(false)

    if (isBlackjack([dr.dealerUpCard, dr.dealerHoleCard])) {
      setDealerHoleRevealed(true)
      setGameStep('dealer_playing')

      // Count hole card and get final dealer cards
      const finalDC = engine.playDealerHand([dr.dealerUpCard, dr.dealerHoleCard])

      // Insurance profit: 2:1 payout on half-bet side wager
      if (take) {
        engine.updateHumanBankroll(currentBetRef.current)
      }

      // Settle all hands (human + bots) via the standard path
      settleDealerRound(finalDC)
      return
    }

    const currentSeatLayout = seatLayout

    if (isBlackjack(humanHandsRef.current[0] ?? [])) {
      const allBotSeats = currentSeatLayout
        .filter(s => s.type === 'bot')
        .map(s => s.seatIndex)
      const botSteps = allBotSeats.length > 0
        ? computeBotsAndBuildSteps(allBotSeats, dr.dealerUpCard)
        : []
      const dealerSteps = buildDealerSteps()
      animation.run([...botSteps, ...dealerSteps])
    } else {
      const preHumanBots = currentSeatLayout
        .filter(s => s.type === 'bot' && s.seatIndex < config.playerSeatIndex)
        .map(s => s.seatIndex)
      const postHumanBots = currentSeatLayout
        .filter(s => s.type === 'bot' && s.seatIndex > config.playerSeatIndex)
        .map(s => s.seatIndex)
      postHumanBotsRef.current = postHumanBots

      if (preHumanBots.length > 0) {
        const preSteps = computeBotsAndBuildSteps(preHumanBots, dr.dealerUpCard)
        animation.run(preSteps, () => setGameStep('human_playing'))
      } else {
        setGameStep('human_playing')
      }
    }
  }, [currentBet, seatLayout, config.playerSeatIndex, animation, computeBotsAndBuildSteps, buildDealerSteps, recorder, settleDealerRound])

  // ─── Human Play ────────────────────────────────────

  const handleAction = useCallback((action: Action) => {
    const engine = engineRef.current
    const dr = dealResultRef.current
    if (!engine || !dr || gameStep !== 'human_playing') return

    const cards = humanHands[activeHandIndex] ?? []
    if (cards.length < 2) return
    const canSplitHand = cards.length === 2 && isPair(cards) && humanHands.length < config.maxSplitHands && engine.getHumanBankroll() >= currentBet
    const isFirstAction = cards.length === 2
    const canSurrenderNow = isFirstAction && !isSurrendered && config.surrenderAllowed && humanHands.length === 1

    const tc = engine.getTrueCount()
    const { action: correctAction, isDeviation, deviationName } = engine.getCorrectAction(
      cards,
      dr.dealerUpCard,
      tc,
      canSplitHand,
      isFirstAction,
      canSurrenderNow,
    )

    const isCorrect = action === correctAction
    const decision = {
      action: action.toString(),
      correctAction: correctAction.toString(),
      isCorrect,
      cardReceived: undefined as Card | undefined,
      handValueAfter: getHandValue(cards).best,
      handIndex: activeHandIndex,
    }

    if (decisionsRef.current.length === 0) {
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

    recorder?.recordPlayerAction(
      'human', action.toString(), getHandValue(cards).best,
      formatCard(dr.dealerUpCard), correctAction.toString(),
      isCorrect, false, engine.getCurrentHandNumber(),
    )

    if (action === Action.Stand) {
      decision.handValueAfter = getHandValue(cards).best
      decisionsRef.current.push(decision)
      soundEngine.buttonClick()
      advanceToNextHand()
      return
    }

    if (action === Action.Hit) {
      const card = engine.drawCard()
      const newCards = [...cards, card]
      decision.cardReceived = card
      decision.handValueAfter = getHandValue(newCards).best
      decisionsRef.current.push(decision)
      updateHandCards(activeHandIndex, newCards)
      soundEngine.cardDeal()

      if (isBust(newCards)) {
        setTimeout(() => advanceToNextHand(), 600)
      }
      return
    }

    if (action === Action.Double) {
      if (!isFirstAction || engine.getHumanBankroll() < currentBet) {
        handleAction(Action.Hit)
        return
      }
      engine.deductHumanBet(currentBet)
      const newDoubled = new Set(handDoubled).add(activeHandIndex)
      setHandDoubled(newDoubled)
      handDoubledRef.current = newDoubled
      const card = engine.drawCard()
      const newCards = [...cards, card]
      decision.cardReceived = card
      decision.handValueAfter = getHandValue(newCards).best
      decisionsRef.current.push(decision)
      updateHandCards(activeHandIndex, newCards)
      soundEngine.cardDeal()
      soundEngine.chipPlace()
      setTimeout(() => advanceToNextHand(), 600)
      return
    }

    if (action === Action.Surrender) {
      if (!isFirstAction || !config.surrenderAllowed || humanHands.length > 1) return
      setIsSurrendered(true)
      isSurrenderedRef.current = true
      decision.handValueAfter = getHandValue(cards).best
      decisionsRef.current.push(decision)
      soundEngine.buttonClick()
      runPostHumanFlow()
      return
    }

    if (action === Action.Split) {
      if (!canSplitHand) return
      engine.deductHumanBet(currentBet)
      soundEngine.chipPlace()

      const card1 = cards[0]
      const card2 = cards[1]
      const isAces = card1.rank === 'A'

      const splitHands = [...humanHands]
      splitHands[activeHandIndex] = [card1]
      splitHands.splice(activeHandIndex + 1, 0, [card2])
      setHumanHands(splitHands)
      humanHandsRef.current = splitHands

      decision.handValueAfter = getHandValue([card1]).best
      decisionsRef.current.push(decision)

      const hi = activeHandIndex

      setTimeout(() => {
        const newCard1 = engine.drawCard()
        soundEngine.cardDeal()
        updateHandCards(hi, [card1, newCard1])
        setActiveHandIndex(hi)

        if (isAces) {
          // Check if re-split is possible on this hand
          if (canReSplitAces([card1, newCard1], humanHandsRef.current.length, config.maxSplitHands) &&
              engine.getHumanBankroll() >= currentBetRef.current) {
            // Player can re-split — hand shows [A, A], split button enabled
            return
          }

          // Auto-stand this hand. Advance through remaining ace-split hands.
          const advanceAceHands = (idx: number) => {
            const hands = humanHandsRef.current
            if (idx >= hands.length) {
              runPostHumanFlow()
              return
            }

            const hand = hands[idx]
            if (!hand || hand.length !== 1) {
              advanceAceHands(idx + 1)
              return
            }

            const nc = engine.drawCard()
            soundEngine.cardDeal()
            updateHandCards(idx, [...hand, nc])
            setActiveHandIndex(idx)

            // Check re-split for this hand
            if (canReSplitAces([hand[0], nc], humanHandsRef.current.length, config.maxSplitHands) &&
                engine.getHumanBankroll() >= currentBetRef.current) {
              // Player can re-split this hand
              return
            }

            // Auto-stand, advance to next after delay
            setTimeout(() => advanceAceHands(idx + 1), 600)
          }

          setTimeout(() => advanceAceHands(hi + 1), 600)
        }
      }, 600)

      return
    }
  }, [humanHands, activeHandIndex, gameStep, currentBet, config, isSurrendered, handDoubled, updateHandCards, advanceToNextHand, runPostHumanFlow, recorder])

  // ─── Count Check ───────────────────────────────────

  const submitCount = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return

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
    }

    if (validation.rcCorrect && validation.tcCorrect) {
      soundEngine.correct()
    } else {
      soundEngine.wrong()
    }

    setTimeout(() => {
      if (config.trainingMode && handRecordRef.current._built) {
        setHandReview(handRecordRef.current._built as PlayerHandRecord)
        setGameStep('hand_review')
      } else {
        proceedAfterHand()
      }
    }, 2000)
  }, [rcInput, tcInput, config, recorder])

  // ─── Next Hand / End ───────────────────────────────

  const proceedAfterHand = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return

    const handNum = engine.getCurrentHandNumber()

    if (config.sessionMode === 'hands' && handNum >= config.targetHands) {
      endSession()
      return
    }
    if (engine.getHumanBankroll() < config.minBet) {
      endSession()
      return
    }

    resetRoundState()
    setSeats([...engine.getSeats()])
    setGameStep('betting')
  }, [config, endSession, resetRoundState])

  const nextHand = useCallback(() => {
    const engine = engineRef.current
    if (!engine) { proceedAfterHand(); return }

    if (gameStep === 'settlement') {
      if (engine.shouldCheckCount(engine.getCurrentHandNumber())) {
        setCountFeedback(null)
        setRcInput('')
        setTcInput('')
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

  // ─── Build Visible State ───────────────────────────

  const state: VisibleState = {
    gameStep,
    isPaused,
    elapsedSeconds,
    humanHands,
    activeHandIndex,
    dealerCards,
    dealerHoleRevealed,
    seats,
    botResults,
    botStatuses,
    activeBotId,
    botVisibleCards,
    humanVisibleCards,
    currentBet,
    humanSettlement,
    settlementMsg,
    showInsurance,
    isSurrendered,
    handDoubled,
    rcInput,
    tcInput,
    countFeedback,
    handReview,
    showReshuffle,
    botActiveSplitHands,
    botSplitVisibleCards,
  }

  const actions: GameActions = {
    confirmBet,
    handleAction,
    handleInsurance,
    submitCount,
    nextHand,
    setBet: (bet: number) => { setCurrentBet(bet); currentBetRef.current = bet },
    setRcInput,
    setTcInput,
    setPaused: setIsPaused,
    quitSession: endSession,
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
    initSession,
  }
}
