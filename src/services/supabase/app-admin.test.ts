import { describe, it, expect, vi, beforeEach } from 'vitest'

const limit = vi.fn()
const state: { client: unknown } = { client: null }
vi.mock('./client', () => ({
  get supabase() { return state.client },
  get isSupabaseConfigured() { return state.client !== null },
}))

import { isAppAdmin } from './app-admin'

beforeEach(() => {
  limit.mockReset()
  state.client = { from: (table: string) => ({ select: (cols: string) => ({ limit: (n: number) => limit(table, cols, n) }) }) }
})

describe('isAppAdmin', () => {
  it('is true when the caller can see a row of app_admins', async () => {
    limit.mockResolvedValue({ data: [{ user_id: 'u1' }], error: null })
    expect(await isAppAdmin()).toBe(true)
    expect(limit).toHaveBeenCalledWith('app_admins', 'user_id', 1)
  })

  it('is false on no rows, on an error, and without Supabase', async () => {
    limit.mockResolvedValue({ data: [], error: null })
    expect(await isAppAdmin()).toBe(false)
    limit.mockResolvedValue({ data: null, error: { message: 'nope' } })
    expect(await isAppAdmin()).toBe(false)
    state.client = null
    expect(await isAppAdmin()).toBe(false)
  })
})
