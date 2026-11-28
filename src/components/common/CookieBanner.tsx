import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { getConsent, setConsent, clearConsent, onConsentChanged, type Consent } from '../../services/analytics/consent-choice'
import { consentQuestionApplies } from '../../services/analytics/consent'

/**
 * The one question the site asks a visitor: may we count your visit?
 *
 * A bar along the bottom, not a wall across the page: the page stays readable
 * and usable while it is there, and nothing is counted until it is answered.
 * Two buttons of the same size and weight — a "decline" that is harder to
 * find than "accept" is not a choice.
 *
 * Asked once per device. This component is not rendered on the server
 * (`getServerSnapshot` says "answered"); the prerendered pages carry their
 * own copy of {@link CookieBar} instead, outside `#root`, which
 * `public/boot.js` hides before the first paint for someone who answered
 * last month — and which this component then adopts rather than replaces
 * (`data-boot-banner`).
 */
export function CookieBanner() {
  const consent = useSyncExternalStore(onConsentChanged, getConsent, () => 'declined' as const)
  const applies = useSyncExternalStore(() => () => {}, consentQuestionApplies, () => false)
  const { i18n } = useTranslation()
  const navigate = useNavigate()

  // The prerendered bar, while it is in the language the app is in. Looked up
  // once: after a language switch (or when it was never there) it is removed
  // and the bar is rendered by React like any other component.
  // Once removed it stays removed (`isConnected`), so switching back to the
  // page's language later does not adopt a detached element.
  const [found] = useState(findPrerenderedBar)
  const prebuilt = found?.el ?? null
  const adopted = found !== null && found.lang === i18n.language && found.el.isConnected

  // While the bar is up it publishes its height, so a button pinned to the
  // bottom of a phone screen (the table setup's Start, the welcome's first
  // step) stands on top of it instead of under it.
  const bar = useRef<HTMLDivElement>(null)
  const showing = applies && consent === null

  // Take the prerendered bar over in place: answer its buttons, route its
  // privacy link, show and hide it. Renaming the marker takes it out of
  // boot.js's hands (the CSS rule and the click handler both select on it),
  // so "Cookie settings" can bring it back later.
  useLayoutEffect(() => {
    if (!prebuilt) return
    if (!adopted) {
      prebuilt.remove()
      return
    }
    prebuilt.removeAttribute(PRERENDERED_BAR_ATTR)
    prebuilt.setAttribute('data-adopted-banner', '')
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null
      const id = target?.closest('[data-testid]')?.getAttribute('data-testid')
      if (id === 'cookie-accept') setConsent('accepted')
      else if (id === 'cookie-decline') setConsent('declined')
      else if (target?.closest('a[href]') && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
        e.preventDefault()
        void navigate('/privacy')
      }
    }
    prebuilt.addEventListener('click', onClick)
    return () => prebuilt.removeEventListener('click', onClick)
  }, [prebuilt, adopted, navigate])

  useLayoutEffect(() => {
    if (adopted && prebuilt) setShown(prebuilt, showing)
  }, [adopted, prebuilt, showing])

  useEffect(() => {
    const el = adopted ? prebuilt : bar.current
    if (!showing || !el) return
    const root = document.documentElement
    const publish = () => root.style.setProperty('--cookie-bar', `${Math.ceil(el.getBoundingClientRect().height)}px`)
    publish()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(el)
    return () => { observer?.disconnect(); root.style.removeProperty('--cookie-bar') }
  }, [showing, adopted, prebuilt])

  if (!showing || adopted) return null

  return <CookieBar barRef={bar} onAnswer={setConsent} />
}

/**
 * The attribute that marks the prerendered bar; its value is the page's
 * language. `public/boot.js` and the rule in `index.html` select on it.
 */
const PRERENDERED_BAR_ATTR = 'data-boot-banner'

/** Show or hide an adopted bar; it is not React's to render, so not React's to hide. */
function setShown(el: HTMLElement, shown: boolean): void {
  el.style.display = shown ? '' : 'none'
}

