import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { DeviationTraining, type FlashRoundResult, type FlashTrial } from '../training/DeviationTraining'
import { ACTION_KEY } from '../training/deviation-utils'
import { GUEST_ROUND_HANDS, guestRoundIsKept, markGuestRound } from '../../services/guest-trial'
import { TrialIntro } from './TrialIntro'

/** What a page tells the trial round it hosts. */
export interface TrialRoundProps {
  /** Open on the first hand instead of the intro — the visitor already asked for a round. */
  autoStart?: boolean
  /** The intro card carries the page's `<h1>` (see `TrialIntro`). */
  titled?: boolean
  /** Called when the first hand is dealt; the page's own business (a heading, a scroll). */
  onStart?: () => void
  /**
   * Offer the way home under the summary's one next step. A page that *is*
   * home (the landing) has nothing to offer there: it simply continues below.
   */
  homeLink?: boolean
}

/**
 * The trial round: ten basic-strategy hands without an account.
 *
 * One component for every place the round is offered — `/try` and the
 * landing's play section — so a visitor plays the same thing in both, and the
 * rules about whose round it is are applied in one place. It is the real
 * `DeviationTraining` with a `trial` prop; this component supplies the two
 * screens that prop asks for (the intro and the summary) and the two halves
 * of the account isolation that belong to the round itself
 * (`services/guest-trial.ts`):
 *
 * - **The round is stamped** when its first hand is dealt, so the sign-in
 *   merge hands it only to an account created afterwards.
 * - **A device that still holds an account's data** plays the round without
 *   recording it, and the summary does not promise that the result is kept.
 *
 * The third half — a signed-in visitor gets no trial — is the host page's:
 * `/try` redirects, the landing does not show the section.
 */
export function TrialRound({ autoStart = false, titled = false, onStart, homeLink = true }: TrialRoundProps) {
  // Decided once per visit: the answer must not change under a round in play.
  const [kept] = useState(guestRoundIsKept)
  // The page's callback is read when the hand is dealt, not when the round
  // was configured: a new function on every render of the page must not
  // rebuild the trial under a round in play.
  const onStartRef = useRef(onStart)
  useEffect(() => { onStartRef.current = onStart })

  const trial = useMemo<FlashTrial>(() => ({
    questions: GUEST_ROUND_HANDS,
    autoStart,
    record: kept,
    onStart: () => {
      if (kept) markGuestRound()
      onStartRef.current?.()
    },
    renderIntro: start => <TrialIntro titled={titled} onStart={start} />,
    renderSummary: result => <TrialSummary result={result} kept={kept} homeLink={homeLink} />,
  }), [autoStart, kept, titled, homeLink])

  return <DeviationTraining trial={trial} />
}

/**
 * The end of the trial round: the score, the hands that went wrong with the
 * play that was right, and the one thing to do next.
 */
function TrialSummary({ result, kept, homeLink }: { result: FlashRoundResult; kept: boolean; homeLink: boolean }) {
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
          {homeLink && (
            <Link to="/" className="mt-2 inline-flex items-center min-h-10 text-sm text-content/50 hover:text-content" data-testid="try-home">
              {t('common.backToHome')}
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
