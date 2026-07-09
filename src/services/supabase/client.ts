import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase client for auth and cloud sync.
 *
 * The URL and anon key are PUBLIC (safe in the client) — row-level security
 * protects the data. The service_role key must NEVER reach the browser.
 *
 * Until a `.env.local` provides both values, `supabase` is `null` and
 * `isSupabaseConfigured` is false, so the app runs exactly as before (offline,
 * no login gate). This lets us ship the auth scaffolding without breaking the
 * running app before the project exists.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Whether both public Supabase env vars are present. */
export const isSupabaseConfigured: boolean = Boolean(url && anonKey)

/** The Supabase client, or `null` when the project isn't configured yet. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/** Get the client or throw — use only on paths guarded by `isSupabaseConfigured`. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  }
  return supabase
}
