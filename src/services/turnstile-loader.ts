import { TURNSTILE_SCRIPT_URL } from './captcha'

/** The part of Cloudflare's global the auth form uses. */
export interface TurnstileApi {
  render(container: HTMLElement, options: {
    sitekey: string
    callback: (token: string) => void
    'expired-callback'?: () => void
    'error-callback'?: () => void
    theme?: 'light' | 'dark' | 'auto'
    language?: string
    action?: string
    appearance?: 'always' | 'execute' | 'interaction-only'
  }): string
  reset(widgetId: string): void
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/** One script tag for the page, however many widgets mount. */
let scriptLoading: Promise<TurnstileApi> | null = null

/**
 * Load Turnstile's script once and resolve to its API.
 *
 * Separate from the component so that it can be shared and tested on its
 * own, and because a load that fails must reset so the next attempt can try
 * again rather than inherit the rejection forever.
 *
 * @returns The `window.turnstile` object once the script has run
 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptLoading) return scriptLoading
  scriptLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile)
      else reject(new Error('turnstile script loaded without defining window.turnstile'))
    }
    script.onerror = () => {
      scriptLoading = null
      reject(new Error('turnstile script failed to load'))
    }
    document.head.appendChild(script)
  })
  return scriptLoading
}
