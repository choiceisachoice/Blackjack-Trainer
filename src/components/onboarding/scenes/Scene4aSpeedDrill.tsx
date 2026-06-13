import { useSceneVisible } from '../useSceneVisible'
import { PlayingCard } from '../components/PlayingCard'

interface SceneProps {
  currentTime: number
}

type Suit = '\u2660' | '\u2665' | '\u2666' | '\u2663'

// 52-card sequence with realistic count variation (+4 to -3, ends at 0)
const CARD_SEQUENCE = [
  { rank: '3',  suit: '\u2660' as Suit, value: +1 },  // +1
  { rank: '5',  suit: '\u2665' as Suit, value: +1 },  // +2
  { rank: '2',  suit: '\u2666' as Suit, value: +1 },  // +3
  { rank: '6',  suit: '\u2663' as Suit, value: +1 },  // +4
  { rank: 'A',  suit: '\u2660' as Suit, value: -1 },  // +3
  { rank: 'K',  suit: '\u2665' as Suit, value: -1 },  // +2
  { rank: '4',  suit: '\u2666' as Suit, value: +1 },  // +3
  { rank: 'Q',  suit: '\u2663' as Suit, value: -1 },  // +2
  { rank: '7',  suit: '\u2660' as Suit, value:  0 },  // +2
  { rank: 'J',  suit: '\u2665' as Suit, value: -1 },  // +1
  { rank: '10', suit: '\u2666' as Suit, value: -1 },  //  0
  { rank: 'A',  suit: '\u2663' as Suit, value: -1 },  // -1
  { rank: 'K',  suit: '\u2660' as Suit, value: -1 },  // -2
  { rank: 'Q',  suit: '\u2665' as Suit, value: -1 },  // -3
  { rank: '2',  suit: '\u2663' as Suit, value: +1 },  // -2
  { rank: '5',  suit: '\u2660' as Suit, value: +1 },  // -1
  { rank: '8',  suit: '\u2665' as Suit, value:  0 },  // -1
  { rank: '3',  suit: '\u2666' as Suit, value: +1 },  //  0
  { rank: 'J',  suit: '\u2663' as Suit, value: -1 },  // -1
  { rank: '4',  suit: '\u2660' as Suit, value: +1 },  //  0
  { rank: '6',  suit: '\u2665' as Suit, value: +1 },  // +1
  { rank: '2',  suit: '\u2660' as Suit, value: +1 },  // +2
  { rank: '9',  suit: '\u2666' as Suit, value:  0 },  // +2
  { rank: '5',  suit: '\u2663' as Suit, value: +1 },  // +3
  { rank: 'K',  suit: '\u2666' as Suit, value: -1 },  // +2
  { rank: '3',  suit: '\u2663' as Suit, value: +1 },  // +3
  { rank: '10', suit: '\u2660' as Suit, value: -1 },  // +2
  { rank: '7',  suit: '\u2665' as Suit, value:  0 },  // +2
  { rank: 'A',  suit: '\u2666' as Suit, value: -1 },  // +1
  { rank: '4',  suit: '\u2663' as Suit, value: +1 },  // +2
  { rank: 'Q',  suit: '\u2660' as Suit, value: -1 },  // +1
  { rank: '6',  suit: '\u2666' as Suit, value: +1 },  // +2
  { rank: 'J',  suit: '\u2660' as Suit, value: -1 },  // +1
  { rank: '8',  suit: '\u2663' as Suit, value:  0 },  // +1
  { rank: '10', suit: '\u2665' as Suit, value: -1 },  //  0
  { rank: '5',  suit: '\u2666' as Suit, value: +1 },  // +1
  { rank: 'K',  suit: '\u2663' as Suit, value: -1 },  //  0
  { rank: '9',  suit: '\u2660' as Suit, value:  0 },  //  0
  { rank: '2',  suit: '\u2665' as Suit, value: +1 },  // +1
  { rank: 'A',  suit: '\u2663' as Suit, value: -1 },  //  0
  { rank: '7',  suit: '\u2666' as Suit, value:  0 },  //  0
  { rank: '3',  suit: '\u2665' as Suit, value: +1 },  // +1
  { rank: 'Q',  suit: '\u2666' as Suit, value: -1 },  //  0
  { rank: '6',  suit: '\u2660' as Suit, value: +1 },  // +1
  { rank: 'J',  suit: '\u2666' as Suit, value: -1 },  //  0
  { rank: '4',  suit: '\u2665' as Suit, value: +1 },  // +1
  { rank: '10', suit: '\u2663' as Suit, value: -1 },  //  0
  { rank: '8',  suit: '\u2660' as Suit, value:  0 },  //  0
  { rank: '9',  suit: '\u2665' as Suit, value:  0 },  //  0
  { rank: '5',  suit: '\u2660' as Suit, value: +1 },  // +1
  { rank: '8',  suit: '\u2666' as Suit, value:  0 },  // +1
  { rank: 'K',  suit: '\u2660' as Suit, value: -1 },  //  0 ← LAST
].map((card, i, arr) => ({
  ...card,
  runningCount: arr.slice(0, i + 1).reduce((sum, c) => sum + c.value, 0),
}))

const MODES_LIST = [
  { icon: '\u26A1', title: 'SPEED DRILL',        active: true  },
  { icon: '\u{1F0CF}', title: 'TABLE COUNTING',  active: false },
  { icon: '\u{1F9E0}', title: 'DEVIATION TRAINING', active: false },
  { icon: '\u{1F4B0}', title: 'BET SPREAD',      active: false },
  { icon: '\u{1F441}\uFE0F', title: 'DECK ESTIMATION', active: false },
  { icon: '\u{1F3B0}', title: 'CASINO SESSION',  active: false },
]

