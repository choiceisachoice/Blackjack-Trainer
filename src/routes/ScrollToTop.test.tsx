import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'
import { ScrollToTop } from './ScrollToTop'

let scrolls: { top?: number; behavior?: string }[] = []

beforeEach(() => {
  scrolls = []
  // jsdom has no layout, so window.scrollTo is a stub that records calls.
  vi.stubGlobal('scrollTo', (opts: { top?: number; behavior?: string }) => {
    scrolls.push(opts)
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function App({ initial = '/' }: { initial?: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Link to="/terms">Terms</Link>} />
        <Route path="/terms" element={<Link to="/privacy">Privacy</Link>} />
        <Route path="/privacy" element={<span>privacy</span>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ScrollToTop', () => {
  it('goes to the top when the route changes', () => {
    render(<App />)
    scrolls = []

    // The Terms link lives in the footer, so this is the real case: following
    // it from the bottom of a long page used to land at the bottom of the
    // legal document.
    fireEvent.click(screen.getByText('Terms'))
    expect(scrolls).toHaveLength(1)
    expect(scrolls[0].top).toBe(0)
  })

  it('jumps rather than animating', () => {
    // Smooth scrolling here would animate the reader away from content that is
    // already on screen, and it needs frames that may not run.
    render(<App />)
    scrolls = []
    fireEvent.click(screen.getByText('Terms'))
    expect(scrolls[0].behavior).toBe('auto')
  })

  it('fires once per navigation, not once per render', () => {
    const { rerender } = render(<App />)
    scrolls = []
    rerender(<App />)
    expect(scrolls).toHaveLength(0)
  })

  it('keeps working across several hops', () => {
    render(<App />)
    scrolls = []
    fireEvent.click(screen.getByText('Terms'))
    fireEvent.click(screen.getByText('Privacy'))
    expect(scrolls).toHaveLength(2)
    expect(scrolls.every(s => s.top === 0)).toBe(true)
  })

  it('renders nothing of its own', () => {
    const { container } = render(
      <MemoryRouter>
        <ScrollToTop />
      </MemoryRouter>,
    )
    expect(container.innerHTML).toBe('')
  })
})
