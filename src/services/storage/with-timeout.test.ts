import { describe, it, expect, vi, afterEach } from 'vitest'
import { withTimeout, TimeoutError } from './with-timeout'

afterEach(() => { vi.useRealTimers() })

describe('withTimeout', () => {
  it('passes a value through when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7)
  })

  it('passes the original rejection through', async () => {
    await expect(withTimeout(Promise.reject(new Error('offline')), 1000)).rejects.toThrow('offline')
  })

  it('rejects with a TimeoutError when the promise never settles', async () => {
    vi.useFakeTimers()
    const outcome = withTimeout(new Promise<void>(() => {}), 5000, 'cloud save').catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(5000)
    const error = await outcome
    expect(error).toBeInstanceOf(TimeoutError)
    expect((error as Error).message).toContain('cloud save')
  })

  it('leaves no timer behind once the promise has settled', async () => {
    vi.useFakeTimers()
    await withTimeout(Promise.resolve('done'), 5000)
    expect(vi.getTimerCount()).toBe(0)
  })
})
