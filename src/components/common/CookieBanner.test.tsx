import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ configured: true }))
vi.mock('../../services/supabase/client', () => ({
  get isSupabaseConfigured() { return state.configured },
  supabase: null,
}))

import { CookieBanner, CookieSettingsLink } from './CookieBanner'
import { getConsent, setConsent } from '../../services/analytics/consent-choice'
import { clearLocalAppData } from '../../services/storage/local-reset'

const show = () => render(<MemoryRouter><CookieBanner /><CookieSettingsLink /></MemoryRouter>)

beforeEach(() => { state.configured = true; localStorage.clear() })
afterEach(cleanup)

/**
 * The cookie question (Darius, 18 Nov 2026): accept or decline, asked once.
 */
describe('CookieBanner', () => {
  it('asks a visitor who has not answered, with both answers side by side', () => {
    show()
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument()
    expect(screen.getByTestId('cookie-accept')).toHaveTextContent('Accept')
    expect(screen.getByTestId('cookie-decline')).toHaveTextContent('Decline')
    expect(screen.getByRole('link', { name: /privacy/i })).toHaveAttribute('href', '/privacy')
  })

  it('goes away on Accept and remembers the yes', () => {
    show()
    fireEvent.click(screen.getByTestId('cookie-accept'))
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
    expect(getConsent()).toBe('accepted')
  })

  it('goes away on Decline and remembers the no', () => {
    show()
    fireEvent.click(screen.getByTestId('cookie-decline'))
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
    expect(getConsent()).toBe('declined')
  })

  it('does not come back for someone who has already answered', () => {
    setConsent('accepted')
    show()
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
    cleanup()
    setConsent('declined')
    show()
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
  })

  it('does not come back after signing out: the answer belongs to the device', () => {
    setConsent('accepted')
    clearLocalAppData()
    expect(getConsent()).toBe('accepted')
    show()
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
  })

  it('is asked again from "Cookie settings"', () => {
    setConsent('accepted')
    show()
    act(() => { fireEvent.click(screen.getByTestId('cookie-settings')) })
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument()
    expect(getConsent()).toBeNull()
  })

  it('is not shown, and offers no settings, where nothing is counted', () => {
    state.configured = false
    show()
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
    expect(screen.queryByTestId('cookie-settings')).toBeNull()
  })
})
