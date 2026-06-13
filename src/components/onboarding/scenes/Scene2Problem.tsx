import { useSceneVisible, useDelayedVisible } from '../useSceneVisible'
import { PlayingCard } from '../components/PlayingCard'

interface SceneProps {
  currentTime: number
}

const CARDS: Array<{ rank: string; suit: '\u2660' | '\u2665' | '\u2663' }> = [
  { rank: 'K', suit: '\u2660' },
  { rank: 'Q', suit: '\u2665' },
  { rank: 'J', suit: '\u2663' },
]

/** Scene 2: "The Problem" (10-22s) — cards fly in, "Card counting is hard." */
export function Scene2Problem({ currentTime }: SceneProps) {
  const { visible, opacity } = useSceneVisible(currentTime, 10, 22)
  const line1Opacity = useDelayedVisible(currentTime, 10.5)
  const line2Opacity = useDelayedVisible(currentTime, 13)
  const line3Opacity = useDelayedVisible(currentTime, 16)
  const card1Opacity = useDelayedVisible(currentTime, 10.3)
  const card2Opacity = useDelayedVisible(currentTime, 10.6)
  const card3Opacity = useDelayedVisible(currentTime, 10.9)

  if (!visible && opacity === 0) return null

  const cardOpacities = [card1Opacity, card2Opacity, card3Opacity]

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      opacity,
      gap: '32px',
    }}>

      {/* Cards fly in from right */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '8px',
      }}>
        {CARDS.map((card, i) => {
          const cardOp = cardOpacities[i]
          return (
            <div key={i} style={{
              opacity: cardOp,
              transform: `translateX(${(1 - cardOp) * 80}px)`,
            }}>
              <PlayingCard rank={card.rank} suit={card.suit} size="lg" />
            </div>
          )
        })}
      </div>

      {/* Problem text */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          opacity: line1Opacity,
          transform: `translateY(${(1 - line1Opacity) * 30}px)`,
          fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)',
          fontWeight: 700,
          color: 'rgba(255,255,255,0.9)',
        }}>
          Card counting is
          <span style={{
            color: '#ef4444',
            marginLeft: '12px',
            textShadow: '0 0 20px rgba(239,68,68,0.5)',
          }}>
            hard.
          </span>
        </div>

        <div style={{
          opacity: line2Opacity,
          transform: `translateY(${(1 - line2Opacity) * 30}px)`,
          fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)',
          fontWeight: 700,
          color: 'rgba(255,255,255,0.9)',
          marginTop: '12px',
        }}>
          Without the right
          <span style={{
            color: '#d4a843',
            marginLeft: '12px',
            textShadow: '0 0 20px rgba(212,168,67,0.5)',
          }}>
            training.
          </span>
        </div>

        <div style={{
          opacity: line3Opacity,
          transform: `translateY(${(1 - line3Opacity) * 20}px)`,
          marginTop: '24px',
          color: 'rgba(255,255,255,0.35)',
          fontSize: '0.9rem',
          letterSpacing: '3px',
          textTransform: 'uppercase',
        }}>
          Until now.
        </div>
      </div>
    </div>
  )
}
