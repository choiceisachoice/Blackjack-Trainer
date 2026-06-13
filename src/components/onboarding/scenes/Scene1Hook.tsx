import { useSceneVisible, useDelayedVisible } from '../useSceneVisible'
import { PlayingCard } from '../components/PlayingCard'

interface SceneProps {
  currentTime: number
}

/** Scene 1: "The Hook" (0-10s) — falling card, "Think you can't beat the house?" */
export function Scene1Hook({ currentTime }: SceneProps) {
  const { visible, opacity } = useSceneVisible(currentTime, 0, 10)
  const cardOpacity = useDelayedVisible(currentTime, 0.5)
  const textOpacity = useDelayedVisible(currentTime, 2.5)
  const subTextOpacity = useDelayedVisible(currentTime, 6)

  if (!visible && opacity === 0) return null

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      opacity,
      transition: 'opacity 0.3s ease',
    }}>

      {/* Falling card with glow */}
      <div style={{
        opacity: cardOpacity,
        marginBottom: '40px',
        animation: cardOpacity === 1
          ? 'trailer-glow-pulse 2s ease-in-out infinite'
          : 'none',
      }}>
        <PlayingCard
          rank="A"
          suit={'\u2660'}
          size="xl"
          style={{
            transform: `translateY(${(1 - cardOpacity) * -60}px)`,
          }}
        />
      </div>

      {/* Main text */}
      <div style={{
        opacity: textOpacity,
        transform: `translateY(${(1 - textOpacity) * 30}px)`,
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 4rem)',
          fontWeight: 800,
          fontStyle: 'italic',
          color: '#ffffff',
          letterSpacing: '2px',
          margin: 0,
          textShadow: '0 0 40px rgba(255,255,255,0.2)',
        }}>
          Think you can't
        </h1>
        <h1 style={{
          fontSize: 'clamp(2rem, 5vw, 4rem)',
          fontWeight: 800,
          fontStyle: 'italic',
          background: 'linear-gradient(135deg, #d4a843, #ff6b00)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          margin: '8px 0 0 0',
          textShadow: 'none',
          filter: 'drop-shadow(0 0 20px rgba(212,168,67,0.5))',
        }}>
          beat the house?
        </h1>
      </div>

      {/* Sub-text */}
      <div style={{
        opacity: subTextOpacity,
        transform: `translateY(${(1 - subTextOpacity) * 20}px)`,
        marginTop: '24px',
        color: 'rgba(255,255,255,0.4)',
        fontSize: '1rem',
        letterSpacing: '4px',
        textTransform: 'uppercase',
      }}>
        Think again.
      </div>
    </div>
  )
}
