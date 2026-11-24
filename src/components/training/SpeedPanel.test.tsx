import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Rank, Suit } from '../../types'
import { HiLoLegend, SpeedBestBlock, SpeedBestLine, SpeedHint, SpeedNext, SpeedProgress, SpeedRoundInfo, SpeedSitting, SpeedVerdict } from './SpeedPanel'

describe('the round’s progress', () => {
  it('names the card on the felt and how many are left', () => {
    render(<SpeedProgress index={6} total={20} done={false} />)
    expect(screen.getByText('Card 7 / 20')).toBeInTheDocument()
    expect(screen.getByText('13 to go')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '7')
  })

  it('says when every card has been dealt', () => {
    render(<SpeedProgress index={19} total={20} done />)
    expect(screen.getByText('All 20 cards dealt')).toBeInTheDocument()
  })

  it('offers a stop only while cards run', () => {
    const onStop = vi.fn()
    const { rerender } = render(<SpeedProgress index={0} total={20} done={false} onStop={onStop} />)
    fireEvent.click(screen.getByText('Stop'))
    expect(onStop).toHaveBeenCalled()
    rerender(<SpeedProgress index={19} total={20} done />)
    expect(screen.queryByText('Stop')).not.toBeInTheDocument()
  })
})

describe('the round’s settings', () => {
  it('shows the speed with its seconds per card, and the cards', () => {
    render(<SpeedRoundInfo speedMs={500} cards={30} />)
    expect(screen.getByTestId('speed-round-info')).toHaveTextContent('Fast')
    expect(screen.getByTestId('speed-round-info')).toHaveTextContent('0.5 s per card')
    expect(screen.getByTestId('speed-round-info')).toHaveTextContent('30')
  })
})

describe('the personal best', () => {
  it('names the longest exact round at this speed and the rounds behind it', () => {
    render(<SpeedBestBlock best={{ bestCards: 30, exact: 7, rounds: 9 }} speedMs={1000} />)
    expect(screen.getByText('Your best · Normal')).toBeInTheDocument()
    expect(screen.getByTestId('speed-best-cards')).toHaveTextContent('30 cards')
    expect(screen.getByText('7 of 9 rounds exact')).toBeInTheDocument()
    expect(screen.queryByTestId('speed-best-new')).not.toBeInTheDocument()
  })

  it('says so when this round set it', () => {
    render(<SpeedBestBlock best={{ bestCards: 30, exact: 1, rounds: 1 }} speedMs={1000} isNew />)
    expect(screen.getByTestId('speed-best-new')).toHaveTextContent('New best')
  })

  it('says there is none yet rather than showing a zero', () => {
    render(<SpeedBestBlock best={{ bestCards: null, exact: 0, rounds: 2 }} speedMs={2000} />)
    expect(screen.getByText('No exact round at this speed yet.')).toBeInTheDocument()
  })
})

describe('the personal best on a phone', () => {
  it('says it in one line', () => {
    render(<SpeedBestLine best={{ bestCards: 20, exact: 65, rounds: 82 }} speedMs={1000} />)
    expect(screen.getByTestId('speed-best-line')).toHaveTextContent('Your best · Normal: 20 cards · 65 of 82 rounds exact')
  })

  it('says there is none yet', () => {
    render(<SpeedBestLine best={{ bestCards: null, exact: 0, rounds: 0 }} speedMs={500} />)
    expect(screen.getByTestId('speed-best-line')).toHaveTextContent('Your best · Fast: No exact round at this speed yet.')
  })
})

describe('the Hi-Lo legend', () => {
  it('shows the three values and no count', () => {
    render(<HiLoLegend />)
    const legend = screen.getByTestId('hilo-legend')
    expect(legend).toHaveTextContent('2–6+1')
    expect(legend).toHaveTextContent('7–90')
    expect(legend).toHaveTextContent('10–A−1')
  })
})

describe('the verdict', () => {
  it('states the true count when right', () => {
    render(<SpeedVerdict correct count={-4} answer={-4} />)
    expect(screen.getByTestId('speed-verdict')).toHaveTextContent('Correct! RC = −4')
    expect(screen.queryByText(/You said/)).not.toBeInTheDocument()
  })

  it('puts the answer beside the true count, and how far off it was', () => {
    render(<SpeedVerdict correct={false} count={-2} answer={-1} />)
    expect(screen.getByTestId('speed-verdict')).toHaveTextContent('Wrong! RC = −2')
    expect(screen.getByText(/You said −1/)).toHaveTextContent('1 too high')
  })

  it('carries a new best on its line where the best block is not shown', () => {
    render(<SpeedVerdict correct count={1} answer={1} isNewBest />)
    expect(screen.getByTestId('speed-best-new-strip')).toHaveTextContent('New best')
  })

  it('carries the session’s rounds on its line where the session block is not shown', () => {
    render(<SpeedVerdict correct={false} count={0} answer={3} results={[true, false]} />)
    expect(screen.getByLabelText('This session')).toHaveTextContent('1/2')
  })
})

