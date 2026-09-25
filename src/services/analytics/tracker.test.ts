import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const rpc = vi.fn()
const state = { configured: true }
vi.mock('../supabase/client', () => ({
  get isSupabaseConfigured() { return state.configured },
  get supabase() { return state.configured ? { rpc } : null },
}))

import { referrerHost, trackPageView, ping, startHeartbeat, HEARTBEAT_MS, resetTrackerForTests } from './tracker'
import { VISITOR_ID_KEY } from './visitor'

const ORIGIN = 'http://localhost:3000'

beforeEach(() => {
  state.configured = true
  rpc.mockReset()
  rpc.mockResolvedValue({ data: 'sid', error: null })
  localStorage.clear()
  resetTrackerForTests()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('')))
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('referrerHost', () => {
  it('keeps the host only, lower-cased', () => {
    expect(referrerHost('https://WWW.Google.com/search?q=secret+terms', ORIGIN)).toBe('www.google.com')
  })

  it('drops an internal referrer, an empty one and garbage', () => {
    expect(referrerHost(`${ORIGIN}/learn`, ORIGIN)).toBeNull()
    expect(referrerHost('', ORIGIN)).toBeNull()
    expect(referrerHost('not a url', ORIGIN)).toBeNull()
  })
})

describe('trackPageView', () => {
  it('calls analytics_track with the visitor id, the path, the referrer host and the device', async () => {
    await trackPageView('/de/learn')
    expect(rpc).toHaveBeenCalledTimes(1)
    const [fn, args] = rpc.mock.calls[0]
    expect(fn).toBe('analytics_track')
    expect(args.p_visitor_id).toBe(localStorage.getItem(VISITOR_ID_KEY))
    expect(args.p_pathname).toBe('/de/learn')
    expect(args.p_referrer_host).toBeNull()
    expect(['mobile', 'tablet', 'desktop']).toContain(args.p_device)
  })

  it('uses the same visitor id across page views', async () => {
    await trackPageView('/')
    await trackPageView('/learn')
    expect(rpc.mock.calls[0][1].p_visitor_id).toBe(rpc.mock.calls[1][1].p_visitor_id)
  })

  it('does nothing when the gate says no', async () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
    await trackPageView('/')
    expect(rpc).not.toHaveBeenCalled()
    expect(localStorage.getItem(VISITOR_ID_KEY)).toBeNull()
  })

  it('does nothing without Supabase', async () => {
    state.configured = false
    await trackPageView('/')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never throws and warns once, not once per view', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(trackPageView('/')).resolves.toBeUndefined()
    rpc.mockRejectedValue(new Error('network'))
    await expect(trackPageView('/learn')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('ping', () => {
  it('posts the visitor id to the ping RPC with keepalive and the anon key only', () => {
    localStorage.setItem(VISITOR_ID_KEY, '11111111-1111-4111-8111-111111111111')
    ping()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/rest\/v1\/rpc\/analytics_ping$/)
    expect(init.method).toBe('POST')
    expect(init.keepalive).toBe(true)
    expect(JSON.parse(init.body)).toEqual({ p_visitor_id: '11111111-1111-4111-8111-111111111111' })
    expect(init.headers.apikey).toBeDefined()
  })

  it('does nothing when the gate says no', () => {
    state.configured = false
    ping()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('startHeartbeat', () => {
  it('pings once a minute while visible, once when hidden, and stops when told', () => {
    vi.useFakeTimers()
    const stop = startHeartbeat()
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    expect(fetchMock).toHaveBeenCalledTimes(0)

    vi.advanceTimersByTime(HEARTBEAT_MS * 2)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // Hidden: the interval is off.
    vi.advanceTimersByTime(HEARTBEAT_MS * 3)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(HEARTBEAT_MS)
    expect(fetchMock).toHaveBeenCalledTimes(4)

    stop()
    vi.advanceTimersByTime(HEARTBEAT_MS * 5)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('pings on pagehide', () => {
    const stop = startHeartbeat()
    window.dispatchEvent(new Event('pagehide'))
    expect(fetch).toHaveBeenCalledTimes(1)
    stop()
  })

  it('is inert when the gate says no', () => {
    vi.useFakeTimers()
    state.configured = false
    const stop = startHeartbeat()
    vi.advanceTimersByTime(HEARTBEAT_MS * 3)
    expect(fetch).not.toHaveBeenCalled()
    stop()
  })
})
