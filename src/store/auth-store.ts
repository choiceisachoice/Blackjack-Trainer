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
  /**
   * Register a new account.
   *
   * `error` is null on success. `needsConfirmation` says whether the account is
   * waiting on an email link before it can be used — read from the response,
   * because it is a dashboard setting that can change without this code.
   */
  signUp: (
    email: string,
    password: string,
    username?: string,
  ) => Promise<{ error: string | null; needsConfirmation?: boolean }>
  /** Sign in with email + password. Returns an error message on failure. */
  signIn: (email: string, password: string) => Promise<string | null>
  /**
   * Send a password-reset link.
   *
   * Returns an error only for problems that are not about the address itself —
   * see the implementation for why an unknown email must not be reported.
   */
  requestPasswordReset: (email: string) => Promise<string | null>
  /** Set a new password for the account the current recovery session belongs to. */
  updatePassword: (password: string) => Promise<string | null>
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
    if (!supabase) return { error: 'Sign-up is unavailable until Supabase is configured.' }
    set({ error: null })
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: username ? { data: { username } } : undefined,
    })
    if (error) {
      set({ error: error.message })
      return { error: error.message }
    }
    /*
      Whether a confirmation email is required is a *dashboard* setting, not an
      app decision, and it can be changed without anyone touching this code.

      So it is read from the answer rather than assumed: Supabase returns a
      session immediately when "Confirm email" is off, and `null` when it is on
      and the account is waiting on a link. The UI used to hardcode "check your
      email to confirm, then sign in" — which, with confirmation off, told every
      new user to wait for a message that would never arrive and to do a step
      they had already skipped.
    */
    return { error: null, needsConfirmation: data.session === null }
  },

  async requestPasswordReset(email) {
    if (!supabase) return 'Password reset is unavailable until Supabase is configured.'
    set({ error: null })

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Where the link lands. Built from the running origin rather than a
      // constant so localhost, a preview deploy and production each send people
      // back to themselves — a hardcoded domain would mail every developer's
      // reset link to the live site.
      redirectTo: `${window.location.origin}/reset-password`,
    })

    /*
      An unknown address is NOT reported as an error, and that is deliberate.

      "No account with that email" turns the reset form into an account
      checker: anyone can type addresses and learn which ones are registered
      here. On a product that takes money, that is a list worth having and not
      one worth giving away. The caller shows the same message either way.

      Real failures — network down, rate limit, misconfigured SMTP — still come
      back, because those are about *us*, not about who exists.
    */
    if (error && !/user not found|not found/i.test(error.message)) {
      set({ error: error.message })
      return error.message
    }
    return null
  },

  async updatePassword(password) {
    if (!supabase) return 'Password reset is unavailable until Supabase is configured.'
    set({ error: null })

    // Works on the recovery session Supabase created from the emailed link.
    // Without one this fails, which is the correct outcome: a stale or forged
    // link must not be able to change anyone's password.
    const { error } = await supabase.auth.updateUser({ password })
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
