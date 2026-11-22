import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

/**
 * The sign-out button in the bar.
 *
 * It used to wipe the device whatever was on it. A sign-out that reports
 * sessions it could not upload now stops and asks; only "sign out anyway"
 * gives them up.
 */

const signOutAndClearLocal = vi.hoisted(() =>
  vi.fn<(options?: { discardUnsaved?: boolean }) => Promise<'signedOut' | 'unsaved'>>())
vi.mock('../../services/supabase/cloud-sync', () => ({ signOutAndClearLocal }))

// The button is only drawn for a signed-in user of a configured backend.
vi.mock('../../store/auth-store', async importOriginal => ({
  ...await importOriginal<typeof import('../../store/auth-store')>(),
  isSupabaseConfigured: true,
}))

import { NavBar } from './NavBar'
import { useAuthStore } from '../../store/auth-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { markSessionPending, resetPendingSessions } from '../../services/storage/pending-sessions'

function renderNav() {
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<NavBar />} />
        <Route path="/" element={<div data-testid="landing" />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  resetPendingSessions()
  signOutAndClearLocal.mockReset()
  signOutAndClearLocal.mockResolvedValue('signedOut')
  useAuthStore.setState({ status: 'signedIn' })
  useLiveSessionStore.setState({ activeMode: null, pending: null })
})

describe('the sign-out button in the nav bar', () => {
  it('signs out and leaves when nothing is lost', async () => {
    renderNav()
    fireEvent.click(screen.getByTestId('sign-out'))

    await waitFor(() => expect(screen.getByTestId('landing')).toBeInTheDocument())
    expect(signOutAndClearLocal).toHaveBeenCalledTimes(1)
  })

  it('asks before deleting sessions that could not be uploaded, and stays if told to', async () => {
    markSessionPending('a')
    markSessionPending('b')
    signOutAndClearLocal.mockResolvedValue('unsaved')
    renderNav()

    fireEvent.click(screen.getByTestId('sign-out'))

    const question = await screen.findByTestId('unsaved-sign-out-dialog')
    expect(question).toHaveTextContent('2 training sessions have not been uploaded yet')
    expect(screen.queryByTestId('landing')).toBeNull()

    fireEvent.click(screen.getByTestId('unsaved-sign-out-stay'))

    expect(screen.queryByTestId('unsaved-sign-out-dialog')).toBeNull()
    expect(screen.queryByTestId('landing')).toBeNull()
    // Still signed in, and the button works again.
    expect(screen.getByTestId('sign-out')).not.toBeDisabled()
    expect(signOutAndClearLocal).toHaveBeenCalledTimes(1)
  })

  it('signs out regardless on "sign out anyway"', async () => {
    markSessionPending('a')
    signOutAndClearLocal.mockResolvedValueOnce('unsaved')
    renderNav()
    fireEvent.click(screen.getByTestId('sign-out'))

    fireEvent.click(await screen.findByTestId('unsaved-sign-out-anyway'))

    await waitFor(() => expect(screen.getByTestId('landing')).toBeInTheDocument())
    expect(signOutAndClearLocal).toHaveBeenLastCalledWith({ discardUnsaved: true })
  })
})
