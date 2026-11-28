import React from 'react'
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
  AuthPage: ({ initialMode, aside }: { initialMode?: string; aside?: React.ReactNode }) => <div data-testid="auth" data-mode={initialMode}>{aside}</div>,
}))
vi.mock('../components/auth/SignupContext', () => ({
  SignupContext: ({ plan }: { plan: string | null }) => <div data-testid="context" data-plan={plan ?? 'free'} />,
}))
vi.mock('../components/auth/pending-checkout', () => ({ peekPendingCheckout: () => pending.plan }))
const pending = vi.hoisted(() => ({ plan: null as string | null }))

import { LoginPage } from './LoginPage'

function arrive(state: unknown, search = '') {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', search, state }]}>
      <Routes><Route path="/login" element={<LoginPage />} /></Routes>
    </MemoryRouter>,
  )
  return screen.getByTestId('auth').dataset.mode
}

afterEach(() => { cleanup(); pending.plan = null })

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

describe('the arrival from a plain link', () => {
  it('opens register for ?mode=signup, which a prerendered link can carry', () => {
    expect(arrive(null, '?mode=signup')).toBe('signup')
  })
})

describe('what the page says beside the form', () => {
  it('names the pending purchase when there is one', () => {
    pending.plan = 'yearly'
    arrive({ mode: 'signup' })
    expect(screen.getByTestId('context').dataset.plan).toBe('yearly')
  })

  it('explains the free account on a sign-up arrival without one', () => {
    arrive({ mode: 'signup' })
    expect(screen.getByTestId('context').dataset.plan).toBe('free')
  })

  it('adds nothing to an ordinary sign-in', () => {
    arrive(null)
    expect(screen.queryByTestId('context')).toBeNull()
  })
})
