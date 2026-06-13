import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act as actHook } from '@testing-library/react'
import { getCurrentScene, SCENE_TIMESTAMPS, TOTAL_DURATION } from './useTrailerTimer'
import { useOnboardingState } from './useOnboardingState'
import { OnboardingTrailer } from './OnboardingTrailer'

// Mock Audio
vi.stubGlobal('Audio', vi.fn(function(this: Record<string, unknown>) {
  this.play = vi.fn().mockResolvedValue(undefined)
  this.pause = vi.fn()
  this.currentTime = 0
  this.volume = 1
}))

const STORAGE_KEY = 'bjt_onboarding_seen'

describe('getCurrentScene', () => {
  it('returns scene 1 at time 0', () => {
    expect(getCurrentScene(0)).toBe(1)
  })

  it('returns scene 1 at time 9.9', () => {
    expect(getCurrentScene(9.9)).toBe(1)
  })

  it('returns scene 2 at time 10', () => {
    expect(getCurrentScene(10)).toBe(2)
  })

  it('returns scene 2 at time 15', () => {
    expect(getCurrentScene(15)).toBe(2)
  })

  it('returns scene 5 at time 50', () => {
    expect(getCurrentScene(50)).toBe(5)
  })

  it('returns scene 10 at time 140', () => {
    expect(getCurrentScene(140)).toBe(10)
  })

  it('returns scene 10 at time >= 150', () => {
    expect(getCurrentScene(150)).toBe(10)
    expect(getCurrentScene(200)).toBe(10)
  })

  it('covers all 10 scenes with correct boundaries', () => {
    for (const [scene, { start }] of Object.entries(SCENE_TIMESTAMPS)) {
      expect(getCurrentScene(start)).toBe(Number(scene))
    }
  })
})

describe('SCENE_TIMESTAMPS', () => {
  it('has 10 scenes', () => {
    expect(Object.keys(SCENE_TIMESTAMPS)).toHaveLength(10)
  })

  it('scenes are contiguous (no gaps)', () => {
    const entries = Object.values(SCENE_TIMESTAMPS)
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].start).toBe(entries[i - 1].end)
    }
  })

  it('starts at 0 and ends at TOTAL_DURATION', () => {
    expect(SCENE_TIMESTAMPS[1].start).toBe(0)
    expect(SCENE_TIMESTAMPS[10].end).toBe(TOTAL_DURATION)
  })
})

describe('TOTAL_DURATION', () => {
  it('is 150 seconds', () => {
    expect(TOTAL_DURATION).toBe(150)
  })

  it('progress calculation works correctly at midpoint', () => {
    expect((75 / TOTAL_DURATION) * 100).toBe(50)
  })
})

describe('useOnboardingState', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY)
    useOnboardingState.setState({ shouldShow: true, isVisible: true })
  })

  it('shows trailer for first-time user', () => {
    const { result } = renderHook(() => useOnboardingState())

    expect(result.current.shouldShow).toBe(true)
    expect(result.current.isVisible).toBe(true)
  })

  it('hides trailer for returning user', () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    useOnboardingState.setState({ shouldShow: false, isVisible: false })
    const { result } = renderHook(() => useOnboardingState())
    expect(result.current.shouldShow).toBe(false)
  })

  it('markAsSeen sets localStorage and hides trailer', () => {
    const { result } = renderHook(() => useOnboardingState())

    actHook(() => {
      result.current.markAsSeen()
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
    expect(result.current.shouldShow).toBe(false)
    expect(result.current.isVisible).toBe(false)
  })

  it('resetOnboarding removes localStorage flag and shows trailer', () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    useOnboardingState.setState({ shouldShow: false, isVisible: false })
    const { result } = renderHook(() => useOnboardingState())

    actHook(() => {
      result.current.resetOnboarding()
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(result.current.shouldShow).toBe(true)
    expect(result.current.isVisible).toBe(true)
  })
})

describe('OnboardingTrailer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.setItem('bjt_onboarding_seen', 'true')
    useOnboardingState.setState({ shouldShow: false, isVisible: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Start Screen ──

  it('shows start screen initially (not the trailer)', () => {
    render(<OnboardingTrailer onComplete={vi.fn()} onSkip={vi.fn()} />)

    expect(screen.getByTestId('onboarding-trailer')).toBeInTheDocument()
    expect(screen.getByTestId('start-intro-btn')).toBeInTheDocument()
    expect(screen.getByText('Blackjack Card Counting Trainer')).toBeInTheDocument()
    // Trailer elements should NOT be visible yet
    expect(screen.queryByTestId('scene-area')).not.toBeInTheDocument()
    expect(screen.queryByTestId('progress-bar-track')).not.toBeInTheDocument()
  })

  it('start screen has Watch Intro and Skip buttons', () => {
    render(<OnboardingTrailer onComplete={vi.fn()} onSkip={vi.fn()} />)

    expect(screen.getByTestId('start-intro-btn')).toHaveTextContent('Watch Intro')
    expect(screen.getByTestId('skip-intro-btn')).toBeInTheDocument()
  })

  it('skip button on start screen calls onSkip', () => {
    const onSkip = vi.fn()
    render(<OnboardingTrailer onComplete={vi.fn()} onSkip={onSkip} />)

    fireEvent.click(screen.getByTestId('skip-intro-btn'))

    expect(onSkip).toHaveBeenCalledOnce()
  })

  // ── After clicking Watch Intro ──

  it('clicking Watch Intro shows the trailer with scene area and progress', () => {
    render(<OnboardingTrailer onComplete={vi.fn()} onSkip={vi.fn()} />)

    fireEvent.click(screen.getByTestId('start-intro-btn'))

    expect(screen.getByTestId('scene-area')).toBeInTheDocument()
    expect(screen.getByTestId('progress-bar-track')).toBeInTheDocument()
    expect(screen.getByTestId('progress-bar-fill')).toBeInTheDocument()
  })

  it('progress bar starts at 0% after start', () => {
    render(<OnboardingTrailer onComplete={vi.fn()} onSkip={vi.fn()} />)

    fireEvent.click(screen.getByTestId('start-intro-btn'))

    const fill = screen.getByTestId('progress-bar-fill')
    expect(fill.style.width).toBe('0%')
  })

  it('skip button during trailer calls onSkip', () => {
    const onSkip = vi.fn()
    render(<OnboardingTrailer onComplete={vi.fn()} onSkip={onSkip} />)

    fireEvent.click(screen.getByTestId('start-intro-btn'))
    fireEvent.click(screen.getByTestId('skip-playing-btn'))

    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('skip button during trailer shows "Skip Intro"', () => {
    render(<OnboardingTrailer onComplete={vi.fn()} onSkip={vi.fn()} />)

    fireEvent.click(screen.getByTestId('start-intro-btn'))

    expect(screen.getByTestId('skip-playing-btn')).toHaveTextContent('Skip Intro')
  })
})
