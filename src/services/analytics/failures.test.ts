import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const state = { configured: true }
vi.mock('../supabase/client', () => ({
  get isSupabaseConfigured() { return state.configured },
  get supabase() { return state.configured ? { rpc } : null },
}))

import { fetchClientFailures, CLIENT_FAILURES_MIGRATION, type ClientFailure } from './failures'

const ROW: ClientFailure = {
  id: 7,
  occurred_at: '2026-11-18T09:30:00+00:00',
  place: 'checkout',
  message: 'FunctionsHttpError: Edge Function returned a non-2xx status code',
  path: '/de/app',
  signed_in: true,
  app_build: 'index-B4x9Kq.js',
}

beforeEach(() => {
  state.configured = true
  rpc.mockReset()
})

describe('fetchClientFailures', () => {
  it('asks client_failures_recent for the latest 50', async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null })
    const r = await fetchClientFailures()
    expect(rpc).toHaveBeenCalledWith('client_failures_recent', { p_limit: 50 })
    expect(r).toEqual({ kind: 'ok', rows: [ROW] })
  })

  it('passes another limit through', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await fetchClientFailures(10)
    expect(rpc).toHaveBeenCalledWith('client_failures_recent', { p_limit: 10 })
  })

  it('answers with an empty list when there is nothing, or no data at all', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await fetchClientFailures()).toEqual({ kind: 'ok', rows: [] })
  })

  it('names the missing migration instead of throwing when the function does not exist', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.client_failures_recent' } })
    expect(await fetchClientFailures()).toEqual({ kind: 'missing-migration' })
  })

  it('throws every other error, a refusal included', async () => {
    const refusal = { code: '42501', message: 'forbidden' }
    rpc.mockResolvedValue({ data: null, error: refusal })
    await expect(fetchClientFailures()).rejects.toBe(refusal)
  })

  it('throws without Supabase rather than pretending there are no failures', async () => {
    state.configured = false
    await expect(fetchClientFailures()).rejects.toThrow(/unavailable/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('points at the migration file that exists', async () => {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    expect(existsSync(join(process.cwd(), 'supabase', 'migrations', CLIENT_FAILURES_MIGRATION))).toBe(true)
  })
})
