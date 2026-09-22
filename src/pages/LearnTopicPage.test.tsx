import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LearnTopicPage } from './LearnTopicPage'

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

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/learn" element={<div data-testid="hub" />} />
      <Route path="/learn/:slug" element={<LearnTopicPage />} />
    </Routes>
  </MemoryRouter>,
)

describe('LearnTopicPage', () => {
  it('renders one chapter with its own heading, text and head', () => {
    renderAt('/learn/true-count')
    expect(screen.getByTestId('topic-page-true-count')).toBeInTheDocument()
    expect(document.querySelector('h1')?.textContent).toMatch(/true count/i)
    // The chapter proper, not only the summary.
    expect(document.body.textContent).toMatch(/decks? (remaining|left)/i)
    expect(document.title).toMatch(/true count/i)
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://black-jack-training.com/learn/true-count')
  })

  it('carries the deviation tables on the Illustrious 18 chapter only', () => {
    renderAt('/learn/illustrious-18-fab-4')
    expect(screen.getByTestId('table-i18')).toBeInTheDocument()
    expect(screen.getByTestId('table-fab4')).toBeInTheDocument()
    cleanup()
    renderAt('/learn/hi-lo-system')
    expect(screen.queryByTestId('table-i18')).not.toBeInTheDocument()
  })

  it('links to the previous and next chapter, every other chapter, and the hub', () => {
    renderAt('/learn/true-count')
    expect(screen.getByTestId('topic-prev')).toHaveAttribute('href', '/learn/hi-lo-system')
    expect(screen.getByTestId('topic-next')).toHaveAttribute('href', '/learn/basic-strategy')
    const others = screen.getByTestId('topic-others').querySelectorAll('a')
    // Seven other chapters plus the hub link.
    expect(others).toHaveLength(8)
    expect(Array.from(others).map(a => a.getAttribute('href'))).toContain('/learn')
    expect(Array.from(others).map(a => a.getAttribute('href'))).not.toContain('/learn/true-count')
  })

  it('has no previous link on the first chapter and no next on the last', () => {
    renderAt('/learn/card-counting')
    expect(screen.queryByTestId('topic-prev')).not.toBeInTheDocument()
    expect(screen.getByTestId('topic-next')).toBeInTheDocument()
    cleanup()
    renderAt('/learn/deck-estimation')
    expect(screen.getByTestId('topic-prev')).toBeInTheDocument()
    expect(screen.queryByTestId('topic-next')).not.toBeInTheDocument()
  })

  it('writes Article structured data with the page title', () => {
    renderAt('/learn/bet-spread')
    const json = document.querySelector('script[type="application/ld+json"]')?.textContent ?? ''
    expect(json).toContain('"Article"')
    expect(json).toContain('"BreadcrumbList"')
    expect(json).toContain('https://black-jack-training.com/learn/bet-spread')
  })

  it('sends an unknown slug to the hub', () => {
    renderAt('/learn/no-such-chapter')
    expect(screen.getByTestId('hub')).toBeInTheDocument()
  })
})
