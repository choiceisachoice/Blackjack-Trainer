import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { formatDollar } from '../casino-session/helpers'
import { ACTION_KEY } from '../training/deviation-utils'
import { usePlanPriceStore, selectPlan } from '../../store/plan-price-store'
import { formatMoney, yearlySaving } from '../../services/pro-features'
import { setPendingCheckout } from '../../services/supabase/billing'
import { GUEST_ROUND_HANDS } from '../../services/guest-trial'
import type { Translate } from '../../i18n/translate'
import { tallyRound, type GradedDecision, type SettledHand } from './trial-verdict'
import { STAGE_FRAME, STAGE_MIN_HEIGHT } from './stage-layout'

/** How many misses the summary lists; the rest are counted. Ten hands of a beginner can hold a dozen. */
const MISSES_SHOWN = 5

interface TrialSummaryProps {
  /** The settled hands, in the order they were played. */
  round: readonly SettledHand[]
  /** Deal a fresh round. */
  onAgain: () => void
}

/**
 * The end of the guest table: what the ten hands came to, and what to do next.
 *
 * On the left the result, in the order a player asks for it — how many
 * decisions were basic strategy, how the hands went, the play money — and the
 * spots that were not, each with the right play. On the right the next step:
 * Pro first, with its real price (from Stripe, through the same store as the
 * landing's pricing card), then the free account, then another round.
 *
 * It promises nothing about the result. The guest table records nothing —
 * not on the device, not in an account created afterwards — so the account
 * is offered for what it gives, never as the place this round is kept.
 *
 * A visitor who chooses Pro is signed out by definition (a signed-in one
 * never sees this table): the plan is remembered and the account comes
 * first, and checkout opens on its own once they are signed in (`App`'s
 * pending checkout — the landing's pricing card goes the same way).
 */
