import { useState, useEffect } from 'react'
import { useTrailerTimer } from './useTrailerTimer'
import { Scene1Hook } from './scenes/Scene1Hook'
import { Scene2Problem } from './scenes/Scene2Problem'
import { Scene3Reveal } from './scenes/Scene3Reveal'
import { Scene4aSpeedDrill } from './scenes/Scene4aSpeedDrill'
import { Scene5Casino } from './scenes/Scene5Casino'

interface OnboardingTrailerProps {
  onComplete: () => void
  onSkip: () => void
}

/**
 * Full-screen onboarding trailer shown to first-time users.
 * Shows a start screen first (requires user click to satisfy browser autoplay policy),
 * then plays a 150-second code-based animated intro with background music.
 */
export function OnboardingTrailer({ onComplete, onSkip }: OnboardingTrailerProps) {
  const [hasStarted, setHasStarted] = useState(false)
  const { state, play, skip } = useTrailerTimer()

  // When complete, call onComplete after a short delay
  useEffect(() => {
    if (state.isComplete) {
      const timer = setTimeout(onComplete, 1000)
      return () => clearTimeout(timer)
    }
  }, [state.isComplete, onComplete])

  const handleSkip = () => {
    skip()
    onSkip()
  }

  const handleStart = () => {
    setHasStarted(true)
    play()
  }

  // Start screen — requires user interaction for browser autoplay
  if (!hasStarted) {
    return (
      <div
        data-testid="onboarding-trailer"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: '#000',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '32px',
        }}
      >
        <div style={{
          color: '#d4a843',
          fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
          fontWeight: 800,
          fontStyle: 'italic',
          textAlign: 'center',
        }}>
          Blackjack Card Counting Trainer
        </div>

        <button
          onClick={handleStart}
          data-testid="start-intro-btn"
          style={{
            background: 'linear-gradient(135deg, #d4a843, #ff6b00)',
            border: 'none',
            color: '#000',
            padding: '14px 40px',
            borderRadius: '30px',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          Watch Intro
        </button>

        <button
          onClick={onSkip}
          data-testid="skip-intro-btn"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            fontSize: '0.8rem',
            cursor: 'pointer',
            letterSpacing: '1px',
          }}
        >
          Skip &rarr;
        </button>
      </div>
    )
  }

  // Active trailer with timer + progress
  return (
    <div
      data-testid="onboarding-trailer"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000000',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Scene area */}
      <div
        data-testid="scene-area"
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <Scene1Hook currentTime={state.currentTime} />
        <Scene2Problem currentTime={state.currentTime} />
        <Scene3Reveal currentTime={state.currentTime} />
        <Scene4aSpeedDrill currentTime={state.currentTime} />
        <Scene5Casino currentTime={state.currentTime} />

        {/* Scenes 6-10 placeholder */}
        {state.currentScene >= 6 && (
          <div style={{
            color: '#d4a843',
            fontSize: '2rem',
            fontWeight: 'bold',
            textAlign: 'center',
          }}>
            <div data-testid="scene-label">Scene {state.currentScene}</div>
            <div style={{ fontSize: '1rem', color: '#666', marginTop: '8px' }}>
              <span data-testid="timer-display">{state.currentTime.toFixed(1)}s</span> / 150s
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar: progress + skip */}
      <div style={{
        width: '100%',
        padding: '20px 40px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}>
        {/* Progress bar */}
        <div
          data-testid="progress-bar-track"
          style={{
            flex: 1,
            height: '3px',
            backgroundColor: 'rgba(255,255,255,0.15)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            data-testid="progress-bar-fill"
            style={{
              width: `${state.progress}%`,
              height: '100%',
              backgroundColor: '#d4a843',
              borderRadius: '2px',
              transition: 'width 0.1s linear',
            }}
          />
        </div>

        {/* Skip button */}
        <button
          onClick={handleSkip}
          data-testid="skip-playing-btn"
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'rgba(255,255,255,0.6)',
            padding: '6px 16px',
            borderRadius: '20px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            letterSpacing: '1px',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            (e.target as HTMLElement).style.borderColor = '#d4a843'
            ;(e.target as HTMLElement).style.color = '#d4a843'
          }}
          onMouseLeave={e => {
            (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)'
            ;(e.target as HTMLElement).style.color = 'rgba(255,255,255,0.6)'
          }}
        >
          Skip Intro &rsaquo;
        </button>
      </div>
    </div>
  )
}
