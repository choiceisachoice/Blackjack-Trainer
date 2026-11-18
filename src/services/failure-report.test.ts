import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const rpc = vi.fn()
const state = { configured: true }
vi.mock('./supabase/client', () => ({
  get isSupabaseConfigured() { return state.configured },
  get supabase() { return state.configured ? { rpc } : null },
}))

import {
  reportFailure,
  flushPendingFailures,
  describeFailure,
  scrubFailureMessage,
  readPendingFailures,
  resetFailureReportForTests,
  PENDING_FAILURES_KEY,
  MAX_PENDING_FAILURES,
  MAX_FAILURE_MESSAGE,
  REPORTED_PLACES,
  type PendingFailure,
} from './failure-report'
import { logFailure } from './failure-log'

/**
 * The operator's half of a failure.
 *
 * What is pinned here is what must not regress quietly: which places are
 * reported, what is taken out of a message before it leaves the browser, and
 * that a report which cannot be sent waits instead of vanishing — without the
 * reporting ever becoming a second failure on the payment path.
 */

const OK = { data: null, error: null, status: 204 }
/** What supabase-js hands back when `fetch` itself failed. */
const NETWORK_DOWN = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 }
const MISSING = { data: null, error: { message: 'Could not find the function', code: 'PGRST202' }, status: 404 }

/** A stored entry, as an earlier page load would have left it. */
const queued = (over: Partial<PendingFailure> = {}): PendingFailure => ({
  place: 'checkout', message: 'Error: earlier', path: '/app', time: new Date().toISOString(), ...over,
})

/** Report and wait until the attempt to send it is over. */
async function report(place: string, cause: unknown): Promise<void> {
  reportFailure(place, cause)
  await flushPendingFailures()
}

beforeEach(() => {
  state.configured = true
  rpc.mockReset()
  rpc.mockResolvedValue(OK)
  sessionStorage.clear()
  resetFailureReportForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('which places are reported', () => {
  it.each([...REPORTED_PLACES])('reports %s', async place => {
    await report(place, new Error('boom'))
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('report_client_failure')
    expect(rpc.mock.calls[0][1].p_place).toBe(place)
  })

  it('is exactly the seven places agreed, so adding one is a decision', () => {
    expect([...REPORTED_PLACES].sort()).toEqual([
      'billing-portal', 'checkout', 'checkout-landing', 'data-export', 'data-reset', 'profile-avatar', 'profile-name',
    ])
  })

  it.each(['auth', 'auth-signup', 'auth-reset-password', 'admin-analytics', 'something-new'])(
    'does not report %s — a wrong password is not a failure of ours', async place => {
      await report(place, new Error('Invalid login credentials'))
      expect(rpc).not.toHaveBeenCalled()
      expect(sessionStorage.getItem(PENDING_FAILURES_KEY)).toBeNull()
    })

  it('goes through logFailure: console for every place, the table for the listed ones', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    logFailure('auth', new Error('nope'))
    logFailure('checkout', new Error('Edge Function returned a non-2xx status code'))
    await flushPendingFailures()
    expect(err).toHaveBeenCalledTimes(2)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_place: 'checkout',
      p_message: 'Error: Edge Function returned a non-2xx status code',
    })
  })
})

describe('what is sent', () => {
  it('sends name and message of an Error, the pathname, and no user', async () => {
    window.history.replaceState({}, '', '/de/account?token=secret#frag')
    await report('billing-portal', new TypeError('Failed to fetch'))
    const args = rpc.mock.calls[0][1]
    expect(args.p_message).toBe('TypeError: Failed to fetch')
    expect(args.p_path).toBe('/de/account')
    expect(Object.keys(args).sort()).toEqual(['p_build', 'p_message', 'p_path', 'p_place'])
    window.history.replaceState({}, '', '/')
  })

  it('never sends the stack', async () => {
    const e = new Error('boom')
    e.stack = 'Error: boom\n    at startCheckout (https://example.com/assets/index-abc.js:1:2)'
    await report('checkout', e)
    expect(rpc.mock.calls[0][1].p_message).toBe('Error: boom')
  })

  it('describes things that are not Errors', () => {
    expect(describeFailure('just a string')).toBe('just a string')
    expect(describeFailure(undefined)).toBe('undefined')
    expect(describeFailure(404)).toBe('404')
    // Some libraries reject with a plain object; "[object Object]" would tell
    // the operator nothing.
    expect(describeFailure({ message: 'relation does not exist', code: '42P01' })).toBe('relation does not exist')
  })

  it('cuts the message at the limit', () => {
    expect(describeFailure(new Error('x'.repeat(2000)))).toHaveLength(MAX_FAILURE_MESSAGE)
  })

  it('sends the hashed entry file as the build', async () => {
    const script = document.createElement('script')
    script.type = 'module'
    script.setAttribute('src', '/assets/index-B4x9Kq.js?v=1')
    document.head.appendChild(script)
    await report('checkout', new Error('boom'))
    expect(rpc.mock.calls[0][1].p_build).toBe('index-B4x9Kq.js')
    script.remove()
  })
})

