import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const trackPageView = vi.fn<(p: string) => Promise<void>>()
const stop = vi.fn()
const startHeartbeat = vi.fn(() => stop)
vi.mock('../../services/analytics/tracker', () => ({
  trackPageView: (p: string) => trackPageView(p),
  startHeartbeat: () => startHeartbeat(),
}))

import { PageViewTracker } from './PageViewTracker'

/** Two links, so a navigation is a click and not a mutation during render. */
function Probe() {
  const navigate = useNavigate()
  return (
    <>
      <button onClick={() => navigate('/learn')}>go learn</button>
      <button onClick={() => navigate('/login')}>go login</button>
    </>
  )
}

beforeEach(() => {
  trackPageView.mockReset().mockResolvedValue(undefined)
  startHeartbeat.mockClear()
  stop.mockClear()
})

describe('PageViewTracker', () => {
  it('tracks the first page and each in-app navigation', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <PageViewTracker />
        <Probe />
        <Routes><Route path="*" element={null} /></Routes>
      </MemoryRouter>,
    )
    expect(trackPageView).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('go learn'))
    fireEvent.click(screen.getByText('go login'))
    expect(trackPageView).toHaveBeenCalledTimes(3)
  })

  it('does not track a re-render that did not change the route', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/learn']}>
        <PageViewTracker />
      </MemoryRouter>,
    )
    rerender(
      <MemoryRouter initialEntries={['/learn']}>
        <PageViewTracker />
      </MemoryRouter>,
    )
    expect(trackPageView).toHaveBeenCalledTimes(1)
  })

  it('sends the window pathname, prefix included, not the router one', () => {
    window.history.pushState({}, '', '/de/learn')
    render(
      <MemoryRouter initialEntries={['/learn']}>
        <PageViewTracker />
      </MemoryRouter>,
    )
    expect(trackPageView).toHaveBeenCalledWith('/de/learn')
    window.history.pushState({}, '', '/')
  })

  it('starts the heartbeat once and stops it on unmount', () => {
    const { unmount } = render(<MemoryRouter><PageViewTracker /></MemoryRouter>)
    expect(startHeartbeat).toHaveBeenCalledTimes(1)
    unmount()
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