/** List zoom: scale 1→3 from rel 3-6, fade out at 5.5-6. */
function getListZoom(rel: number): { scale: number; opacity: number } {
  if (rel < 3) return { scale: 1, opacity: 1 }
  if (rel > 6) return { scale: 3, opacity: 0 }
  const progress = (rel - 3) / 3
  const scale = 1 + progress * 2
  const opacity = rel > 5.5 ? Math.max(0, 1 - (rel - 5.5) / 0.5) : 1
  return { scale, opacity }
}

/** Card index 0-51 during card phase (rel 7-17). */
function getCardIndex(rel: number): number {
  if (rel < 7 || rel > 17) return -1
  const progress = (rel - 7) / 10
  const eased = Math.pow(progress, 0.45)
  return Math.min(Math.floor(eased * 52), 51)
}

/** Card zoom: 1x→2.5x during card phase (rel 7-17). */
function getCardZoom(rel: number): number {
  if (rel < 7) return 1
  if (rel > 17) return 2.5
  const p = (rel - 7) / 10
  return 1 + p * 1.5
}

/** Card opacity: fade out at rel 17-18. */
function getCardFade(rel: number): number {
  if (rel < 17) return 1
  if (rel > 18) return 0
  return 1 - (rel - 17)
}

/** Scene 4a: "Speed Drill" (30-50s) — modes list → zoom → 52 flashing cards → text. */
export function Scene4aSpeedDrill({ currentTime }: SceneProps) {
  const { visible, opacity } = useSceneVisible(currentTime, 30, 50)
  const rel = currentTime - 30

  if (!visible && opacity === 0) return null

  // Modes list (rel 0-6.5)
  const listZoom = getListZoom(rel)
  const showList = rel < 6.5

  // Cards (rel 7-18)
  const cardIndex = getCardIndex(rel)
  const cardZoom = getCardZoom(rel)
  const cardFade = getCardFade(rel)
  const showCards = cardIndex >= 0 && rel < 18

  // Closing text (rel 18-20)
  const textOpacity = rel > 18 ? Math.min((rel - 18) / 0.8, 1) : 0

  const currentCard = cardIndex >= 0 ? CARD_SEQUENCE[cardIndex] : null
  const count = currentCard?.runningCount ?? 0
  const countColor = count > 0
    ? '#22c55e'
    : count < 0
    ? '#ef4444'
    : '#ffffff'

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity,
      overflow: 'hidden',
    }}>

      {/* Modes list */}
      {showList && (
        <div style={{
          transform: `scale(${listZoom.scale})`,
          transformOrigin: 'center 25%',
          opacity: listZoom.opacity,
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          padding: '0 60px',
          width: '100%',
          maxWidth: '500px',
        }}>
          {MODES_LIST.map((mode, i) => {
            const itemOpacity = Math.max(0, Math.min((rel - i * 0.15) / 0.4, 1))
            return (
              <div key={mode.title} style={{
                opacity: itemOpacity,
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}>
                <span style={{
                  fontSize: '1.1rem',
                  opacity: mode.active ? 1 : 0.35,
                }}>
                  {mode.icon}
                </span>
                <span style={{
                  color: mode.active ? '#ffffff' : 'rgba(255,255,255,0.35)',
                  fontSize: '0.85rem',
                  fontWeight: mode.active ? 700 : 400,
                  letterSpacing: '3px',
                  flex: 1,
                }}>
                  {mode.title}
                </span>
                <div style={{
                  height: '1px',
                  width: `${itemOpacity * 80}px`,
                  background: mode.active
                    ? 'rgba(212,168,67,0.6)'
                    : 'rgba(255,255,255,0.1)',
                }} />
              </div>
            )
          })}
        </div>
      )}

      {/* Cards + Count */}
      {showCards && currentCard && (
        <div style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          transform: `scale(${cardZoom})`,
          opacity: cardFade,
        }}>
          <PlayingCard
            rank={currentCard.rank}
            suit={currentCard.suit}
            size="lg"
          />
          <div style={{ textAlign: 'center' }}>
            <div style={{
              color: 'rgba(255,255,255,0.35)',
              fontSize: `${0.65 / cardZoom}rem`,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              marginBottom: '4px',
            }}>
              Count
            </div>
            <div style={{
              color: countColor,
              fontSize: `${2 / cardZoom}rem`,
              fontWeight: 800,
              textShadow: `0 0 20px ${countColor}60`,
            }}>
              {count > 0 ? `+${count}` : count}
            </div>
          </div>
        </div>
      )}

      {/* Closing text */}
      <div style={{
        position: 'absolute',
        opacity: textOpacity,
        textAlign: 'center',
        padding: '0 40px',
      }}>
        <div style={{
          fontSize: 'clamp(1.8rem, 4vw, 3rem)',
          fontWeight: 700,
          color: 'rgba(255,255,255,0.9)',
          marginBottom: '12px',
          lineHeight: 1.3,
        }}>
          Train your counting speed
        </div>
        <div style={{
          fontSize: 'clamp(1.8rem, 4vw, 3rem)',
          fontWeight: 700,
          color: '#d4a843',
          textShadow: '0 0 30px rgba(212,168,67,0.4)',
        }}>
          with flashing cards.
        </div>
      </div>
    </div>
  )
}
