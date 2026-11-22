import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * Which side of the form `/login` opens on. With accounts (Supabase
 * "configured") and nobody signed in — the visitor at the end of the trial
 * round, who pressed "create free account".
 */
vi.mock('../store/auth-store', () => ({
  useAuthStore: Object.assign(() => 'signedOut', { getState: () => ({ status: 'signedOut', user: null }) }),
  isSupabaseConfigured: true,
}))
vi.mock('../components/auth/AuthPage', () => ({
  AuthPage: ({ initialMode }: { initialMode?: string }) => <div data-testid="auth" data-mode={initialMode} />,
}))

import { LoginPage } from './LoginPage'

function arrive(state: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes><Route path="/login" element={<LoginPage />} /></Routes>
    </MemoryRouter>,
  )
  return screen.getByTestId('auth').dataset.mode
}

afterEach(cleanup)

describe('the side the form opens on', () => {
  it('is sign-in for an ordinary arrival', () => {
    expect(arrive(null)).toBe('signin')
  })

  it('is register when the link said "create an account"', () => {
    expect(arrive({ mode: 'signup' })).toBe('signup')
  })

  it('is sign-in for anything else a link might carry', () => {
    for (const mode of ['reset', 'SIGNUP', 1, null]) {
      cleanup()
      expect(arrive({ mode }), String(mode)).toBe('signin')
    }
  })
})
