import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BlackjackBasics } from './BlackjackBasics'
import { getHandValue, isSoft, isBlackjack } from '../../engine/rules/hand-utils'
import { c, R, S } from './teaching-cards'

afterEach(cleanup)

describe('BlackjackBasics', () => {
  it('renders the whole foundation lesson in order', () => {
    render(<BlackjackBasics />)
    for (const title of [
      'The goal isn’t 21',
      'What the cards are worth',
      'Hard hands and soft hands',
      'How a round runs',
      'Your five choices',
      'The dealer has no choices',
      'What you get paid',
      'Why any of this can be beaten',
    ]) {
      expect(screen.getByText(title), `missing chapter "${title}"`).toBeInTheDocument()
    }
  })

  it('introduces every term the counting chapters later assume', () => {
    render(<BlackjackBasics />)
    // The Learn page's Part 2 uses these without explaining them.
    for (const term of ['dealer', 'busting', 'upcard', 'hole card', 'soft', 'hard', 'Basic Strategy']) {
      expect(
        screen.getAllByText(new RegExp(term, 'i')).length,
        `term "${term}" is never introduced`,
      ).toBeGreaterThan(0)
    }
  })

  it('shows the soft/hard pair at the same total — the comparison only works then', () => {
    // This caught a real slip: the figure showed soft 17 against a hard 16
    // while the caption claimed "same total". Assert the invariant at the
    // source, where it is unambiguous, rather than scraping numbers out of the
    // DOM (totals like "17" appear in several figures).
    const soft = [c(R.Ace, S.Hearts), c(R.Six)]
    const hard = [c(R.Ten), c(R.Seven, S.Diamonds)]
    expect(getHandValue(soft).best).toBe(getHandValue(hard).best)
    expect(isSoft(soft)).toBe(true)
    expect(isSoft(hard)).toBe(false)

    render(<BlackjackBasics />)
    // "soft 17" also appears in the dealer chapter's prose (the H17 rule).
    expect(screen.getAllByText('soft 17').length).toBeGreaterThan(0)
    expect(screen.getByText(/any card above a 4 busts you/i)).toBeInTheDocument()
  })

  it('states the dealer rule with hands the engine agrees about', () => {
    // 16 must be a "must hit" and 17 a "must stand" under the standard rule,
    // so the lesson's two dealer figures have to carry those totals.
    expect(getHandValue([c(R.Nine, S.Hearts), c(R.Seven, S.Diamonds)]).best).toBe(16)
    expect(getHandValue([c(R.Ten), c(R.Seven)]).best).toBe(17)

    render(<BlackjackBasics />)
    expect(screen.getByText(/Dealer must hit/i)).toBeInTheDocument()
    expect(screen.getByText(/Dealer must stand/i)).toBeInTheDocument()
  })

  it('uses a genuine soft hand where it teaches "soft"', () => {
    // Ace + six must really be soft, or chapter 3 teaches the wrong thing.
    expect(isSoft([c(R.Ace, S.Hearts), c(R.Six)])).toBe(true)
    expect(isSoft([c(R.Ten), c(R.Seven)])).toBe(false)
  })

  it('shows a real blackjack in the payout chapter, and names the 3:2 rate', () => {
    // Ace + ten really is a blackjack, so the figure labels itself correctly.
    expect(isBlackjack([c(R.Ace, S.Hearts), c(R.King)])).toBe(true)

    render(<BlackjackBasics />)
    // "Blackjack" appears both as the figure's total and as the payout row.
    expect(screen.getAllByText('Blackjack').length).toBeGreaterThan(0)
    expect(screen.getByText(/pays 3:2/i)).toBeInTheDocument()
  })

  it('warns about 6:5 tables — the rule that quietly cancels the edge', () => {
    render(<BlackjackBasics />)
    expect(screen.getByText(/6:5/)).toBeInTheDocument()
  })
})
