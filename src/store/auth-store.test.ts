import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the Supabase client module with a controllable fake.
vi.mock('../services/supabase/client', () => {
  const mockClient = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
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
    auth.signUp.mockResolvedValue({ error: null })
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

  it('signOut clears the session', async () => {
    useAuthStore.setState({ status: 'signedIn', user: { id: 'u1' } as never, session: {} as never })
    await useAuthStore.getState().signOut()
    expect(auth.signOut).toHaveBeenCalled()
    expect(useAuthStore.getState().status).toBe('signedOut')
    expect(useAuthStore.getState().user).toBeNull()
  })
})
