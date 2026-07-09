import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../services/supabase/client'

/** High-level auth state for gating the app. */
export type AuthStatus = 'loading' | 'signedIn' | 'signedOut'

export interface AuthStoreState {
  status: AuthStatus
  user: User | null
  session: Session | null
  /** Last auth error message (form-facing), or null. */
  error: string | null
}

export interface AuthStoreActions {
  /** Load the initial session and subscribe to auth changes. Call once at startup. */
  init: () => Promise<void>
  /** Register a new account. Returns an error message on failure. */
  signUp: (email: string, password: string, username?: string) => Promise<string | null>
  /** Sign in with email + password. Returns an error message on failure. */
  signIn: (email: string, password: string) => Promise<string | null>
  /** Sign out the current user. */
  signOut: () => Promise<void>
  /** Clear the current error message. */
  clearError: () => void
}

export type AuthStore = AuthStoreState & AuthStoreActions

let subscribed = false

/**
 * Zustand store wrapping Supabase Auth.
 *
 * When Supabase isn't configured (no env), the store resolves to `signedOut`
 * and auth actions report a friendly error — the app itself stays usable
 * because the login gate only activates when `isSupabaseConfigured` is true.
 */
export const useAuthStore = create<AuthStore>((set) => ({
  status: 'loading',
  user: null,
  session: null,
  error: null,

  async init() {
    if (!supabase) {
      set({ status: 'signedOut', session: null, user: null })
      return
    }

    try {
      const { data } = await supabase.auth.getSession()
      set({
        session: data.session,
        user: data.session?.user ?? null,
        status: data.session ? 'signedIn' : 'signedOut',
      })
    } catch {
      // Network/config hiccup: don't trap the app in a loader — show the login.
      set({ status: 'signedOut', session: null, user: null })
    }

    if (!subscribed) {
      subscribed = true
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
          status: session ? 'signedIn' : 'signedOut',
        })
      })
    }
  },

  async signUp(email, password, username) {
    if (!supabase) return 'Sign-up is unavailable until Supabase is configured.'
    set({ error: null })
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: username ? { data: { username } } : undefined,
    })
    if (error) {
      set({ error: error.message })
      return error.message
    }
    return null
  },

  async signIn(email, password) {
    if (!supabase) return 'Sign-in is unavailable until Supabase is configured.'
    set({ error: null })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      set({ error: error.message })
      return error.message
    }
    return null
  },

  async signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    set({ status: 'signedOut', session: null, user: null })
  },

  clearError() {
    set({ error: null })
  },
}))

/** Re-export so consumers can gate UI without importing the client directly. */
export { isSupabaseConfigured }
