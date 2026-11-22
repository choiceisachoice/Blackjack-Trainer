import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { TrialIntro } from './TrialIntro'

afterEach(cleanup)

describe('TrialIntro', () => {
  it('says how long the round is and offers one button', () => {
    const onStart = vi.fn()
    render(<TrialIntro onStart={onStart} />)
    expect(screen.getByTestId('try-intro')).toHaveTextContent('10 hands')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('try-start'))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('carries the page heading only where it is asked to', () => {
    const view = render(<TrialIntro onStart={() => {}} />)
    // On the landing the section has its own h2; a heading here would be a second h1.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    view.rerender(<TrialIntro onStart={() => {}} titled />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Play a round of basic strategy')
  })

  it('marks the button busy while the round is on its way, and leaves it in place', () => {
    render(<TrialIntro onStart={() => {}} busy />)
    expect(screen.getByTestId('try-start')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('try-start')).toHaveTextContent('Deal the first hand')
  })

  it('renders on the server — it is what the prerendered pages show', () => {
    const html = renderToString(<TrialIntro onStart={() => {}} titled />)
    expect(html).toContain('data-testid="try-start"')
    expect(html).toContain('<h1')
  })
})
