import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { useOnline } from './use-online'

/** Make the browser report a connection state, and announce it the way a browser does. */
function setBrowserOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
  window.dispatchEvent(new Event(online ? 'online' : 'offline'))
}

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
})

describe('useOnline', () => {
  it('is true while the browser reports a connection', () => {
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)
  })

  it('starts false when the page is opened without a connection', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(false)
  })

  it('follows the connection going away and coming back', () => {
    const { result } = renderHook(() => useOnline())
    act(() => setBrowserOnline(false))
    expect(result.current).toBe(false)
    act(() => setBrowserOnline(true))
    expect(result.current).toBe(true)
  })

  it('stops listening when the component is gone', () => {
    const { result, unmount } = renderHook(() => useOnline())
    unmount()
    // Would warn about an update on an unmounted component if it still listened.
    setBrowserOnline(false)
    expect(result.current).toBe(true)
  })

  it('says online on the server, so a prerendered page ships no notice', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    const Probe = () => createElement('span', null, String(useOnline()))
    expect(renderToString(createElement(Probe))).toContain('true')
  })
})