describe('scrubbing', () => {
  it('removes e-mail addresses', () => {
    expect(scrubFailureMessage('User jane.doe+test@example.co.uk already registered'))
      .toBe('User [email] already registered')
  })

  it('removes a JWT, with or without its signature', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    expect(scrubFailureMessage(`invalid JWT: ${jwt}`)).toBe('invalid JWT: [token]')
    expect(scrubFailureMessage('bad eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0')).toBe('bad [token]')
  })

  it('removes tokens in a quoted URL and prefixed secret keys', () => {
    expect(scrubFailureMessage('GET https://x.supabase.co/auth/v1/verify?token=abc123def&type=recovery failed'))
      .toBe('GET https://x.supabase.co/auth/v1/verify?token=[token]&type=recovery failed')
    // Assembled at run time so the test file itself holds nothing key-shaped.
    const key = ['sk', 'live', 'a1b2c3d4e5f6g7h8'].join('_')
    expect(scrubFailureMessage(`Invalid API Key provided: ${key}`)).toBe('Invalid API Key provided: [key]')
  })

  it('leaves an ordinary message alone', () => {
    const plain = 'FunctionsHttpError: Edge Function returned a non-2xx status code'
    expect(scrubFailureMessage(plain)).toBe(plain)
  })

  it('is applied before anything is sent or stored', async () => {
    rpc.mockResolvedValue(NETWORK_DOWN)
    await report('profile-name', new Error('could not update owner@example.com'))
    expect(rpc.mock.calls[0][1].p_message).toBe('Error: could not update [email]')
    expect(sessionStorage.getItem(PENDING_FAILURES_KEY)).not.toContain('owner@example.com')
  })
})

describe('the queue', () => {
  it('keeps a report that could not be sent', async () => {
    rpc.mockResolvedValue(NETWORK_DOWN)
    await report('checkout', new TypeError('Failed to fetch'))
    const q = readPendingFailures()
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ place: 'checkout', message: 'TypeError: Failed to fetch', path: '/' })
    expect(Number.isNaN(Date.parse(q[0].time))).toBe(false)
  })

  it('keeps it when the client throws instead of answering', async () => {
    rpc.mockRejectedValue(new Error('socket hang up'))
    await report('checkout', new Error('boom'))
    expect(readPendingFailures()).toHaveLength(1)
  })

  it('keeps it when the server is unwell (5xx)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'upstream', code: 'PGRST002' }, status: 503 })
    await report('checkout', new Error('boom'))
    expect(readPendingFailures()).toHaveLength(1)
  })

  it('drops a report the server refused for good, rather than resending it forever', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'bad request', code: '22023' }, status: 400 })
    await report('checkout', new Error('boom'))
    expect(readPendingFailures()).toHaveLength(0)
  })

  it('leaves nothing behind once a report is delivered', async () => {
    await report('checkout', new Error('boom'))
    expect(sessionStorage.getItem(PENDING_FAILURES_KEY)).toBeNull()
  })

  it('holds at most ten entries and drops the oldest first', async () => {
    rpc.mockResolvedValue(NETWORK_DOWN)
    for (let i = 0; i < MAX_PENDING_FAILURES + 5; i++) await report('checkout', new Error(`n${i}`))
    const q = readPendingFailures()
    expect(q).toHaveLength(MAX_PENDING_FAILURES)
    expect(q[0].message).toBe('Error: n5')
    expect(q.at(-1)!.message).toBe('Error: n14')
  })

  it('treats garbage in storage as an empty queue', async () => {
    sessionStorage.setItem(PENDING_FAILURES_KEY, '{not json')
    expect(readPendingFailures()).toEqual([])
    sessionStorage.setItem(PENDING_FAILURES_KEY, JSON.stringify([{ place: 1 }, 'x', null, queued()]))
    expect(readPendingFailures()).toHaveLength(1)
    await expect(flushPendingFailures()).resolves.toBeUndefined()
  })
})

