import { useSceneVisible, useDelayedVisible } from '../useSceneVisible'

interface SceneProps {
  currentTime: number
}

/** Scene 3: "App Reveal" (20-30s) — golden lines framing the subtitle. */
export function Scene3Reveal({ currentTime }: SceneProps) {
  const { visible, opacity } = useSceneVisible(currentTime, 20, 30)
  const topLineOpacity = useDelayedVisible(currentTime, 20.5)
  const textOpacity = useDelayedVisible(currentTime, 22)
  const bottomLineOpacity = useDelayedVisible(currentTime, 24)

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
    }}>

      {/* Top golden line */}
      <div style={{
        width: `${topLineOpacity * 200}px`,
        height: '2px',
        background: 'linear-gradient(90deg, transparent, #d4a843, transparent)',
        marginBottom: '32px',
      }} />

      {/* Subtitle */}
      <div style={{
        opacity: textOpacity,
        transform: `translateY(${(1 - textOpacity) * 20}px)`,
        color: 'rgba(255,255,255,0.5)',
        fontSize: 'clamp(1rem, 2.5vw, 1.4rem)',
        letterSpacing: '3px',
        textTransform: 'uppercase',
        textAlign: 'center',
      }}>
        Master the art of card counting
      </div>

      {/* Bottom golden line */}
      <div style={{
        width: `${bottomLineOpacity * 200}px`,
        height: '1px',
        background: 'linear-gradient(90deg, transparent, #d4a843, transparent)',
        marginTop: '32px',
      }} />
    </div>
  )
}
