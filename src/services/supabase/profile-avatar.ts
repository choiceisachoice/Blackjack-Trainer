import type { User } from '@supabase/supabase-js'
import { requireSupabase } from './client'

/**
 * The pictures a person can choose from, drawn by the app in its own
 * vocabulary — the four suits, four chips, four court cards.
 *
 * Presets rather than uploads, deliberately. An uploaded photo needs a storage
 * bucket, per-user policies, client-side resizing and something to do about a
 * picture that should not be there; a preset needs one string in the auth
 * metadata. The ids are stable — they are what gets stored — so a rename here
 * would orphan every account that chose the old one.
 */
export const AVATAR_IDS = [
  'spade', 'heart', 'diamond', 'club',
  'chip-red', 'chip-blue', 'chip-green', 'chip-black',
  'ace-spades', 'king-hearts', 'queen-diamonds', 'jack-clubs',
] as const

export type AvatarId = (typeof AVATAR_IDS)[number]

/** The translation key naming an avatar, for its accessible name. */
export function avatarLabelKey(id: AvatarId): string {
  const camel = id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
  return `account.avatar.${camel}`
}

/**
 * Whether a stored value names one of the presets.
 *
 * @param value - Whatever the metadata holds
 */
export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && (AVATAR_IDS as readonly string[]).includes(value)
}

/**
 * The chosen picture, or null for the default initial.
 *
 * Kept in the auth metadata, beside the username, rather than in
 * `profiles.settings`: the profile sync rewrites that jsonb from a copy it
 * took at sign-in, so a value written there separately would be overwritten
 * by the next XP push.
 *
 * @param user - The signed-in user, or null
 */
export function avatarOf(user: User | null): AvatarId | null {
  const meta = user?.user_metadata as Record<string, unknown> | undefined
  const v = meta?.avatar
  return isAvatarId(v) ? v : null
}

/**
 * Choose a picture, or none.
 *
 * @param id - A preset id, or null to go back to the initial
 * @throws When the metadata write fails
 */
export async function updateAvatar(id: AvatarId | null): Promise<void> {
  const { error } = await requireSupabase().auth.updateUser({ data: { avatar: id } })
  if (error) throw error
}
