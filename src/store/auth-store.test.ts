import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the Supabase client module with a controllable fake.
vi.mock('../services/supabase/client', () => {
  const mockClient = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      // The real client always returns a `data` envelope alongside `error`, and
      // `data.session` is what says whether the account is usable yet. The mock
      // used to return `{ error: null }` alone — thinner than reality, which is
      // how a mock hides a defect instead of exposing one.
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' }, session: {} }, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }
  return { supabase: mockClient, isSupabaseConfigured: true, requireSupabase: () => mockClient }
})

import { useAuthStore } from './auth-store'
import { supabase } from '../services/supabase/client'

// Typed handle to the mocked auth methods.
const auth = (supabase as unknown as { auth: Record<string, ReturnType<typeof vi.fn>> }).auth

describe('auth-store', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'loading', user: null, session: null, error: null })
    vi.clearAllMocks()
    auth.getSession.mockResolvedValue({ data: { session: null } })
    auth.signInWithPassword.mockResolvedValue({ error: null })
    // Same shape as the real client: a `data` envelope beside `error`. A
    // thinner default here is what let a missing `data.session` go unnoticed.
    auth.signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: {} }, error: null })
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    auth.updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    auth.signOut.mockResolvedValue({ error: null })
  })

  it('init resolves to signed-out when there is no session', async () => {
    await useAuthStore.getState().init()
    expect(useAuthStore.getState().status).toBe('signedOut')
  })

  it('init reflects an existing session as signed-in', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    await useAuthStore.getState().init()
    expect(useAuthStore.getState().status).toBe('signedIn')
    expect(useAuthStore.getState().user).toEqual({ id: 'u1' })
  })

  it('signIn returns null and sets no error on success', async () => {
    const err = await useAuthStore.getState().signIn('a@b.com', 'secret1')
    expect(err).toBeNull()
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret1' })
    expect(useAuthStore.getState().error).toBeNull()
  })

  it('signIn surfaces the error message on failure', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const err = await useAuthStore.getState().signIn('a@b.com', 'wrong')
    expect(err).toBe('Invalid login credentials')
    expect(useAuthStore.getState().error).toBe('Invalid login credentials')
  })

  it('signUp passes the username as metadata', async () => {
    await useAuthStore.getState().signUp('a@b.com', 'secret1', 'counter')
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'secret1',
      options: { data: { username: 'counter' } },
    })
  })

  it('reports no confirmation needed when a session comes back', async () => {
    // How the project is actually configured: "Confirm email" is off, so the
    // account is live immediately and nothing should tell the user to go and
    // look in their inbox.
    const result = await useAuthStore.getState().signUp('a@b.com', 'secret1')
    expect(result.error).toBeNull()
    expect(result.needsConfirmation).toBe(false)
  })

  it('reports confirmation needed when the session is withheld', async () => {
    // Supabase withholds the session while an account waits on an email link.
    // Read from the response rather than assumed, because it is a dashboard
    // setting that can be flipped without anyone touching this code.
    auth.signUp.mockResolvedValueOnce({ data: { user: { id: 'u1' }, session: null }, error: null })
    const result = await useAuthStore.getState().signUp('a@b.com', 'secret1')
    expect(result.error).toBeNull()
    expect(result.needsConfirmation).toBe(true)
  })

  it('surfaces a rejected sign-up rather than reporting success', async () => {
    // What a visitor sees if "Allow new users to sign up" is ever switched off.
    auth.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Signups not allowed for this instance' },
    })
    const result = await useAuthStore.getState().signUp('a@b.com', 'secret1')
    expect(result.error).toBe('Signups not allowed for this instance')
    expect(useAuthStore.getState().error).toBe('Signups not allowed for this instance')
  })

  it('sends a reset link back to the running origin', async () => {
    // Not a hardcoded domain: localhost, a preview deploy and production must
    // each send people back to themselves, or a developer's reset link arrives
    // pointing at the live site.
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    await useAuthStore.getState().requestPasswordReset('a@b.com')

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  })

  it('does not reveal whether an address has an account', async () => {
    // Reporting "user not found" turns the reset form into an account checker.
    // On a product that takes money, that is a list worth having and not one
    // worth giving away.
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: { message: 'User not found' } })
    const err = await useAuthStore.getState().requestPasswordReset('nobody@nowhere.com')

    expect(err).toBeNull()
    expect(useAuthStore.getState().error).toBeNull()
  })

  it('still surfaces failures that are about us, not about who exists', async () => {
    // Rate limits and broken SMTP have to be visible, or a user retries into a
    // wall believing the mail is on its way.
    auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { message: 'Error sending recovery email' },
    })
    const err = await useAuthStore.getState().requestPasswordReset('a@b.com')

    expect(err).toBe('Error sending recovery email')
    expect(useAuthStore.getState().error).toBe('Error sending recovery email')
  })

  it('updatePassword reports a rejected password instead of claiming success', async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: { message: 'Password should be at least 6 characters' } })
    const err = await useAuthStore.getState().updatePassword('abc')

    expect(err).toBe('Password should be at least 6 characters')
    expect(useAuthStore.getState().error).toBe('Password should be at least 6 characters')
  })

  it('updatePassword succeeds quietly', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    expect(await useAuthStore.getState().updatePassword('longenough')).toBeNull()
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'longenough' })
  })

  it('signOut clears the session', async () => {
    useAuthStore.setState({ status: 'signedIn', user: { id: 'u1' } as never, session: {} as never })
    await useAuthStore.getState().signOut()
    expect(auth.signOut).toHaveBeenCalled()
    expect(useAuthStore.getState().status).toBe('signedOut')
    expect(useAuthStore.getState().user).toBeNull()
  })
})
