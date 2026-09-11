import type { User } from '@supabase/supabase-js'
import { requireSupabase } from './client'

/** Bounds on a display name. Short enough to fit a nav bar, long enough for a real name. */
export const DISPLAY_NAME_MIN = 2
export const DISPLAY_NAME_MAX = 32

/**
 * The name to show for a person.
 *
 * Sign-up stores the chosen username in the auth metadata and the signup
 * trigger copies it onto `profiles.username`; nothing ever read either back.
 * Falls back to the part of the address before the `@`, which is what the
 * trigger itself does for a sign-up that left the name blank.
 *
 * @param user - The signed-in user, or null
 * @returns A name to display, or null when there is nobody signed in
 */
export function displayNameOf(user: User | null): string | null {
  if (!user) return null
  const meta = user.user_metadata as Record<string, unknown> | undefined
  const fromMeta = typeof meta?.username === 'string' ? meta.username.trim() : ''
  if (fromMeta) return fromMeta
  return user.email?.split('@')[0] ?? null
}

/**
 * Whether a display name is acceptable, after trimming.
 *
 * @param name - What was typed
 * @returns The trimmed name, or null if it is out of bounds
 */
export function normalizeDisplayName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (trimmed.length < DISPLAY_NAME_MIN || trimmed.length > DISPLAY_NAME_MAX) return null
  return trimmed
}

/**
 * Change the signed-in person's display name, in both places it is kept.
 *
 * The profile row first, because it is the one with a write check: a `null`
 * from `.select()` means the row was not there, and supabase-js does not
 * report a write that matched nothing on its own — the lesson the payment path
 * paid for. Then the auth metadata, so the session carries the new name and
 * the page can show it without a reload.
 *
 * @param name - A name `normalizeDisplayName` accepted
 * @throws When there is no session, the row was not found, or either write failed
 */
export async function updateDisplayName(name: string): Promise<void> {
  const supabase = requireSupabase()
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) throw new Error('no session')

  const { data, error } = await supabase
    .from('profiles')
    .update({ username: name, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('profile row not found')

  const { error: metaError } = await supabase.auth.updateUser({ data: { username: name } })
  if (metaError) throw metaError
}
