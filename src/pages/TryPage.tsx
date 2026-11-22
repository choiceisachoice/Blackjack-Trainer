import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { PublicShell } from '../components/common/PublicShell'
import { Button } from '../components/common/ui'
import { DeviationTraining, type FlashRoundResult, type FlashTrial } from '../components/training/DeviationTraining'
import { ACTION_KEY } from '../components/training/deviation-utils'
import { usePageMeta } from '../hooks/use-page-meta'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'
import { GUEST_ROUND_HANDS, guestRoundIsKept, markGuestRound } from '../services/guest-trial'

/** What the landing's "try a round" link carries, so the round opens on its first hand. */
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
 * screen is the intro, which is the same for everyone. Arriving from the
 * landing's button skips it — that click already said "deal".
 */
export function TryPage() {
  const { t } = useTranslation()
  usePageMeta('try', '/try')
  const status = useAuthStore(s => s.status)
  const { state } = useLocation()
  const autoStart = (state as TryLocationState | null)?.autoStart === true
  const [started, setStarted] = useState(autoStart)
  // Decided once per visit: the answer must not change under a round in play.
  const [kept] = useState(guestRoundIsKept)

  const trial = useMemo<FlashTrial>(() => ({
    questions: GUEST_ROUND_HANDS,
    autoStart,
    record: kept,
    onStart: () => {
      if (kept) markGuestRound()
      setStarted(true)
      // The start button may have been reached by scrolling (a phone held
      // sideways, the cookie bar up). The first hand belongs at the top of
      // the screen, not half under the header.
      if (typeof window !== 'undefined' && window.scrollY > 0) window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    },
    renderIntro: start => (
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="surface w-full max-w-md p-6 md:p-8 text-center" data-testid="try-intro">
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('try.eyebrow')}</div>
          <h1 className="mt-3 text-2xl md:text-3xl font-extrabold tracking-tight text-balance">{t('try.title')}</h1>
          <p className="mt-3 text-sm text-content/60 leading-relaxed">{t('try.intro', { hands: GUEST_ROUND_HANDS })}</p>
          <Button size="lg" className="w-full mt-6" onClick={start} data-testid="try-start">{t('try.start')}</Button>
        </div>
      </div>
    ),
    renderSummary: result => <TrySummary result={result} kept={kept} />,
  }), [autoStart, kept, t])

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
        <DeviationTraining trial={trial} />
      </div>
    </PublicShell>
  )
}

/**
 * The end of the trial round: the score, the hands that went wrong with the
 * play that was right, and the one thing to do next.
 */
function TrySummary({ result, kept }: { result: FlashRoundResult; kept: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="surface w-full max-w-md p-6 md:p-8" data-testid="try-summary">
        <div className="text-center">
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('try.end.eyebrow')}</div>
          <div className="mt-3 text-5xl font-extrabold tabular-nums text-gold-gradient" data-testid="try-score">
            {`${result.correct}/${result.total}`}
          </div>
          <h2 className="mt-2 text-base font-semibold text-content">
            {t('try.end.score', { correct: result.correct, total: result.total })}
          </h2>
        </div>

        {result.misses.length === 0 ? (
          <p className="mt-5 text-sm text-content/60 text-center" data-testid="try-perfect">{t('try.end.perfect')}</p>
        ) : (
          <table className="mt-6 w-full text-sm tabular-nums" data-testid="try-misses">
            <caption className="text-left text-xs font-semibold tracking-widest uppercase text-content/40 pb-2">
              {t('try.end.missedTitle')}
            </caption>
            <thead>
              <tr className="text-xs text-content/50 text-left">
                <th scope="col" className="font-medium pb-1.5 pr-3">{t('try.end.colHand')}</th>
                <th scope="col" className="font-medium pb-1.5 pr-3">{t('try.end.colYou')}</th>
                <th scope="col" className="font-medium pb-1.5 text-right">{t('try.end.colRight')}</th>
              </tr>
            </thead>
            <tbody className="border-t border-contrast/10">
              {result.misses.map((m, i) => (
                // The same hand can be missed twice in a round; the position is the identity.
                <tr key={i} className="border-b border-contrast/10 last:border-b-0">
                  <th scope="row" className="py-2 pr-3 text-left font-semibold text-content whitespace-nowrap">
                    {t('try.end.hand', { hand: m.hand, dealer: m.dealer })}
                  </th>
                  <td className="py-2 pr-3 text-content/50">{t(ACTION_KEY[m.chosen])}</td>
                  <td className="py-2 text-right font-semibold text-success">{t(ACTION_KEY[m.correct])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-7 pt-6 border-t border-contrast/10 flex flex-col items-center text-center">
          <p className="text-sm text-content/70 max-w-[38ch]" data-testid="try-next">
            {kept ? t('try.end.keep') : t('try.end.plan')}
          </p>
          <Link
            to="/login"
            state={{ mode: 'signup' }}
            className="mt-4 w-full rounded-xl px-6 py-3 font-semibold bg-gradient-to-b from-gold-bright to-gold text-on-gold"
            data-testid="try-signup"
          >
            {t('try.end.cta')}
          </Link>
          <Link to="/" className="mt-2 inline-flex items-center min-h-10 text-sm text-content/50 hover:text-content" data-testid="try-home">
            {t('common.backToHome')}
          </Link>
        </div>
      </div>
    </div>
  )
}
