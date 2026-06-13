import { useSceneVisible, useDelayedVisible } from '../useSceneVisible'

interface SceneProps {
  currentTime: number
}

/** Scene 5: "Casino Session Highlight" (47-75s) — casino table, cards dealt, stats. */
export function Scene5Casino({ currentTime }: SceneProps) {
  const { visible, opacity } = useSceneVisible(currentTime, 47, 75)

  const tableOpacity = useDelayedVisible(currentTime, 47.5)
  const text1Opacity = useDelayedVisible(currentTime, 50)
  const card1Opacity = useDelayedVisible(currentTime, 52)
  const card2Opacity = useDelayedVisible(currentTime, 52.5)
  const card3Opacity = useDelayedVisible(currentTime, 53)
  const card4Opacity = useDelayedVisible(currentTime, 53.5)
  const text2Opacity = useDelayedVisible(currentTime, 56)
  const statsOpacity = useDelayedVisible(currentTime, 60)
  const text3Opacity = useDelayedVisible(currentTime, 65)
  const glowOpacity = useDelayedVisible(currentTime, 68)

  if (!visible && opacity === 0) return null

  const dealerCardOpacities = [card1Opacity, card2Opacity]
  const playerCardOpacities = [card3Opacity, card4Opacity]

  const stats = [
    { label: 'Play Accuracy', value: '94%', color: '#22c55e' },
    { label: 'Bet Accuracy', value: '88%', color: '#d4a843' },
    { label: 'Count Accuracy', value: '91%', color: '#3b82f6' },
  ]

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
      padding: '40px',
    }}>

      {/* Casino table */}
      <div style={{
        opacity: tableOpacity,
        transform: `scale(${0.9 + tableOpacity * 0.1})`,
        background: 'radial-gradient(ellipse at center, #1a4a2e 0%, #0d2d1a 60%, #071a10 100%)',
        border: '3px solid rgba(212,168,67,0.4)',
        borderRadius: '120px',
        width: 'min(600px, 90vw)',
        height: '180px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        boxShadow: `
          0 0 60px rgba(0,0,0,0.8),
          inset 0 0 40px rgba(0,0,0,0.4),
          0 0 ${glowOpacity * 80}px rgba(212,168,67,${glowOpacity * 0.3})
        `,
      }}>

        {/* Dealer area */}
        <div style={{
          position: 'absolute',
          top: '20px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}>
          <span style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: '0.7rem',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginRight: '8px',
          }}>Dealer</span>
          {dealerCardOpacities.map((op, i) => (
            <div key={i} style={{
              opacity: op,
              transform: `translateY(${(1 - op) * -20}px) rotate(${i === 1 ? -5 : 5}deg)`,
              fontSize: '2rem',
              filter: i === 1
                ? 'brightness(0.3)'
                : `drop-shadow(0 2px 4px rgba(0,0,0,0.5))`,
            }}>
              {i === 0 ? '\u{1F0A1}' : '\u{1F0A0}'}
            </div>
          ))}
        </div>

        {/* Player area */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}>
          <span style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: '0.7rem',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginRight: '8px',
          }}>You</span>
          {playerCardOpacities.map((op, i) => (
            <div key={i} style={{
              opacity: op,
              transform: `translateY(${(1 - op) * 20}px) rotate(${i === 0 ? -3 : 3}deg)`,
              fontSize: '2rem',
              filter: `drop-shadow(0 2px 8px rgba(212,168,67,${op * 0.3}))`,
            }}>
              {i === 0 ? '\u{1F0B1}' : '\u{1F0BB}'}
            </div>
          ))}
        </div>

        {/* Bot players */}
        <div style={{
          position: 'absolute',
          left: '30px',
          opacity: statsOpacity * 0.4,
          fontSize: '0.7rem',
          color: 'rgba(255,255,255,0.4)',
          textAlign: 'center',
        }}>
          {'\u{1F916}'}<br/>Bot 1
        </div>
        <div style={{
          position: 'absolute',
          right: '30px',
          opacity: statsOpacity * 0.4,
          fontSize: '0.7rem',
          color: 'rgba(255,255,255,0.4)',
          textAlign: 'center',
        }}>
          {'\u{1F916}'}<br/>Bot 2
        </div>

        {/* Running Count display */}
        <div style={{
          opacity: statsOpacity,
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}>
          <div style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: '0.65rem',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}>
            Running Count
          </div>
          <div style={{
            color: '#22c55e',
            fontSize: '1.8rem',
            fontWeight: 800,
            textShadow: '0 0 20px rgba(34,197,94,0.6)',
          }}>
            +4
          </div>
        </div>
      </div>

      {/* Text below table */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          opacity: text1Opacity,
          color: 'rgba(255,255,255,0.9)',
          fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
          fontWeight: 700,
          marginBottom: '12px',
        }}>
          5 players. Real rules.
          <span style={{
            color: '#d4a843',
            marginLeft: '8px',
            textShadow: '0 0 20px rgba(212,168,67,0.5)',
          }}>
            Real pressure.
          </span>
        </div>

        <div style={{
          opacity: text2Opacity,
          color: 'rgba(255,255,255,0.4)',
          fontSize: '0.9rem',
          letterSpacing: '1px',
          marginBottom: '24px',
        }}>
          Track your count. Manage your bets. Make the right call.
        </div>

        {/* Stats badges */}
        <div style={{
          opacity: statsOpacity,
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          {stats.map(stat => (
            <div key={stat.label} style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '8px 16px',
              textAlign: 'center',
            }}>
              <div style={{
                color: stat.color,
                fontSize: '1.1rem',
                fontWeight: 700,
              }}>
                {stat.value}
              </div>
              <div style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: '0.7rem',
                letterSpacing: '1px',
              }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Final text */}
        <div style={{
          opacity: text3Opacity,
          marginTop: '24px',
          color: 'rgba(212,168,67,0.8)',
          fontSize: '1rem',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          textShadow: '0 0 20px rgba(212,168,67,0.4)',
        }}>
          The most realistic simulator ever built
        </div>
      </div>
    </div>
  )
}
