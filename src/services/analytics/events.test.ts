import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const rpc = vi.fn()
const state = { configured: true }
vi.mock('../supabase/client', () => ({
  get isSupabaseConfigured() { return state.configured },
  get supabase() { return state.configured ? { rpc } : null },
}))

import { trackEvent, resetEventsForTests, FUNNEL_EVENTS, FUNNEL_MIGRATION, type FunnelEvent } from './events'
import { VISITOR_ID_KEY } from './visitor'

const MISSING = { code: 'PGRST202', message: 'Could not find the function public.analytics_event' }

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state.configured = true
  rpc.mockReset()
  rpc.mockResolvedValue({ data: null, error: null })
  localStorage.clear()
  // The visitor has accepted: most tests are about what is sent once they have.
  localStorage.setItem('bjt_cookie_consent', 'accepted')
  resetEventsForTests()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true })
})

describe('trackEvent — what is sent', () => {
  it('calls analytics_event with the visitor id and the name, and nothing else', async () => {
    await trackEvent('paywall_view')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('analytics_event', {
      p_visitor_id: localStorage.getItem(VISITOR_ID_KEY),
      p_name: 'paywall_view',
    })
    expect(localStorage.getItem(VISITOR_ID_KEY)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it.each(FUNNEL_EVENTS)('sends %s', async (name) => {
    await trackEvent(name)
    expect(rpc.mock.calls[0][1].p_name).toBe(name)
  })

  it('uses the same visitor id as the page views', async () => {
    localStorage.setItem(VISITOR_ID_KEY, '11111111-2222-4333-8444-555555555555')
    await trackEvent('signup_view')
    expect(rpc.mock.calls[0][1].p_visitor_id).toBe('11111111-2222-4333-8444-555555555555')
  })

  it('does not send a name that is not on the list', async () => {
    await trackEvent('purchase' as FunnelEvent)
    await trackEvent('' as FunnelEvent)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('lists exactly the names the migration allows', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', FUNNEL_MIGRATION), 'utf8')
    const list = /p_name not in \(([^)]*)\)/.exec(sql)
    expect(list).not.toBeNull()
    expect(list![1].split(',').map(s => s.trim().replace(/'/g, ''))).toEqual([...FUNNEL_EVENTS])
  })
})

describe('trackEvent — consent', () => {
  it('sends nothing, and stores no visitor id, before the visitor has answered', async () => {
    localStorage.removeItem('bjt_cookie_consent')
    await trackEvent('signup_view')
    expect(rpc).not.toHaveBeenCalled()
    expect(localStorage.getItem(VISITOR_ID_KEY)).toBeNull()
  })

  it('sends nothing after a decline', async () => {
    localStorage.setItem('bjt_cookie_consent', 'declined')
    await trackEvent('checkout_start')
    expect(rpc).not.toHaveBeenCalled()
    expect(localStorage.getItem(VISITOR_ID_KEY)).toBeNull()
  })

  it('sends nothing under automation, Do Not Track or without Supabase', async () => {
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true })
    await trackEvent('paywall_view')
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })

    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true })
    await trackEvent('paywall_view')
    Object.defineProperty(navigator, 'doNotTrack', { value: null, configurable: true })

    state.configured = false
    await trackEvent('paywall_view')

    expect(rpc).not.toHaveBeenCalled()
  })

  it('asks again on every call: a yes given later counts from then on', async () => {
    localStorage.removeItem('bjt_cookie_consent')
    await trackEvent('signup_view')
    localStorage.setItem('bjt_cookie_consent', 'accepted')
    await trackEvent('signup_view')
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('trackEvent — before the migration is applied (PGRST202)', () => {
  it('warns once, naming the migration file, and does not throw', async () => {
    rpc.mockResolvedValue({ data: null, error: MISSING })
    await expect(trackEvent('paywall_view')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain(FUNNEL_MIGRATION)
  })

  it('stays silent, and sends nothing more, for the rest of the page load', async () => {
    rpc.mockResolvedValue({ data: null, error: MISSING })
    await trackEvent('paywall_view')
    await trackEvent('checkout_start')
    await trackEvent('signup_view')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('never writes to console.error, which is where real failures go', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: MISSING })
    await trackEvent('paywall_view')
    expect(error).not.toHaveBeenCalled()
  })

  it('points at the migration file that exists', async () => {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    expect(existsSync(join(process.cwd(), 'supabase', 'migrations', FUNNEL_MIGRATION))).toBe(true)
  })
})

describe('trackEvent — never throws', () => {
  it('swallows an error answer, logging the first one only', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    await expect(trackEvent('paywall_view')).resolves.toBeUndefined()
    await expect(trackEvent('checkout_start')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    // Unlike a missing function, another error does not stop later attempts.
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('swallows a rejected request', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(trackEvent('signup_done')).resolves.toBeUndefined()
  })

  it('swallows a client that throws synchronously', async () => {
    rpc.mockImplementation(() => { throw new Error('boom') })
    await expect(trackEvent('signup_done')).resolves.toBeUndefined()
  })

  it('swallows storage that throws: no visitor id, nothing sent', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    await expect(trackEvent('paywall_view')).resolves.toBeUndefined()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('swallows a console that throws', async () => {
    warn.mockImplementation(() => { throw new Error('no console') })
    rpc.mockRejectedValue(new Error('down'))
    await expect(trackEvent('paywall_view')).resolves.toBeUndefined()
  })
})
