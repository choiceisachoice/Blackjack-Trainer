import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

// The site key is read at module load, so the mock has to be in place before
// the component is imported — hence `vi.mock` plus a dynamic import below.
vi.mock('../../services/captcha', () => ({
  TURNSTILE_SITE_KEY: 'site-key-under-test',
  isCaptchaConfigured: true,
  TURNSTILE_SCRIPT_URL: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
}))

type RenderOptions = Parameters<NonNullable<Window['turnstile']>['render']>[1]

/** A stand-in for Cloudflare's global: records what it was asked and lets a test fire callbacks. */
function fakeTurnstile() {
  const state = { options: null as RenderOptions | null, resets: 0, removed: [] as string[] }
  window.turnstile = {
    render: (_el, options) => { state.options = options; return 'widget-1' },
    reset: () => { state.resets += 1 },
    remove: id => { state.removed.push(id) },
  }
  return state
}

describe('Turnstile', () => {
  beforeEach(() => { delete window.turnstile })
  afterEach(() => { cleanup(); delete window.turnstile })

  it('renders the widget with the site key and hands the token up', async () => {
    const fake = fakeTurnstile()
    const { Turnstile } = await import('./Turnstile')
    const onToken = vi.fn()
    render(<Turnstile onToken={onToken} action="login" />)
    await act(async () => { await Promise.resolve() })
    expect(fake.options?.sitekey).toBe('site-key-under-test')
    expect(fake.options?.action).toBe('login')
    act(() => { fake.options?.callback('tok-1') })
    expect(onToken).toHaveBeenCalledWith('tok-1')
  })

  it('reports expiry and error as no token, so the form closes again', async () => {
    const fake = fakeTurnstile()
    const { Turnstile } = await import('./Turnstile')
    const onToken = vi.fn()
    render(<Turnstile onToken={onToken} action="signup" />)
    await act(async () => { await Promise.resolve() })
    act(() => { fake.options?.['expired-callback']?.() })
    expect(onToken).toHaveBeenLastCalledWith(null)
    act(() => { fake.options?.['error-callback']?.() })
    expect(onToken).toHaveBeenLastCalledWith(null)
  })

  it('asks for a fresh token when the form bumps resetKey, and removes the widget on unmount', async () => {
    const fake = fakeTurnstile()
    const { Turnstile } = await import('./Turnstile')
    const onToken = vi.fn()
    const view = render(<Turnstile onToken={onToken} action="reset" resetKey={0} />)
    await act(async () => { await Promise.resolve() })
    view.rerender(<Turnstile onToken={onToken} action="reset" resetKey={1} />)
    expect(fake.resets).toBe(1)
    expect(onToken).toHaveBeenLastCalledWith(null)
    view.unmount()
    expect(fake.removed).toEqual(['widget-1'])
  })

})