describe('the pointer', () => {
  const lastCard = { rank: Rank.King, suit: Suit.Spades }

  it('names the last card and its tag when that is where the answer stopped', () => {
    render(<SpeedHint hint={{ kind: 'lastCard', diff: 1, marked: [19] }} lastCard={lastCard} lastTag={-1} />)
    expect(screen.getByTestId('speed-hint')).toHaveTextContent('(K♠, −1)')
  })

  it('names a direction to look in when off by one, without claiming the card', () => {
    render(<SpeedHint hint={{ kind: 'oneLow', diff: -1, marked: [] }} lastCard={lastCard} lastTag={-1} />)
    // The verdict line already says "1 too low"; the pointer starts with the cause.
    expect(screen.getByTestId('speed-hint').textContent).toMatch(/^Usually a low card \(2–6\)/)
  })

  it('claims no card for a larger miss — the row is the guide', () => {
    render(<SpeedHint hint={{ kind: 'far', diff: -4, marked: [] }} lastCard={lastCard} lastTag={-1} />)
    expect(screen.getByTestId('speed-hint')).toHaveTextContent('More than one card slipped')
  })

  it('says only that the final count is right — two misses can cancel out', () => {
    render(<SpeedHint hint={{ kind: 'exact', diff: 0, marked: [] }} lastCard={lastCard} lastTag={-1} />)
    expect(screen.getByTestId('speed-hint')).toHaveTextContent('Your final count is right.')
    expect(screen.getByTestId('speed-hint').textContent).not.toMatch(/every card/i)
  })
})

describe('the session so far', () => {
  it('draws one segment per round and the three figures', () => {
    render(<SpeedSitting results={[true, false, true]} streak={1} bestStreak={1} />)
    expect(screen.getAllByTestId('result-trail')[0].children).toHaveLength(3)
    expect(screen.getByText('Streak')).toBeInTheDocument()
    expect(screen.getByText('Best Streak')).toBeInTheDocument()
    expect(screen.getByText('Accuracy')).toBeInTheDocument()
    expect(screen.getByTestId('speed-sitting')).toHaveTextContent('2/3')
  })
})

describe('the session before its first round', () => {
  it('says where the rounds will show instead of drawing zeros', () => {
    render(<SpeedSitting results={[]} streak={0} bestStreak={0} />)
    expect(screen.getByTestId('speed-sitting-empty')).toHaveTextContent('Your rounds appear here.')
    expect(screen.queryByText('Accuracy')).not.toBeInTheDocument()
  })
})

describe('the way on', () => {
  it('offers the same round again and one notch faster', () => {
    const onAgain = vi.fn()
    const onStep = vi.fn()
    render(<SpeedNext onAgain={onAgain} step={{ kind: 'faster', speedMs: 500 }} onStep={onStep} onSettings={() => {}} />)
    fireEvent.click(screen.getByTestId('try-again'))
    fireEvent.click(screen.getByTestId('speed-faster'))
    expect(onAgain).toHaveBeenCalled()
    expect(onStep).toHaveBeenCalled()
    expect(screen.getByTestId('speed-faster')).toHaveTextContent('Faster')
  })

  it('offers a slower round after a miss', () => {
    render(<SpeedNext onAgain={() => {}} step={{ kind: 'slower', speedMs: 2000 }} onStep={() => {}} onSettings={() => {}} />)
    expect(screen.getByTestId('speed-slower')).toHaveTextContent('Slower')
    expect(screen.queryByTestId('speed-faster')).not.toBeInTheDocument()
  })

  it('offers more cards at the fastest speed, and no step at the top of both', () => {
    const { rerender } = render(<SpeedNext onAgain={() => {}} step={{ kind: 'moreCards', cards: 30 }} onStep={() => {}} onSettings={() => {}} />)
    expect(screen.getByTestId('speed-more-cards')).toHaveTextContent('More cards')
    rerender(<SpeedNext onAgain={() => {}} step={null} onStep={() => {}} onSettings={() => {}} />)
    expect(screen.queryByTestId('speed-faster')).not.toBeInTheDocument()
    expect(screen.queryByTestId('speed-more-cards')).not.toBeInTheDocument()
  })

  it('has a quiet way back to the setup', () => {
    const onSettings = vi.fn()
    render(<SpeedNext onAgain={() => {}} step={null} onStep={() => {}} onSettings={onSettings} />)
    fireEvent.click(screen.getByText('Back to Settings'))
    expect(onSettings).toHaveBeenCalled()
  })
})
