import { describe, it, expect } from 'vitest'
import { isCaptchaConfigured, TURNSTILE_SITE_KEY, TURNSTILE_SCRIPT_URL } from './captcha'

describe('captcha config', () => {
  it('is off in the test environment, where no site key is set', () => {
    expect(TURNSTILE_SITE_KEY).toBeUndefined()
    expect(isCaptchaConfigured).toBe(false)
  })

  it('loads Turnstile in explicit mode, so the form decides where it renders', () => {
    expect(TURNSTILE_SCRIPT_URL).toMatch(/^https:\/\/challenges\.cloudflare\.com\//)
    expect(TURNSTILE_SCRIPT_URL).toContain('render=explicit')
  })
})