/** The prerendered bar outside `#root` and its language, if the page came with one. */
function findPrerenderedBar(): { el: HTMLElement; lang: string } | null {
  if (typeof document === 'undefined') return null
  const el = document.querySelector<HTMLElement>(`body > [${PRERENDERED_BAR_ATTR}]`)
  return el ? { el, lang: el.getAttribute(PRERENDERED_BAR_ATTR) ?? '' } : null
}

/** What {@link CookieBar} takes. */
export interface CookieBarProps {
  /** Receives the bar's outer element, for publishing its height. */
  barRef?: Ref<HTMLDivElement>
  /** Called with the visitor's answer; absent in the prerendered copy. */
  onAnswer?: (consent: Consent) => void
  /**
   * The page's language, for the copy written into the prerendered HTML
   * (`renderCookieBannerMarkup`). It becomes the `data-boot-banner` marker.
   */
  prerenderedLang?: string
}

/**
 * The bar itself, without the question of whether to show it.
 *
 * One markup for both copies: the live one `CookieBanner` renders and the one
 * the prerender writes into every public page. The prerendered copy is on
 * screen from the first paint, beside `#root` rather than in it, so the app's
 * mount — which replaces everything inside `#root` — leaves it alone and
 * `CookieBanner` adopts the element itself. Before 28 Nov 2026 the bar
 * appeared only when the app mounted and became the page's LCP element, 2-3 s
 * after the page itself was readable; a copy inside `#root` still did on a
 * phone, because the remount's paint came out a few pixels larger than the
 * first one.
 */
export function CookieBar({ barRef, onAnswer, prerenderedLang }: CookieBarProps) {
  const { t } = useTranslation()
  return (
    <div
      ref={barRef}
      role="dialog"
      aria-modal="false"
      aria-label={t('consent.title')}
      data-testid="cookie-banner"
      data-boot-banner={prerenderedLang}
      className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:px-5 sm:pb-5 try-wide:pb-3 pointer-events-none"
    >
      <div
        className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-contrast/12 bg-[var(--color-surface-2)]
          shadow-[0_18px_50px_-12px_rgba(0,0,0,.85)] p-3.5 sm:p-5
          flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4
          try-wide:max-w-[88rem] try-wide:px-5 try-wide:py-3"
      >
        {/* A wide, low window (2000x720) has width to spare and no height: there
            the question runs on in one or two lines instead of a title over
            three, so the bar takes ~80px from the table, not 190. */}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-content try-wide:inline try-wide:mr-2">{t('consent.title')}</h2>
          <p className="mt-1 text-sm text-content/65 leading-relaxed try-wide:inline try-wide:mt-0">
            {/* A phone gets the short version: the long one made the bar a
                third of the screen and put it on top of the start buttons. */}
            <span className="max-sm:hidden">{t('consent.body')}</span>
            <span className="sm:hidden">{t('consent.short')}</span>{' '}
            <Link to="/privacy" className="underline underline-offset-2 text-content/80 hover:text-gold">
              {t('consent.more')}
            </Link>
          </p>
        </div>
        <div className="flex gap-2.5 shrink-0">
          <button
            onClick={() => onAnswer?.('declined')}
            data-testid="cookie-decline"
            className="flex-1 sm:flex-none min-w-28 rounded-xl px-4 py-2.5 text-sm font-semibold cursor-pointer
              border border-contrast/20 text-content hover:border-gold/50 transition-colors"
          >
            {t('consent.decline')}
          </button>
          <button
            onClick={() => onAnswer?.('accepted')}
            data-testid="cookie-accept"
            className="flex-1 sm:flex-none min-w-28 rounded-xl px-4 py-2.5 text-sm font-semibold cursor-pointer
              border border-gold/60 bg-gold/15 text-gold hover:bg-gold/25 transition-colors"
          >
            {t('consent.accept')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * "Cookie settings" — a footer link that puts the question back.
 *
 * An answer that can be given once and never changed is not consent. The link
 * is only there where the question applies at all.
 */
export function CookieSettingsLink({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const applies = useSyncExternalStore(() => () => {}, consentQuestionApplies, () => false)
  if (!applies) return null
  return (
    <button
      type="button"
      onClick={() => clearConsent()}
      data-testid="cookie-settings"
      className={`cursor-pointer ${className}`}
    >
      {t('consent.settings')}
    </button>
  )
}
