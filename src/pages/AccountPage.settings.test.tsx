import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The account page as a settings page.
 *
 * Supabase is mocked as *configured* here, unlike `AccountPage.test.tsx`,
 * because the security section only exists when there is a backend to change
 * a password against, and the profile shows what the session carries.
 */

vi.mock('../services/supabase/client', () => {
  const mockClient = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      updateUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }
  return { supabase: mockClient, isSupabaseConfigured: true, requireSupabase: () => mockClient }
})

vi.mock('../services/supabase/cloud-sync', () => ({
  signOutAndClearLocal: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/supabase/billing', () => ({
  openBillingPortal: vi.fn().mockResolvedValue(undefined),
  startCheckout: vi.fn(),
}))

import { AccountPage } from './AccountPage'
import { supabase } from '../services/supabase/client'
import { useAuthStore } from '../store/auth-store'
import { useAppStore } from '../store/app-store'
import { useStatsStore } from '../store/stats-store'
import { useEntitlementStore } from '../store/entitlement-store'
import { casinoAmbient } from '../services/casino-ambient'

const auth = (supabase as unknown as { auth: Record<string, ReturnType<typeof vi.fn>> }).auth
const renderPage = () => render(<MemoryRouter><AccountPage /></MemoryRouter>)
const T = { timeout: 5000 }

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  auth.updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  auth.signOut.mockResolvedValue({ error: null })
  useAuthStore.setState({
    status: 'signedIn',
    user: { id: 'u1', email: 'ada@example.com', created_at: '2026-03-04T10:00:00Z' } as never,
    session: {} as never,
    error: null,
  })
  useEntitlementStore.setState({ status: 'free', currentPeriodEnd: null, cancelAtPeriodEnd: false, loaded: true })
  useAppStore.setState({ soundEnabled: true, soundVolume: 0.3, dealingSpeed: 'slow' })
})

describe('profile', () => {
  it('shows the address and when the account was created', () => {
    renderPage()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('account-member-since')).toHaveTextContent(/2026/)
  })
})

describe('preferences', () => {
  it('offers the language switcher, which used to live only in the nav bar', () => {
    renderPage()
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument()
  })

  it('drives the same sound setting the nav bar mute button does', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('account-sound-toggle'))
    expect(useAppStore.getState().soundEnabled).toBe(false)
    // No volume to set on a muted app; the slider goes with the sound.
    expect(screen.queryByTestId('account-sound-volume')).toBeNull()
  })

  it('sets the effects volume on the store', () => {
    renderPage()
    fireEvent.change(screen.getByTestId('account-sound-volume'), { target: { value: '0.6' } })
    expect(useAppStore.getState().soundVolume).toBeCloseTo(0.6)
  })

  it('switches the dealing speed the casino HUD reads', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Standard' }))
    expect(useAppStore.getState().dealingSpeed).toBe('normal')
  })

  it('writes the ambience volume to the singleton the table plays from', () => {
    const before = casinoAmbient.volume
    renderPage()
    fireEvent.change(screen.getByTestId('account-ambient-volume'), { target: { value: '0.42' } })
    expect(casinoAmbient.volume).toBeCloseTo(0.42)
    casinoAmbient.volume = before
  })
})

describe('changing the password while signed in', () => {
  const fill = (a: string, b: string) => {
    fireEvent.change(screen.getByTestId('account-password-new'), { target: { value: a } })
    fireEvent.change(screen.getByTestId('account-password-confirm'), { target: { value: b } })
    fireEvent.click(screen.getByTestId('account-password-submit'))
  }

  it('refuses a short password before asking the server', () => {
    renderPage()
    fill('abc', 'abc')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('refuses a mismatched pair before asking the server', () => {
    renderPage()
    fill('longenough', 'longenougH')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('changes it, says so, and clears the fields', async () => {
    renderPage()
    fill('longenough', 'longenough')
    expect(await screen.findByTestId('account-password-changed', {}, T)).toBeInTheDocument()
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'longenough' })
    expect(screen.getByTestId('account-password-new')).toHaveValue('')
    // Other sessions go, this one stays — it is the one that just proved
    // itself by being signed in.
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
  })

  it('shows the translated reason when the server refuses, never its message', async () => {
    auth.updateUser.mockResolvedValue({
      data: {},
      error: { message: 'New password should be different from the old password.' },
    })
    renderPage()
    fill('sameasbefore', 'sameasbefore')
    const alert = await screen.findByRole('alert', {}, T)
    expect(alert.textContent).not.toContain('should be different')
    expect(alert.textContent).toMatch(/different from your current one/i)
  })
})

describe('your data', () => {
  it('asks before deleting the training history and does nothing on cancel', () => {
    const resetAllStats = vi.fn().mockResolvedValue(undefined)
    useStatsStore.setState({ resetAllStats })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()
    fireEvent.click(screen.getByTestId('account-delete-history'))
    expect(resetAllStats).not.toHaveBeenCalled()
  })

  it('deletes the training history once confirmed', async () => {
    const resetAllStats = vi.fn().mockResolvedValue(undefined)
    useStatsStore.setState({ resetAllStats })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    fireEvent.click(screen.getByTestId('account-delete-history'))
    await waitFor(() => expect(resetAllStats).toHaveBeenCalledOnce(), T)
  })

  it('names the address account deletion goes through, since there is no self-service', () => {
    renderPage()
    const link = screen.getByTestId('account-delete-account')
    expect(link.getAttribute('href')).toMatch(/^mailto:/)
  })
})
