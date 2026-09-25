import { supabase } from './client'

/**
 * Whether the signed-in user is listed in `app_admins`.
 *
 * The table's only policy lets a user read their own row, so this query
 * returns one row for an admin and none for anybody else — nobody can learn
 * who the other admins are. It decides what the UI shows (the link on the
 * account page, the route guard); it does not decide access. The report
 * function in the database checks membership itself, so a wrong answer here
 * changes a menu, never the data.
 *
 * `false` when Supabase is not configured or the query fails: a page that
 * cannot tell is a page that stays hidden.
 */
export async function isAppAdmin(): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.from('app_admins').select('user_id').limit(1)
  if (error) return false
  return Array.isArray(data) && data.length > 0
}
