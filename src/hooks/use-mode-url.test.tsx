import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useEffect, useRef } from 'react'
import { render, screen, act, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { MODE_SLUGS, modeFromPath, modePath, useModeUrl } from './use-mode-url'
import { useAppStore, type AppMode } from '../store/app-store'
import { useLiveSessionStore } from '../store/live-session-store'

/** The hook, plus a window onto the router and a way to drive it. */
let go: (to: number | string) => void = () => {}
function Probe() {
  const ref = useRef<HTMLDivElement>(null)
  useModeUrl(ref)
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    go = to => { void (typeof to === 'number' ? navigate(to) : navigate(to)) }
  }, [navigate])
  const mode = useAppStore(s => s.currentMode)
  return (
    <div ref={ref} data-testid="scroller">
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="mode">{mode}</span>
    </div>
  )
}

const path = () => screen.getByTestId('path').textContent
const mode = () => screen.getByTestId('mode').textContent

function renderAt(url: string) {
  return render(<MemoryRouter initialEntries={[url]}><Probe /></MemoryRouter>)
}

beforeEach(() => {
  useAppStore.setState({ currentMode: 'home' })
  useLiveSessionStore.setState({ activeMode: null, pending: null })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('mode slugs', () => {
  it('gives every mode an address and no two the same', () => {
    const slugs = Object.values(MODE_SLUGS)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const m of Object.keys(MODE_SLUGS) as AppMode[]) expect(modeFromPath(modePath(m))).toBe(m)
  })

  it('reads home from /app with or without a slash, and nothing from outside the app', () => {
    expect(modeFromPath('/app')).toBe('home')
    expect(modeFromPath('/app/')).toBe('home')
    expect(modeFromPath('/app/speed/')).toBe('speedDrill')
    expect(modeFromPath('/app/nope')).toBeNull()
    expect(modeFromPath('/apple')).toBeNull()
    expect(modeFromPath('/learn')).toBeNull()
  })
})

describe('useModeUrl', () => {
  it('opens the screen the URL names — a refresh or a link lands where it pointed', () => {
    renderAt('/app/flashcards')
    expect(mode()).toBe('deviationTraining')
    // And does not push /app over it on the way in.
    expect(path()).toBe('/app/flashcards')
  })

  it('writes every in-app switch into the address bar', () => {
    renderAt('/app')
    act(() => useAppStore.getState().setMode('analytics'))
    expect(path()).toBe('/app/analytics')
    act(() => useAppStore.getState().setMode('home'))
    expect(path()).toBe('/app')
  })

  it('makes Back go back a screen, and Forward forward', () => {
    renderAt('/app')
    act(() => useAppStore.getState().setMode('speedDrill'))
    act(() => useAppStore.getState().setMode('learn'))
    act(() => go(-1))
    expect(mode()).toBe('speedDrill')
    act(() => go(-1))
    expect(mode()).toBe('home')
    act(() => go(1))
    expect(mode()).toBe('speedDrill')
  })

  it('corrects a slug that does not exist instead of leaving it in the address bar', () => {
    renderAt('/app/settings')
    expect(path()).toBe('/app')
    expect(mode()).toBe('home')
  })

  it('asks before Back walks away from a hand in progress, and keeps the table up', () => {
    renderAt('/app')
    act(() => useAppStore.getState().setMode('casinoSession'))
    act(() => useLiveSessionStore.getState().beginSession('casinoSession'))
    act(() => go(-1))
    expect(useLiveSessionStore.getState().pending?.target).toEqual({ kind: 'mode', mode: 'home' })
    expect(mode()).toBe('casinoSession')
    expect(path()).toBe('/app/casino')
  })

  it('lets Back through from a screen the session is not on', () => {
    // The session waits in the background; leaving Analytics loses nothing.
    renderAt('/app')
    act(() => useAppStore.getState().setMode('casinoSession'))
    act(() => useLiveSessionStore.getState().beginSession('casinoSession'))
    act(() => useAppStore.getState().setMode('analytics'))
    act(() => go(-1))
    expect(useLiveSessionStore.getState().pending).toBeNull()
  })

  it('starts each screen at the top of the shared scroller', () => {
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo
    renderAt('/app')
    scrollTo.mockClear()
    act(() => useAppStore.getState().setMode('learn'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
  })

  it('asks the browser to confirm a refresh only while a hand exists', () => {
    renderAt('/app')
    const event = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented }
    expect(event()).toBe(false)
    act(() => useLiveSessionStore.getState().beginSession('casinoSession'))
    expect(event()).toBe(true)
    act(() => useLiveSessionStore.getState().endSession())
    expect(event()).toBe(false)
  })

  it('does nothing outside /app', () => {
    renderAt('/')
    act(() => useAppStore.getState().setMode('analytics'))
    expect(path()).toBe('/')
  })
})
