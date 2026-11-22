import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TrialIntro } from './TrialIntro'

afterEach(cleanup)

describe('TrialIntro', () => {
  it('says how many hands there are, what the table is, and the one condition', () => {
    render(<TrialIntro handsLeft={10} onStart={() => {}} />)
    expect(screen.getByTestId('trial-intro-title')).toHaveTextContent('10 free hands at the table')
    expect(screen.getByTestId('trial-intro')).toHaveTextContent('two other players')
    expect(screen.getByTestId('trial-intro')).toHaveTextContent('Once per account. After that the table is part of Pro.')
  })

  it('counts what is left, not what the trial began with', () => {
    render(<TrialIntro handsLeft={1} onStart={() => {}} />)
    expect(screen.getByTestId('trial-intro-title')).toHaveTextContent('1 free hand at the table')
  })

  it('has one way on: sitting down', () => {
    const onStart = vi.fn()
    render(<TrialIntro handsLeft={7} onStart={onStart} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('trial-start'))
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('shows a saved table above the offer when it is handed one', () => {
    render(<TrialIntro handsLeft={7} onStart={() => {}} notice={<p data-testid="saved">saved</p>} />)
    expect(screen.getByTestId('saved')).toBeInTheDocument()
    expect(screen.getByTestId('trial-start')).toBeInTheDocument()
  })

  it('offers the trial\'s own saved table alone: continuing it, not a second table beside it', () => {
    render(<TrialIntro handsLeft={7} onStart={() => {}} savedTable={<p data-testid="saved">saved</p>} />)
    expect(screen.getByTestId('saved')).toBeInTheDocument()
    expect(screen.queryByTestId('trial-start')).toBeNull()
    // Still says where the trial stands.
    expect(screen.getByTestId('trial-intro-left')).toHaveTextContent('Trial: 7 hands left')
  })
})
