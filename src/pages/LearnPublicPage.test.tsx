import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LearnPublicPage } from './LearnPublicPage'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, ...rest } = props
      return <div {...rest}>{children}</div>
    },
  },
  useReducedMotion: () => false,
}))

afterEach(cleanup)

const renderPage = () => render(<MemoryRouter><LearnPublicPage /></MemoryRouter>)

describe('LearnPublicPage', () => {
  it('shows the same Learn content the app shows', () => {
    renderPage()
    expect(screen.getByTestId('learn-page')).toBeInTheDocument()
    expect(screen.getByTestId('blackjack-basics')).toBeInTheDocument()
  })

  it('starts with every topic open, because a collapsed topic is invisible to a crawler', () => {
    renderPage()
    for (const id of ['what-is-counting', 'hi-lo', 'true-count', 'basic-strategy', 'deviations', 'i18-fab4', 'bet-spread', 'deck-estimation']) {
      expect(screen.getByTestId(`topic-${id}`).getAttribute('aria-expanded'), id).toBe('true')
    }
    // The prose itself is in the DOM, not just the headings.
    expect(document.body.textContent).toMatch(/running count/i)
    expect(document.body.textContent).toMatch(/illustrious 18/i)
  })

  it('links every topic to its own chapter page rather than repeating the chapter', () => {
    renderPage()
    expect(screen.getByTestId('read-hi-lo')).toHaveAttribute('href', '/learn/hi-lo-system')
    expect(screen.getByTestId('read-i18-fab4')).toHaveAttribute('href', '/learn/illustrious-18-fab-4')
    expect(screen.queryByTestId('table-i18')).not.toBeInTheDocument()
  })

  it('gives each topic an anchor', () => {
    renderPage()
    expect(document.getElementById('hi-lo')).not.toBeNull()
    expect(document.getElementById('true-count')).not.toBeNull()
  })

  it('sets its own title and canonical', () => {
    renderPage()
    expect(document.title).toMatch(/learn/i)
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://black-jack-training.com/learn')
  })

  it('offers a way in and a way home', () => {
    renderPage()
    expect(screen.getByTestId('learn-start')).toHaveAttribute('href', '/login')
    expect(screen.getByTestId('learn-home')).toHaveAttribute('href', '/')
  })
})
