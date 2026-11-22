import { useCallback, useState } from 'react'
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
 * `/try` — one round of flashcards without an account.
 *
 * ## Why this exists
 *
 * Some seven hundred visitors, one customer: the sign-up form was the first
 * thing the product asked of anyone, before they had touched it. Here a
 * visitor plays ten basic-strategy hands — the trainer's own questions and
 * feedback, not a demo of them — and is asked for an account once, at the
 * end, when there is a result worth keeping.
 *
 * The round itself is `TrialRound`, the same component the landing's play
 * section renders; this page is its own address for it (indexed, linked from
 * the videos) and the frame around it.
 *
 * ## What it is careful about
 *
 * - **One next step.** The summary offers the account and, quietly, the way
 *   home. The shell's closing call to action is switched off so the page does
 *   not ask twice. Nothing interrupts the round.
 * - **The result is kept by the ordinary path.** The round is recorded like
 *   any session — locally, since nobody is signed in — and the sign-in merge
 *   uploads it to the account created afterwards (`services/guest-trial.ts`
 *   says which accounts may take it).
 * - **A signed-in visitor has no business here** and is sent to the app.
 * - **A device that still holds an account's data** (a session that expired)
 *   plays the round without recording it, and the summary does not promise
 *   that the result will be kept.
 *
 * Prerendered in every language like the other public pages: the first
 * screen is the intro, which is the same for everyone.
 */
export function TryPage() {
  const { t } = useTranslation()
  usePageMeta('try', '/try')
  const status = useAuthStore(s => s.status)
  const { state } = useLocation()
  const autoStart = (state as TryLocationState | null)?.autoStart === true
  const [started, setStarted] = useState(autoStart)

  const onStart = useCallback(() => {
    setStarted(true)
    // The start button may have been reached by scrolling (a phone held
    // sideways, the cookie bar up). The first hand belongs at the top of
    // the screen, not half under the header.
    if (typeof window !== 'undefined' && window.scrollY > 0) window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [])

  if (isSupabaseConfigured && status === 'signedIn') return <Navigate to="/app" replace />

  return (
    <PublicShell cta={false} testId="try-page">
      {/* The intro and the summary carry the visible heading; in between the
          card is the page, and the heading is for a screen reader only. */}
      {started && <h1 className="sr-only">{t('try.title')}</h1>}
      {/* Tall enough that the card sits in the middle of the first screen and
          does not jump between a short question and a long one. A phone held
          sideways has no height to give: there the card starts at the top.
          The bottom padding is the cookie bar's height while it is up, so the
          last row can always be scrolled clear of it. */}
      <div
        className="flex flex-col min-h-[min(30rem,calc(100dvh-13rem))] short:min-h-0 short:-mt-4"
        style={{ paddingBottom: 'var(--cookie-bar, 0px)' }}
      >
        <TrialRound autoStart={autoStart} titled onStart={onStart} />
      </div>
    </PublicShell>
  )
}
