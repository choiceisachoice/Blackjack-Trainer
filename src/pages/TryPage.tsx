import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router-dom'
import { PublicShell } from '../components/common/PublicShell'
import { TrialRound } from '../components/trial/TrialRound'
import { usePageMeta } from '../hooks/use-page-meta'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'

/** Router state that opens the round on its first hand (a link that already said "deal"). */
export interface TryLocationState {
  autoStart?: boolean
}

/**
 * `/try` — ten hands at the casino table without an account.
 *
 * ## Why this exists
 *
 * Some seven hundred visitors, one customer: the sign-up form was the first
 * thing the product asked of anyone, before they had touched it. Here a
 * visitor sits down at the table — the real felt, cards and deal, every
 * decision theirs — and after each hand sees what basic strategy plays. They
 * are asked for something once, at the end, when the ten hands have shown
 * what the product is.
 *
 * The round itself is `TrialRound`, the same component the landing's play
 * section renders; this page is its own address for it (indexed, linked from
 * the videos) and the frame around it.
 *
 * ## What it is careful about
 *
 * - **One ask, at the end.** The summary offers Pro and the free account.
 *   The shell's closing call to action is switched off so the page does not
 *   ask twice. Nothing interrupts the round.
 * - **Nothing is recorded**, so nothing is promised: the round belongs to no
 *   account (see `TrialRound`).
 * - **A signed-in visitor has no business here** and is sent to the app.
 *
 * Prerendered in every language like the other public pages: the heading,
 * the sentence and the empty table, which are the same for everyone.
 */
export function TryPage() {
  const { t } = useTranslation()
  usePageMeta('try', '/try')
  const status = useAuthStore(s => s.status)
  const { state } = useLocation()
  const autoStart = (state as TryLocationState | null)?.autoStart === true
  const stage = useRef<HTMLDivElement>(null)

  // The first hand belongs on screen whole: under the header, clear of the
  // cookie bar — the heading above it has been read.
  const onStart = useCallback(() => {
    const el = stage.current
    if (!el || typeof el.scrollIntoView !== 'function') return
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  }, [])

  if (isSupabaseConfigured && status === 'signedIn') return <Navigate to="/app" replace />

  return (
    <PublicShell cta={false} testId="try-page">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="max-w-[42em]">
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('try.eyebrow')}</div>
          <h1 id="try-title" className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight leading-tight text-balance">{t('try.title')}</h1>
          <p className="mt-3 text-content/60 text-base">{t('try.intro')}</p>
        </div>
        {/* The header is 4rem; `--stage-top` is that and some air, the
            height the stage leaves above itself when it is scrolled to. */}
        <div
          ref={stage}
          role="group"
          aria-labelledby="try-title"
          data-testid="try-stage"
          className="mt-6 md:mt-8 -mx-4 sm:mx-0 scroll-mt-[4.5rem]"
          style={{ scrollMarginBottom: 'calc(var(--cookie-bar, 0px) + 12px)', ['--stage-top' as string]: '4.5rem' }}
        >
          <TrialRound autoStart={autoStart} onStart={onStart} />
        </div>
      </div>
    </PublicShell>
  )
}
