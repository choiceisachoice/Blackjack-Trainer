import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { TURNSTILE_SITE_KEY } from '../../services/captcha'
import { loadTurnstile, type TurnstileApi } from '../../services/turnstile-loader'

interface TurnstileProps {
  /**
   * Called with a fresh token when the check passes, and with null when the
   * token expires or the check fails — so the form can disable itself again.
   */
  onToken: (token: string | null) => void
  /** Names the form for Cloudflare's analytics: `login`, `signup`, `reset`. */
  action: string
  /**
   * Bump to ask for a new token. A token is single-use: after a submit —
   * successful or not — the widget has to run again before the next one.
   */
  resetKey?: number
}

/**
 * The bot check, mounted inside the auth form.
 *
 * Renders nothing when no site key is configured, which is how local
 * development and the test run work. With a key it draws Cloudflare's
 * widget — invisible for most people, a checkbox for the rest — and hands
 * the resulting token up through `onToken`.
 *
 * Failures are reported as a null token rather than thrown: the form stays
 * closed, which is the safe direction, and the message it shows is its own.
 */
export function Turnstile({ onToken, action, resetKey = 0 }: TurnstileProps) {
  const { i18n } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<string | null>(null)
  // Latest callback without re-rendering the widget for it.
  const onTokenRef = useRef(onToken)
  useEffect(() => { onTokenRef.current = onToken })

  useEffect(() => {
    // Copied into a local so the narrowing survives into the `.then` below;
    // an imported binding is not narrowed inside a callback.
    const siteKey = TURNSTILE_SITE_KEY
    if (!siteKey || !containerRef.current) return
    const container = containerRef.current
    let cancelled = false
    let api: TurnstileApi | null = null
    loadTurnstile()
      .then(t => {
        if (cancelled) return
        api = t
        widgetRef.current = t.render(container, {
          sitekey: siteKey,
          action,
          theme: 'dark',
          language: i18n.language.split('-')[0],
          callback: token => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(e => {
        console.error('turnstile unavailable', e)
        if (!cancelled) onTokenRef.current(null)
      })
    return () => {
      cancelled = true
      if (api && widgetRef.current) {
        try { api.remove(widgetRef.current) } catch { /* already gone */ }
      }
      widgetRef.current = null
    }
    // The language is read at mount; a switch mid-form re-mounts the page anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action])

  // A used token cannot be used twice; the form bumps `resetKey` after each
  // attempt and the widget fetches a new one.
  useEffect(() => {
    if (resetKey === 0 || !widgetRef.current || !window.turnstile) return
    onTokenRef.current(null)
    window.turnstile.reset(widgetRef.current)
  }, [resetKey])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={containerRef} data-testid="turnstile" className="flex justify-center min-h-[65px]" />
}
