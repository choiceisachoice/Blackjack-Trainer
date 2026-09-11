import type { User } from '@supabase/supabase-js'
import { requireSupabase } from './client'
import { isAvatarId, type AvatarId, type BaseAvatarId } from '../avatar-catalog'

export type { AvatarId } from '../avatar-catalog'
export { AVATAR_IDS, BASE_AVATAR_IDS, isAvatarId } from '../avatar-catalog'

/** The translation key naming a base picture, for its accessible name. */
export function avatarLabelKey(id: BaseAvatarId): string {
  const camel = id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
  return `account.avatar.${camel}`
}

/**
 * The chosen picture, or null for the default initial.
 *
 * Kept in the auth metadata, beside the username, rather than in
 * `profiles.settings`: the profile sync rewrites that jsonb from a copy it
 * took at sign-in, so a value written there separately would be overwritten
 * by the next XP push.
 *
 * This says what was *chosen*, not what may be shown — the metadata is
 * client-writable. `resolveAvatar` in the catalogue does the second half
 * against the stores.
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
 * @param id - A catalogue id, or null to go back to the initial
 * @throws When the metadata write fails
 */
export async function updateAvatar(id: AvatarId | null): Promise<void> {
  const { error } = await requireSupabase().auth.updateUser({ data: { avatar: id } })
  if (error) throw error
}
