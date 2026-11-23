import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const sounds = vi.hoisted(() => ({ prime: vi.fn() }))
vi.mock('../../services/sound-engine', () => ({
  soundEngine: new Proxy({}, { get: (_t, k) => (k === 'prime' ? sounds.prime : () => {}), set: () => true }),
}))

import { TrialStage } from './TrialStage'
import { useAppStore } from '../../store/app-store'

afterEach(cleanup)

describe('TrialStage', () => {
  it('lays out the bar, the felt and the controls, and says the money is play money', () => {
    render(<TrialStage status="Hand 3 / 10" felt={<div data-testid="felt" />} controls={<button>Deal</button>} />)
    expect(screen.getByTestId('trial-status')).toHaveTextContent('Hand 3 / 10')
    expect(screen.getByTestId('trial-bar')).toHaveTextContent('Play money')
    expect(screen.getByTestId('felt')).toBeInTheDocument()
    expect(screen.getByTestId('trial-controls')).toHaveTextContent('Deal')
  })

  it('has one height through every state, held to the screen and clear of the cookie bar', () => {
    render(<TrialStage status="" felt={null} controls={null} />)
    const stage = screen.getByTestId('trial-stage')
    expect(stage.className).toMatch(/var\(--cookie-bar,0px\)/)
    expect(stage.className).toMatch(/var\(--stage-top/)
    // The controls keep their height whatever they hold, so the felt never resizes mid-round.
    expect(screen.getByTestId('trial-controls').className).toMatch(/\bh-\[/)
  })

  it('switches the sound and wakes it in the same click', () => {
    useAppStore.setState({ soundEnabled: false })
    render(<TrialStage status="" felt={null} controls={null} />)
    const toggle = screen.getByTestId('trial-sound')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(useAppStore.getState().soundEnabled).toBe(true)
    expect(sounds.prime).toHaveBeenCalled()
  })
})
