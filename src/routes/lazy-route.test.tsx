import { describe, it, expect, afterEach } from 'vitest'
import { Suspense, useEffect, useState } from 'react'
import { render, screen, cleanup, act } from '@testing-library/react'
import { lazyRoute } from './lazy-route'

afterEach(cleanup)

const Fallback = () => <div data-testid="fallback">loading</div>

describe('lazyRoute', () => {
  it('suspends like React.lazy when the chunk was not fetched first', async () => {
    const Page = lazyRoute(() => Promise.resolve({ default: () => <p>the page</p> }))
    render(<Suspense fallback={<Fallback />}><Page /></Suspense>)
    expect(screen.getByTestId('fallback')).toBeInTheDocument()
    expect(await screen.findByText('the page')).toBeInTheDocument()
  })

  it('renders the page in the first commit once preloaded — no fallback at all', async () => {
    // This is the whole point: over a prerendered page the first commit
    // replaces what the visitor is reading, so it must already be the page.
    const Page = lazyRoute(() => Promise.resolve({ default: () => <p>the page</p> }))
    await Page.preload()

    let fallbackEverShown = false
    const Spy = () => { fallbackEverShown = true; return null }
    render(<Suspense fallback={<Spy />}><Page /></Suspense>)

    expect(screen.getByText('the page')).toBeInTheDocument()
    expect(fallbackEverShown).toBe(false)
  })

  it('fetches the chunk once however often it is asked', async () => {
    let calls = 0
    const Page = lazyRoute(() => { calls += 1; return Promise.resolve({ default: () => <p>x</p> }) })
    await Promise.all([Page.preload(), Page.preload()])
    await Page.preload()
    // One for the preload; `React.lazy` has not been rendered, so not a second.
    expect(calls).toBe(1)
  })

  it('does not remount a page that was mounted lazily when the preload lands later', async () => {
    // A re-render after the chunk arrived must not swap the lazy element for
    // the direct one: that is a different element type, and React would
    // unmount the live page — its state, its scroll, a hand in progress.
    let mounts = 0
    function Inner() {
      useEffect(() => { mounts += 1 }, [])
      return <p>the page</p>
    }
    const Page = lazyRoute(() => Promise.resolve({ default: Inner }))

    function Host() {
      const [, setTick] = useState(0)
      return (
        <>
          <button onClick={() => setTick(t => t + 1)}>rerender</button>
          <Suspense fallback={<Fallback />}><Page /></Suspense>
        </>
      )
    }
    render(<Host />)
    await screen.findByText('the page')
    await Page.preload()
    await act(async () => { screen.getByText('rerender').click() })

    expect(screen.getByText('the page')).toBeInTheDocument()
    expect(mounts).toBe(1)
  })

  it('never rejects, and lets a failed fetch be tried again', async () => {
    // A stale chunk after a deploy must not hold up the first render; the
    // error boundary around the route reports it and offers the reload.
    let attempt = 0
    const Page = lazyRoute(() => {
      attempt += 1
      return attempt === 1
        ? Promise.reject(new Error('Failed to fetch dynamically imported module'))
        : Promise.resolve({ default: () => <p>second try</p> })
    })
    await expect(Page.preload()).resolves.toBeUndefined()
    await Page.preload()
    expect(attempt).toBe(2)
    render(<Suspense fallback={<Fallback />}><Page /></Suspense>)
    expect(screen.getByText('second try')).toBeInTheDocument()
  })
})
