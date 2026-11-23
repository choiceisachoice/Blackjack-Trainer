import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { TrialIntro } from './TrialIntro'
import { useAppStore } from '../../store/app-store'

afterEach(cleanup)

describe('TrialIntro', () => {
  it('is the empty table — the visitor’s seat, the bankroll, no card — and one way to deal', () => {
    const onStart = vi.fn()
    render(<TrialIntro onStart={onStart} />)
    expect(screen.getByTestId('felt-table')).toBeInTheDocument()
    expect(screen.getByTestId('human-seat').textContent).toMatch(/\$1.000/)
    expect(document.querySelector('[data-card]')).toBeNull()
    expect(screen.getByTestId('try-intro')).toHaveTextContent('Play money, $100 a hand. After every hand you see the right play.')
    // The deal and, in the bar, the sound switch: nothing else asks for a click.
    expect(within(screen.getByTestId('trial-controls')).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('try-start'))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('has no "place your bet" on the dealer’s place — there is no bet to place', () => {
    render(<TrialIntro onStart={() => {}} />)
    expect(screen.queryByText('Place your bet to deal')).not.toBeInTheDocument()
  })

  it('carries no heading: the page around it has its own', () => {
    render(<TrialIntro onStart={() => {}} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('marks the button busy while the round is on its way, and leaves it in place', () => {
    render(<TrialIntro onStart={() => {}} busy />)
    expect(screen.getByTestId('try-start')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('try-start')).toHaveTextContent('Deal the first hand')
  })

  it('switches the app’s own sound setting', () => {
    useAppStore.setState({ soundEnabled: true })
    render(<TrialIntro onStart={() => {}} />)
    const toggle = screen.getByTestId('trial-sound')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(toggle)
    expect(useAppStore.getState().soundEnabled).toBe(false)
    fireEvent.click(toggle)
    expect(useAppStore.getState().soundEnabled).toBe(true)
  })

  it('renders on the server, readable without a script, at a size a phone can hold', () => {
    const html = renderToString(<TrialIntro onStart={() => {}} />)
    expect(html).toContain('data-testid="try-start"')
    expect(html).toContain('Deal the first hand')
    expect(html).toContain('Hand 1 / 10')
    // Drawn at the prerender fit, not at the 1120px design width.
    expect(html).toMatch(/data-testid="felt-box" style="width:336px;height:374/)
  })
})
