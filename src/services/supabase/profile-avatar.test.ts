import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '@supabase/supabase-js'

const updateUser = vi.fn()
vi.mock('./client', () => ({
  requireSupabase: () => ({ auth: { updateUser } }),
  isSupabaseConfigured: true,
}))

import { AVATAR_IDS, avatarLabelKey, avatarOf, isAvatarId, updateAvatar } from './profile-avatar'

const user = (meta: Record<string, unknown>): User =>
  ({ id: 'u1', email: 'ada@example.com', user_metadata: meta }) as unknown as User

describe('the preset list', () => {
  it('has twelve distinct, stable ids', () => {
    expect(new Set(AVATAR_IDS).size).toBe(12)
    // Stored verbatim in every account that chose one — a rename orphans them.
    expect(AVATAR_IDS).toContain('spade')
    expect(AVATAR_IDS).toContain('ace-spades')
  })

  it('names each one with a translation key', () => {
    expect(avatarLabelKey('chip-red')).toBe('account.avatar.chipRed')
    expect(avatarLabelKey('spade')).toBe('account.avatar.spade')
  })
})

describe('avatarOf', () => {
  it('reads the chosen preset from the metadata', () => {
    expect(avatarOf(user({ avatar: 'heart' }))).toBe('heart')
  })

  it('ignores anything that is not a preset, so a bad value shows the initial', () => {
    expect(avatarOf(user({ avatar: 'https://evil/x.png' }))).toBeNull()
    expect(avatarOf(user({}))).toBeNull()
    expect(avatarOf(null)).toBeNull()
  })
})

describe('isAvatarId', () => {
  it('accepts presets and nothing else', () => {
    expect(isAvatarId('club')).toBe(true)
    expect(isAvatarId('CLUB')).toBe(false)
    expect(isAvatarId(3)).toBe(false)
  })
})

describe('updateAvatar', () => {
  beforeEach(() => {
    updateUser.mockReset()
    updateUser.mockResolvedValue({ data: { user: {} }, error: null })
  })

  it('writes the id to the auth metadata', async () => {
    await updateAvatar('diamond')
    expect(updateUser).toHaveBeenCalledWith({ data: { avatar: 'diamond' } })
  })

  it('writes null to go back to the initial', async () => {
    await updateAvatar(null)
    expect(updateUser).toHaveBeenCalledWith({ data: { avatar: null } })
  })

  it('surfaces a failed write', async () => {
    updateUser.mockResolvedValue({ data: {}, error: new Error('nope') })
    await expect(updateAvatar('spade')).rejects.toThrow('nope')
  })
})
