import { useSceneVisible, useDelayedVisible } from '../useSceneVisible'

interface SceneProps {
  currentTime: number
}

const MODES = [
  {
    icon: '\u26A1',
    title: 'Speed Drill',
    description: 'Train your counting speed',
    appearAt: 32.5,
  },
  {
    icon: '\u{1F0CF}',
    title: 'Table Counting',
    description: 'Count cards through a full shoe',
    appearAt: 34.5,
  },
  {
    icon: '\u{1F9E0}',
    title: 'Deviation Training',
    description: 'Know when to break the rules',
    appearAt: 36.5,
  },
  {
    icon: '\u{1F4B0}',
    title: 'Bet Spread',
    description: 'Optimize your betting strategy',
    appearAt: 38.5,
  },
  {
    icon: '\u{1F441}\uFE0F',
    title: 'Deck Estimation',
    description: 'Master deck depth awareness',
    appearAt: 40.5,
  },
  {
    icon: '\u{1F3B0}',
    title: 'Casino Session',
    description: 'Sit at a full table. Count every card.\nJust like the real thing.',
    appearAt: 43,
    isFeatured: true,
  },
]

/** Scene 4: "Training Modes" (32-47s) — mode cards appear one by one from right. */
export function Scene4Modes({ currentTime }: SceneProps) {
  const { visible, opacity } = useSceneVisible(currentTime, 32, 47)
  const headerOpacity = useDelayedVisible(currentTime, 32)

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
      gap: '24px',
      padding: '40px',
    }}>

      {/* Header */}
      <div style={{
        opacity: headerOpacity,
        color: 'rgba(255,255,255,0.4)',
        fontSize: '0.75rem',
        letterSpacing: '4px',
        textTransform: 'uppercase',
        marginBottom: '8px',
      }}>
        Training Modes
      </div>

      {/* Mode cards */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%',
        maxWidth: '560px',
      }}>
        {MODES.map((mode) => {
          const elapsed = currentTime - mode.appearAt
          const cardOpacity = Math.max(0, Math.min(elapsed / 0.5, 1))
          const isVisible = elapsed > -0.1

          if (!isVisible) return null

          if (mode.isFeatured) {
            return (
              <div key={mode.title} style={{
                opacity: cardOpacity,
                transform: `translateX(${(1 - cardOpacity) * 60}px)`,
                background: 'linear-gradient(135deg, rgba(212,168,67,0.15), rgba(255,107,0,0.08))',
                border: '1px solid rgba(212,168,67,0.5)',
                borderRadius: '16px',
                padding: '20px 24px',
                marginTop: '8px',
                boxShadow: `0 0 40px rgba(212,168,67,${cardOpacity * 0.2})`,
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  marginBottom: '8px',
                }}>
                  <span style={{ fontSize: '2rem' }}>{mode.icon}</span>
                  <span style={{
                    fontSize: '1.3rem',
                    fontWeight: 700,
                    color: '#d4a843',
                    letterSpacing: '1px',
                  }}>
                    {mode.title}
                  </span>
                </div>
                <div style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '0.9rem',
                  lineHeight: 1.6,
                  paddingLeft: '52px',
                  whiteSpace: 'pre-line',
                }}>
                  {mode.description}
                </div>
              </div>
            )
          }

          return (
            <div key={mode.title} style={{
              opacity: cardOpacity,
              transform: `translateX(${(1 - cardOpacity) * 60}px)`,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}>
              <span style={{ fontSize: '1.5rem' }}>{mode.icon}</span>
              <div>
                <div style={{
                  color: 'rgba(255,255,255,0.9)',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                }}>
                  {mode.title}
                </div>
                <div style={{
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: '0.8rem',
                  marginTop: '2px',
                }}>
                  {mode.description}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
