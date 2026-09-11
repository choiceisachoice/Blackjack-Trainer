import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '@supabase/supabase-js'

const updateUser = vi.fn()
vi.mock('./client', () => ({
  requireSupabase: () => ({ auth: { updateUser } }),
  isSupabaseConfigured: true,
}))

import { AVATAR_IDS, BASE_AVATAR_IDS, avatarLabelKey, avatarOf, updateAvatar } from './profile-avatar'

const user = (meta: Record<string, unknown>): User =>
  ({ id: 'u1', email: 'ada@example.com', user_metadata: meta }) as unknown as User

describe('the preset list', () => {
  it('starts with the twelve base pictures and carries the earned ones after', () => {
    expect(BASE_AVATAR_IDS).toHaveLength(12)
    expect(AVATAR_IDS.length).toBeGreaterThan(12)
    expect(AVATAR_IDS.slice(0, 12)).toEqual([...BASE_AVATAR_IDS])
  })

  it('names each base picture with a translation key', () => {
    expect(avatarLabelKey('chip-red')).toBe('account.avatar.chipRed')
    expect(avatarLabelKey('spade')).toBe('account.avatar.spade')
  })
})

describe('avatarOf', () => {
  it('reads the chosen picture from the metadata', () => {
    expect(avatarOf(user({ avatar: 'heart' }))).toBe('heart')
    expect(avatarOf(user({ avatar: 'level-7' }))).toBe('level-7')
  })

  it('ignores anything that is not in the catalogue, so a bad value shows the initial', () => {
    expect(avatarOf(user({ avatar: 'https://evil/x.png' }))).toBeNull()
    expect(avatarOf(user({}))).toBeNull()
    expect(avatarOf(null)).toBeNull()
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
