import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ResetPasswordPage } from './ResetPasswordPage'
import { useAuthStore } from '../store/auth-store'

/**
 * The test environment has no Supabase env vars, so `isSupabaseConfigured` is
 * false and the page would render its "no backend here" state for every case
 * below — a suite that passes while exercising none of the behaviour it names.
 */
vi.mock('../services/supabase/client', () => ({
  supabase: { auth: {} },
  isSupabaseConfigured: true,
  requireSupabase: () => ({ auth: {} }),
}))

const navigate = vi.fn()
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))

const updatePassword = vi.fn<(p: string) => Promise<string | null>>()

beforeEach(() => {
  navigate.mockClear()
  updatePassword.mockReset().mockResolvedValue(null)
  useAuthStore.setState({
    status: 'signedIn',
    error: null,
    updatePassword,
    clearError: () => useAuthStore.setState({ error: null }),
  } as never)
})

afterEach(cleanup)

const show = () => render(<MemoryRouter><ResetPasswordPage /></MemoryRouter>)

const fill = (pw: string, confirm = pw) => {
  fireEvent.change(screen.getByTestId('reset-password-new'), { target: { value: pw } })
  fireEvent.change(screen.getByTestId('reset-password-confirm'), { target: { value: confirm } })
}

describe('arriving at the page', () => {
  it('shows the form when the emailed link produced a session', () => {
    show()
    expect(screen.getByTestId('reset-password')).toBeInTheDocument()
  })

  it('says the link expired rather than showing a form that cannot work', () => {
    // Typed the address, followed a used link, or waited too long. Showing the
    // form here means filling it in and being told "Auth session missing",
    // which reads as a broken product rather than an expired link.
    useAuthStore.setState({ status: 'signedOut' } as never)
    show()
    expect(screen.queryByTestId('reset-password')).toBeNull()
    expect(screen.getByText(/link has expired/i)).toBeInTheDocument()
  })

  it('offers a way onward from the expired state instead of a dead end', () => {
    useAuthStore.setState({ status: 'signedOut' } as never)
    show()
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument()
  })

  it('waits rather than accusing while the token is still being exchanged', () => {
    // The session resolves asynchronously. Calling the link expired during that
    // window would be wrong about a link that is perfectly good.
    useAuthStore.setState({ status: 'loading' } as never)
    show()
    expect(screen.queryByText(/expired/i)).toBeNull()
    expect(screen.getByText(/checking your link/i)).toBeInTheDocument()
  })
})

describe('being able to look at what you typed', () => {
  it('hides both fields to begin with', () => {
    show()
    expect(screen.getByTestId('reset-password-new')).toHaveAttribute('type', 'password')
    expect(screen.getByTestId('reset-password-confirm')).toHaveAttribute('type', 'password')
  })

  it('reveals both fields together, not just the one clicked', () => {
    // Revealing half of a pair you are asked to match is no help at all.
    show()
    fireEvent.click(screen.getByTestId('reset-password-new-reveal'))
    expect(screen.getByTestId('reset-password-new')).toHaveAttribute('type', 'text')
    expect(screen.getByTestId('reset-password-confirm')).toHaveAttribute('type', 'text')
  })

  it('hides them again on a second click', () => {
    show()
    fireEvent.click(screen.getByTestId('reset-password-new-reveal'))
    fireEvent.click(screen.getByTestId('reset-password-confirm-reveal'))
    expect(screen.getByTestId('reset-password-new')).toHaveAttribute('type', 'password')
  })

  it('tells a screen reader what the button will do, not what it looks like', () => {
    show()
    const toggle = screen.getByTestId('reset-password-new-reveal')
    expect(toggle).toHaveAttribute('aria-label', 'Show password')
    fireEvent.click(toggle)
    expect(screen.getByTestId('reset-password-new-reveal')).toHaveAttribute('aria-label', 'Hide password')
  })
})

describe('setting the new password', () => {
  it('saves it and takes the learner into the app', async () => {
    show()
    fill('longenough')
    fireEvent.click(screen.getByTestId('reset-password-submit'))

    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith('longenough'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/app', { replace: true }))
  })

  it('refuses a mismatch before sending anything', async () => {
    // A typo here locks someone out of the account they are in the middle of
    // recovering — the one moment where that is least forgivable.
    show()
    fill('longenough', 'longenougg')
    fireEvent.click(screen.getByTestId('reset-password-submit'))

    expect(await screen.findByTestId('reset-password-error')).toHaveTextContent(/do not match/i)
    expect(updatePassword).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('refuses a password too short to be accepted anyway', async () => {
    show()
    fill('abc')
    fireEvent.click(screen.getByTestId('reset-password-submit'))

    expect(await screen.findByTestId('reset-password-error')).toHaveTextContent(/at least/i)
    expect(updatePassword).not.toHaveBeenCalled()
  })

  it('keeps the learner on the page when the server rejects it', async () => {
    updatePassword.mockResolvedValue('New password should be different from the old password.')
    useAuthStore.setState({ error: 'New password should be different from the old password.' } as never)
    show()
    fill('longenough')
    fireEvent.click(screen.getByTestId('reset-password-submit'))

    await waitFor(() => expect(updatePassword).toHaveBeenCalled())
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByTestId('reset-password-error')).toBeInTheDocument()
  })

  it('cannot be submitted twice by an impatient double-click', async () => {
    let release: (v: string | null) => void = () => {}
    updatePassword.mockReturnValue(new Promise(r => { release = r }))
    show()
    fill('longenough')

    const button = screen.getByTestId('reset-password-submit')
    fireEvent.click(button)
    fireEvent.click(button)
    expect(updatePassword).toHaveBeenCalledTimes(1)

    release(null)
    await waitFor(() => expect(navigate).toHaveBeenCalled())
  })
})