export function TrialSummary({ round, onAgain }: TrialSummaryProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const tally = tallyRound(round)

  const status = usePlanPriceStore(s => s.status)
  const yearly = usePlanPriceStore(s => selectPlan(s, 'yearly'))
  const monthly = usePlanPriceStore(s => selectPlan(s, 'monthly'))
  useEffect(() => { void usePlanPriceStore.getState().load() }, [])
  const money = (minor: number, currency: string) => formatMoney(minor, currency, i18n.language)
  const saving = yearly && monthly ? yearlySaving(monthly.amount, yearly.amount) : null

  const goPro = () => {
    setPendingCheckout('yearly')
    void navigate('/login', { state: { mode: 'signup' } })
  }

  const shown = tally.misses.slice(0, MISSES_SHOWN)
  const net = `${tally.net > 0 ? '+' : ''}${formatDollar(tally.net)}`

  return (
    <div
      className={`${STAGE_FRAME} ${STAGE_MIN_HEIGHT} px-5 py-7 sm:p-8 lg:p-10 grid gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-10 lg:gap-12 items-start content-center`}
      data-testid="try-summary"
    >
      <section aria-labelledby="try-result">
        <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('try.end.eyebrow')}</div>
        {tally.decisions > 0 ? (
          <>
            <div className="mt-3 text-5xl font-extrabold tabular-nums text-gold-gradient" data-testid="try-score">
              {`${tally.correct}/${tally.decisions}`}
            </div>
            <h3 id="try-result" className="mt-2 text-base font-semibold text-content">
              {t('try.table.score', { correct: tally.correct, count: tally.decisions })}
            </h3>
          </>
        ) : (
          <h3 id="try-result" className="mt-3 text-base font-semibold text-content">{t('try.table.noDecisions')}</h3>
        )}
        <p className="mt-1.5 text-sm text-content/55 tabular-nums" data-testid="try-record">
          {t('try.table.record', { won: tally.won, lost: tally.lost, pushed: tally.pushed })}
          {/* Not coloured: over ten hands the money is mostly luck, and the
              decisions above are what the visitor can do something about. */}
          <span aria-hidden className="mx-2 text-content/25">·</span>
          <span className="text-content/75" data-testid="try-money">{t('try.table.money', { amount: net })}</span>
        </p>
        {tally.hands < GUEST_ROUND_HANDS && (
          <p className="mt-1 text-xs text-content/45" data-testid="try-ended-early">{t('try.table.endedEarly', { count: tally.hands })}</p>
        )}

        {tally.misses.length === 0 ? (
          tally.decisions > 0 && <p className="mt-6 text-sm text-content/65" data-testid="try-perfect">{t('try.end.perfect')}</p>
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
              {shown.map((m, i) => (
                // The same spot can be missed twice in a round; the position is the identity.
                <tr key={i} className="border-b border-contrast/10 last:border-b-0">
                  <th scope="row" className="py-2 pr-3 text-left font-semibold text-content whitespace-nowrap">
                    {t('try.end.hand', { hand: m.hand, dealer: m.dealer })}
                  </th>
                  <td className="py-2 pr-3 text-content/50">{chosenLabel(m, t)}</td>
                  <td className="py-2 text-right font-semibold text-success">{rightLabel(m, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tally.misses.length > shown.length && (
          <p className="mt-2 text-xs text-content/45" data-testid="try-more-misses">
            {t('try.table.moreMisses', { count: tally.misses.length - shown.length })}
          </p>
        )}
      </section>

      <section aria-labelledby="try-pro" className="md:pl-10 lg:pl-12 md:border-l border-contrast/10 pt-7 md:pt-0 border-t md:border-t-0 flex flex-col">
        <h3 id="try-pro" className="text-lg font-bold text-content">{t('casino.trial.toPro')}</h3>
        <p className="mt-1.5 text-sm text-content/65 leading-relaxed">{t('try.table.proLine')}</p>
        <button
          type="button"
          onClick={goPro}
          data-testid="try-pro"
          className="mt-5 w-full rounded-xl px-5 py-3.5 font-semibold cursor-pointer bg-gradient-to-b from-gold-bright to-gold text-on-gold
            shadow-[0_10px_30px_-12px_var(--color-gold)] lift-glow"
        >
          {/* Names the amount only once Stripe has confirmed it; Stripe states it again before anything is charged. */}
          {yearly
            ? t('pricing.goProPrice', { price: `${money(yearly.amount, yearly.currency)}${t('pricing.perYear')}` })
            : t('pricing.goPro')}
        </button>
        <p className="mt-2 text-xs text-content/50 leading-relaxed" data-testid="try-pro-note">
          {status === 'error' ? `${t('pricing.atCheckout')} · ` : saving && monthly
            ? `${t('pricing.saveAgainstMonthly', { amount: money(saving.saved, monthly.currency), percent: saving.percent })} · `
            : null}
          {t('try.table.proAfterSignup')}
        </p>

        <Link
          to="/login"
          state={{ mode: 'signup' }}
          data-testid="try-signup"
          className="mt-6 w-full rounded-xl px-5 py-3 text-center font-semibold border border-contrast/20 text-content hover:border-gold/55 transition-colors"
        >
          {t('try.end.cta')}
        </Link>
        <p className="mt-2 text-xs text-content/50" data-testid="try-free-line">{t('try.table.freeLine')}</p>

        <button
          type="button"
          onClick={onAgain}
          data-testid="try-again"
          className="mt-5 self-center inline-flex items-center min-h-10 px-2 text-sm text-content/55 hover:text-content cursor-pointer"
        >
          {t('try.table.again')}
        </button>
      </section>
    </div>
  )
}

/** What the visitor did, in the table's words. */
function chosenLabel(m: GradedDecision, t: Translate): string {
  if (m.kind === 'insurance') return m.took ? t('actions.insurance') : t('try.table.noInsurance')
  return t(ACTION_KEY[m.chosen])
}

/** What basic strategy does there. */
function rightLabel(m: GradedDecision, t: Translate): string {
  if (m.kind === 'insurance') return t('try.table.noInsurance')
  return t(ACTION_KEY[m.correct])
}
