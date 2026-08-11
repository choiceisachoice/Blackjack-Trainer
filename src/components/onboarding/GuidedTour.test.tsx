import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { GuidedTour } from './GuidedTour'
import { TOUR_STOPS } from './tour-stops'
import { hasSeenTour } from '../../services/recommendation'
import i18next from 'i18next'

vi.mock('framer-motion', () => ({ useReducedMotion: () => false }))

/** The stops carry keys; the callout shows the message they name. */
const text = (key: string) => i18next.t(key)

/**
 * jsdom has no layout: `getBoundingClientRect` is all zeros and
 * `scrollIntoView` does not exist. Both are stubbed so the component's
 * behaviour can be tested; the positioning arithmetic is covered properly in
 * `tour-geometry.test.ts`, where it can be checked against real numbers.
 */
beforeEach(() => {
  localStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 100, left: 100, width: 200, height: 80,
    bottom: 180, right: 300, x: 100, y: 100, toJSON: () => ({}),
  } as DOMRect)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** Put real anchors on the page for the tour to find. */
function mountAnchors(anchors: string[]) {
  for (const a of anchors) {
    const el = document.createElement('div')
    el.setAttribute('data-testid', a)
    document.body.appendChild(el)
  }
}

const ALL = TOUR_STOPS.map(s => s.anchor)

describe('finding things to point at', () => {
  it('closes immediately when there is nothing on the page', () => {
    const onClose = vi.fn()
    render(<GuidedTour onClose={onClose} />)
    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByTestId('tour-callout')).toBeNull()
  })

  it('skips stops whose anchor is missing instead of stalling on them', () => {
    // The home screen shows different things to different accounts, so a
    // missing anchor has to be survivable.
    mountAnchors(['analytics-button'])
    render(<GuidedTour onClose={() => {}} />)

    expect(screen.getByTestId('tour-callout')).toBeInTheDocument()
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(screen.getByTestId('tour-title')).toHaveTextContent('Analytics')
  })

  it('walks the stops in page order', () => {
    mountAnchors(ALL)
    render(<GuidedTour onClose={() => {}} />)
    expect(screen.getByTestId('tour-title')).toHaveTextContent(text(TOUR_STOPS[0].titleKey))
    expect(screen.getByText(`1 / ${ALL.length}`)).toBeInTheDocument()
  })
})

describe('moving through it', () => {
  beforeEach(() => mountAnchors(ALL))

  it('advances with Next and goes back with Back', () => {
    render(<GuidedTour onClose={() => {}} />)

    // No way back from the first stop — there is nothing behind it.
    expect(screen.queryByTestId('tour-back')).toBeNull()

    fireEvent.click(screen.getByTestId('tour-next'))
    expect(screen.getByTestId('tour-title')).toHaveTextContent(text(TOUR_STOPS[1].titleKey))

    fireEvent.click(screen.getByTestId('tour-back'))
    expect(screen.getByTestId('tour-title')).toHaveTextContent(text(TOUR_STOPS[0].titleKey))
  })

  it('closes at the end and remembers it ran', () => {
    const onClose = vi.fn()
    render(<GuidedTour onClose={onClose} />)

    for (let i = 0; i < TOUR_STOPS.length - 1; i++) {
      fireEvent.click(screen.getByTestId('tour-next'))
    }
    // Last stop says Done rather than Next, so nobody is left wondering
    // whether there is more.
    expect(screen.getByTestId('tour-next')).toHaveTextContent('Done')

    fireEvent.click(screen.getByTestId('tour-next'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(hasSeenTour()).toBe(true)
  })

  it('can be abandoned at any point', () => {
    const onClose = vi.fn()
    render(<GuidedTour onClose={onClose} />)

    fireEvent.click(screen.getByTestId('tour-next'))
    fireEvent.click(screen.getByTestId('tour-skip'))

    expect(onClose).toHaveBeenCalledTimes(1)
    // Leaving early still counts as seen — nobody wants it starting itself
    // again after they closed it.
    expect(hasSeenTour()).toBe(true)
  })

  it('answers the keyboard', () => {
    const onClose = vi.fn()
    render(<GuidedTour onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('tour-title')).toHaveTextContent(text(TOUR_STOPS[1].titleKey))

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('tour-title')).toHaveTextContent(text(TOUR_STOPS[0].titleKey))

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes exactly once when the end is reached twice over', () => {
    // React calls state updaters twice under StrictMode. `finish` writes to
    // storage and closes the tour, so it is called outside the updater — this
    // is the test that would catch it moving back in.
    const onClose = vi.fn()
    render(<GuidedTour onClose={onClose} />)
    for (let i = 0; i < TOUR_STOPS.length; i++) {
      fireEvent.click(screen.getByTestId('tour-next'))
    }
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('what it draws', () => {
  beforeEach(() => mountAnchors(ALL))

  it('shows a spotlight and a callout from the very first frame', () => {
    // Not animated in from transparent: an overlay that dims the page and then
    // fails to paint its own callout is a dead end with no visible way out.
    render(<GuidedTour onClose={() => {}} />)
    const callout = screen.getByTestId('tour-callout')
    expect(callout).toBeInTheDocument()
    expect(callout.style.opacity).not.toBe('0')
    expect(screen.getByTestId('tour-spotlight')).toBeInTheDocument()
  })

  it('gives every stop a title and a body', () => {
    for (const stop of TOUR_STOPS) {
      // Resolved, not just present: a key with no message renders its own
      // path into the callout, which looks like a bug and reads like one.
      expect(text(stop.titleKey).length).toBeGreaterThan(0)
      expect(text(stop.titleKey)).not.toBe(stop.titleKey)
      expect(text(stop.bodyKey).length).toBeGreaterThan(0)
      expect(text(stop.bodyKey)).not.toBe(stop.bodyKey)
    }
  })
})
