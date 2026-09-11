import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '@supabase/supabase-js'

const select = vi.fn()
const eq = vi.fn(() => ({ select }))
const update = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ update }))
const getSession = vi.fn()
const updateUser = vi.fn()

vi.mock('./client', () => ({
  requireSupabase: () => ({ from, auth: { getSession, updateUser } }),
  isSupabaseConfigured: true,
}))

import { displayNameOf, normalizeDisplayName, updateDisplayName } from './profile-name'

const user = (overrides: Partial<User>): User =>
  ({ id: 'u1', email: 'ada@example.com', user_metadata: {}, ...overrides }) as unknown as User

describe('displayNameOf', () => {
  it('prefers the name chosen at sign-up', () => {
    expect(displayNameOf(user({ user_metadata: { username: 'Ada' } }))).toBe('Ada')
  })

  it('falls back to the address before the @, as the signup trigger does', () => {
    expect(displayNameOf(user({}))).toBe('ada')
    expect(displayNameOf(user({ user_metadata: { username: '   ' } }))).toBe('ada')
  })

  it('is null for nobody', () => {
    expect(displayNameOf(null)).toBeNull()
  })
})

describe('normalizeDisplayName', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normalizeDisplayName('  Ada   Lovelace ')).toBe('Ada Lovelace')
  })

  it('rejects names out of bounds', () => {
    expect(normalizeDisplayName('A')).toBeNull()
    expect(normalizeDisplayName('x'.repeat(33))).toBeNull()
  })
})

describe('updateDisplayName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    select.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
    updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  })

  it('writes the profile row and the auth metadata', async () => {
    await updateDisplayName('Ada')
    expect(from).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ username: 'Ada' }))
    expect(eq).toHaveBeenCalledWith('id', 'u1')
    expect(updateUser).toHaveBeenCalledWith({ data: { username: 'Ada' } })
  })

  it('refuses when there is no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    await expect(updateDisplayName('Ada')).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })

  it('treats a write that matched no row as a failure, not a success', async () => {
    // supabase-js reports neither an error nor a count for a write that hit
    // nothing. Without the `.select()` check this would have said "saved".
    select.mockResolvedValue({ data: [], error: null })
    await expect(updateDisplayName('Ada')).rejects.toThrow()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('surfaces a failed row write', async () => {
    select.mockResolvedValue({ data: null, error: new Error('permission denied') })
    await expect(updateDisplayName('Ada')).rejects.toThrow('permission denied')
  })
})
