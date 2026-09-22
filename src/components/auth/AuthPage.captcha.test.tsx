import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useAuthStore } from '../../store/auth-store'

/*
  The captcha is a module-level constant, so this file mocks it on and gets
  its own copy of the form; `AuthPage.test.tsx` covers the form with the
  captcha off. The widget itself is replaced by a button that hands a token
  up — the real one is Cloudflare's script, covered in `Turnstile.test.tsx`.
*/
vi.mock('../../services/captcha', () => ({
  isCaptchaConfigured: true,
  TURNSTILE_SITE_KEY: 'site-key-under-test',
  TURNSTILE_SCRIPT_URL: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
}))

let widgetResets = 0
vi.mock('./Turnstile', () => ({
  Turnstile: ({ onToken, action, resetKey }: { onToken: (t: string | null) => void; action: string; resetKey?: number }) => {
    widgetResets = resetKey ?? 0
    return (
      <div data-testid="turnstile" data-action={action}>
        <button type="button" data-testid="fake-pass" onClick={() => onToken('tok-123')}>pass</button>
        <button type="button" data-testid="fake-expire" onClick={() => onToken(null)}>expire</button>
      </div>
    )
  },
}))

import { AuthPage } from './AuthPage'

describe('AuthPage with the captcha configured', () => {
  const signIn = vi.fn().mockResolvedValue(null)
  const signUp = vi.fn().mockResolvedValue({ error: null, needsConfirmation: false })
  const requestPasswordReset = vi.fn().mockResolvedValue(null)

  beforeEach(() => {
    widgetResets = 0
    signIn.mockClear(); signUp.mockClear(); requestPasswordReset.mockClear()
    useAuthStore.setState({ signIn, signUp, requestPasswordReset, error: null })
  })
  afterEach(cleanup)

  it('will not submit until the check has passed', () => {
    render(<AuthPage />)
    expect(screen.getByTestId('turnstile')).toHaveAttribute('data-action', 'login')
    expect(screen.getByTestId('auth-submit')).toBeDisabled()
    fireEvent.click(screen.getByTestId('fake-pass'))
    expect(screen.getByTestId('auth-submit')).not.toBeDisabled()
  })

  it('sends the token with the sign-in and asks the widget for a fresh one afterwards', async () => {
    render(<AuthPage />)
    fireEvent.change(screen.getByTestId('auth-email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'secret1' } })
    fireEvent.click(screen.getByTestId('fake-pass'))
    await act(async () => { fireEvent.submit(screen.getByTestId('auth-submit').closest('form')!) })
    expect(signIn).toHaveBeenCalledWith('a@b.com', 'secret1', 'tok-123')
    expect(widgetResets).toBe(1)
  })

  it('sends the token with a registration and a reset request too', async () => {
    render(<AuthPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByTestId('turnstile')).toHaveAttribute('data-action', 'signup')
    fireEvent.change(screen.getByTestId('auth-email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'secret1' } })
    fireEvent.click(screen.getByTestId('fake-pass'))
    await act(async () => { fireEvent.submit(screen.getByTestId('auth-submit').closest('form')!) })
    expect(signUp).toHaveBeenCalledWith('a@b.com', 'secret1', undefined, 'tok-123')

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    fireEvent.click(screen.getByTestId('auth-forgot'))
    expect(screen.getByTestId('turnstile')).toHaveAttribute('data-action', 'reset')
    fireEvent.click(screen.getByTestId('fake-pass'))
    await act(async () => { fireEvent.submit(screen.getByTestId('auth-submit').closest('form')!) })
    expect(requestPasswordReset).toHaveBeenCalledWith('a@b.com', 'tok-123')
  })

  it('closes the form again and says so when a token expires or the check fails', () => {
    render(<AuthPage />)
    fireEvent.click(screen.getByTestId('fake-pass'))
    expect(screen.getByTestId('auth-submit')).not.toBeDisabled()
    fireEvent.click(screen.getByTestId('fake-expire'))
    expect(screen.getByTestId('auth-submit')).toBeDisabled()
    expect(screen.getByTestId('auth-captcha-error')).toBeInTheDocument()
    // A widget that has not produced a token yet is not a failure.
    cleanup()
    render(<AuthPage />)
    fireEvent.click(screen.getByTestId('fake-expire'))
    expect(screen.queryByTestId('auth-captcha-error')).not.toBeInTheDocument()
  })
})