describe('flushing', () => {
  it('sends what an earlier page load left behind, oldest first', async () => {
    sessionStorage.setItem(PENDING_FAILURES_KEY, JSON.stringify([
      queued({ place: 'checkout', message: 'Error: first' }),
      queued({ place: 'billing-portal', message: 'Error: second' }),
    ]))
    await flushPendingFailures()
    expect(rpc.mock.calls.map(c => c[1].p_message)).toEqual(['Error: first', 'Error: second'])
    expect(sessionStorage.getItem(PENDING_FAILURES_KEY)).toBeNull()
  })

  it('flushes the queue before the new report goes out', async () => {
    sessionStorage.setItem(PENDING_FAILURES_KEY, JSON.stringify([queued({ message: 'Error: old' })]))
    await report('data-export', new Error('new'))
    expect(rpc.mock.calls.map(c => c[1].p_message)).toEqual(['Error: old', 'Error: new'])
  })

  it('stops at the first report that cannot be delivered and keeps the rest', async () => {
    sessionStorage.setItem(PENDING_FAILURES_KEY, JSON.stringify([
      queued({ message: 'Error: a' }), queued({ message: 'Error: b' }), queued({ message: 'Error: c' }),
    ]))
    rpc.mockResolvedValueOnce(OK).mockResolvedValue(NETWORK_DOWN)
    await flushPendingFailures()
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(readPendingFailures().map(e => e.message)).toEqual(['Error: b', 'Error: c'])
  })

  it('says when a late report really happened, since the server stamps its arrival', async () => {
    const time = new Date(Date.now() - 3 * 3_600_000).toISOString()
    sessionStorage.setItem(PENDING_FAILURES_KEY, JSON.stringify([queued({ time, message: 'TypeError: Failed to fetch' })]))
    await flushPendingFailures()
    expect(rpc.mock.calls[0][1].p_message).toBe(`[occurred ${time}] TypeError: Failed to fetch`)
  })

  it('runs one flush at a time, so nothing is sent twice', async () => {
    sessionStorage.setItem(PENDING_FAILURES_KEY, JSON.stringify([queued({ message: 'Error: once' })]))
    await Promise.all([flushPendingFailures(), flushPendingFailures(), flushPendingFailures()])
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})

describe('the migration has not been pushed (PGRST202)', () => {
  it('drops the report and warns once per page load, not once per failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue(MISSING)
    await report('checkout', new Error('one'))
    await report('checkout', new Error('two'))
    await report('billing-portal', new Error('three'))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('20261118120000_client_failures.sql')
    expect(err).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(PENDING_FAILURES_KEY)).toBeNull()
  })

  it('empties a queue that can never be delivered, in one call', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    sessionStorage.setItem(PENDING_FAILURES_KEY, JSON.stringify([queued(), queued({ message: 'Error: b' })]))
    rpc.mockResolvedValue(MISSING)
    await flushPendingFailures()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem(PENDING_FAILURES_KEY)).toBeNull()
  })
})

describe('it never throws and never blocks', () => {
  it('returns before anything has been sent', () => {
    let release: (v: typeof OK) => void = () => {}
    rpc.mockReturnValue(new Promise(r => { release = r }))
    expect(reportFailure('checkout', new Error('boom'))).toBeUndefined()
    // Queued synchronously, so a tab closing right now does not lose it.
    expect(readPendingFailures()).toHaveLength(1)
    release(OK)
  })

  it('does nothing at all without Supabase', async () => {
    state.configured = false
    await report('checkout', new Error('boom'))
    expect(rpc).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(PENDING_FAILURES_KEY)).toBeNull()
  })

  it('survives storage that refuses to be read or written', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => reportFailure('checkout', new Error('boom'))).not.toThrow()
    await expect(flushPendingFailures()).resolves.toBeUndefined()
  })

  it('survives a cause that cannot be turned into a string', () => {
    const hostile = { toString() { throw new Error('no') } }
    expect(() => reportFailure('checkout', hostile)).not.toThrow()
    expect(describeFailure(hostile)).toBe('unprintable failure')
    expect(() => reportFailure('checkout', Object.create(null))).not.toThrow()
  })

  it('survives an rpc that throws synchronously', async () => {
    rpc.mockImplementation(() => { throw new Error('client exploded') })
    expect(() => reportFailure('checkout', new Error('boom'))).not.toThrow()
    await expect(flushPendingFailures()).resolves.toBeUndefined()
    expect(readPendingFailures()).toHaveLength(1)
  })
})
