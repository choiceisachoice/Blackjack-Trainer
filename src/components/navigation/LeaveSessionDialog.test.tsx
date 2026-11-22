import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

/**
 * Signing out from a running casino table goes through this dialog, and it is
 * one of the three places that sign out. What is pinned here is the part that
 * is new: a sign-out that comes back with sessions it could not upload does
 * not leave — it asks.
 */

const signOutAndClearLocal = vi.hoisted(() =>
  vi.fn<(options?: { discardUnsaved?: boolean }) => Promise<'signedOut' | 'unsaved'>>())
vi.mock('../../services/supabase/cloud-sync', () => ({ signOutAndClearLocal }))

import { LeaveSessionDialog } from './LeaveSessionDialog'
import { useLiveSessionStore } from '../../store/live-session-store'
import { markSessionPending, resetPendingSessions } from '../../services/storage/pending-sessions'

function renderDialog() {
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<LeaveSessionDialog />} />
        <Route path="/" element={<div data-testid="landing" />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** The question "leave your session?" is open, and the answer will be a sign-out. */
function askToSignOut() {
  useLiveSessionStore.setState({ pending: { target: { kind: 'signOut' }, from: 'casinoSession' } })
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  resetPendingSessions()
  signOutAndClearLocal.mockReset()
  signOutAndClearLocal.mockResolvedValue('signedOut')
  useLiveSessionStore.setState({ pending: null })
})

describe('LeaveSessionDialog — signing out', () => {
  it('signs out and leaves when nothing is lost', async () => {
    askToSignOut()
    renderDialog()

    fireEvent.click(screen.getByTestId('leave-session-leave'))

    await waitFor(() => expect(screen.getByTestId('landing')).toBeInTheDocument())
    expect(signOutAndClearLocal).toHaveBeenCalledTimes(1)
  })

  it('asks before deleting sessions that could not be uploaded, and stays if told to', async () => {
    markSessionPending('a')
    signOutAndClearLocal.mockResolvedValue('unsaved')
    askToSignOut()
    renderDialog()

    fireEvent.click(screen.getByTestId('leave-session-leave'))

    // Its own dialog is gone; the question about the sessions takes its place.
    const question = await screen.findByTestId('unsaved-sign-out-dialog')
    expect(question).toHaveTextContent('1 training session has not been uploaded yet')
    expect(screen.queryByTestId('leave-session-dialog')).toBeNull()
    expect(screen.queryByTestId('landing')).toBeNull()

    fireEvent.click(screen.getByTestId('unsaved-sign-out-stay'))
    expect(screen.queryByTestId('unsaved-sign-out-dialog')).toBeNull()
    expect(screen.queryByTestId('landing')).toBeNull()
    expect(signOutAndClearLocal).toHaveBeenCalledTimes(1)
  })

  it('signs out regardless on "sign out anyway"', async () => {
    markSessionPending('a')
    signOutAndClearLocal.mockResolvedValueOnce('unsaved')
    askToSignOut()
    renderDialog()
    fireEvent.click(screen.getByTestId('leave-session-leave'))

    fireEvent.click(await screen.findByTestId('unsaved-sign-out-anyway'))

    await waitFor(() => expect(screen.getByTestId('landing')).toBeInTheDocument())
    expect(signOutAndClearLocal).toHaveBeenLastCalledWith({ discardUnsaved: true })
  })
})
