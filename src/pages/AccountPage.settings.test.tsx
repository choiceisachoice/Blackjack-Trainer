import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The account page as a settings page.
 *
 * Supabase is mocked as *configured* here, unlike `AccountPage.test.tsx`,
 * so the profile shows what a real session carries.
 */

vi.mock('../services/supabase/client', () => {
  const mockClient = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
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

const updateDisplayName = vi.fn<(name: string) => Promise<void>>()
vi.mock('../services/supabase/profile-name', async importOriginal => ({
  ...(await importOriginal<typeof import('../services/supabase/profile-name')>()),
  updateDisplayName: (name: string) => updateDisplayName(name),
}))

const downloadJson = vi.fn<(name: string, data: unknown) => void>()
vi.mock('../services/data-export', async importOriginal => ({
  ...(await importOriginal<typeof import('../services/data-export')>()),
  downloadJson: (name: string, data: unknown) => downloadJson(name, data),
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

  it('shows the name chosen at sign-up, which nothing displayed before', () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'ada@example.com', user_metadata: { username: 'Ada' } } as never,
    })
    renderPage()
    expect(screen.getByTestId('account-display-name')).toHaveTextContent('Ada')
  })

  it('shows level, XP, sessions and achievements from the stores', () => {
    renderPage()
    expect(screen.getByTestId('account-stats')).toBeInTheDocument()
    expect(screen.getByText('Level')).toBeInTheDocument()
    expect(screen.getByText('XP')).toBeInTheDocument()
  })

  it('edits the name in place and reports the save', async () => {
    updateDisplayName.mockResolvedValue(undefined)
    renderPage()
    fireEvent.click(screen.getByTestId('account-edit-name'))
    fireEvent.change(screen.getByTestId('account-name-input'), { target: { value: '  Ada  Lovelace ' } })
    fireEvent.click(screen.getByTestId('account-name-save'))
    expect(await screen.findByTestId('account-name-saved', {}, T)).toBeInTheDocument()
    // Normalised before it leaves the page: trimmed, inner whitespace collapsed.
    expect(updateDisplayName).toHaveBeenCalledWith('Ada Lovelace')
  })

  it('refuses a one-letter name before asking the server', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('account-edit-name'))
    fireEvent.change(screen.getByTestId('account-name-input'), { target: { value: 'A' } })
    fireEvent.click(screen.getByTestId('account-name-save'))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(updateDisplayName).not.toHaveBeenCalled()
  })

  it('says so when the save fails, and keeps the field open to retry', async () => {
    updateDisplayName.mockRejectedValue(new Error('permission denied'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPage()
    fireEvent.click(screen.getByTestId('account-edit-name'))
    fireEvent.change(screen.getByTestId('account-name-input'), { target: { value: 'Ada' } })
    fireEvent.click(screen.getByTestId('account-name-save'))
    const alert = await screen.findByRole('alert', {}, T)
    expect(alert.textContent).not.toContain('permission denied')
    expect(screen.getByTestId('account-name-input')).toBeInTheDocument()
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

describe('your data', () => {
  it('hands over a dated JSON file with the person’s data', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('account-export-data'))
    expect(downloadJson).toHaveBeenCalledOnce()
    const [name, data] = downloadJson.mock.calls[0]
    expect(name).toMatch(/^blackjack-trainer-\d{4}-\d{2}-\d{2}\.json$/)
    expect(data).toMatchObject({ app: 'blackjack-trainer', version: 1, email: 'ada@example.com' })
  })

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
