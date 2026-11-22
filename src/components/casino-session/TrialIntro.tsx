import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Club, Play } from 'lucide-react'
import { TrainingBackdrop } from '../training/TrainingBackdrop'

interface TrialIntroProps {
  /** Trial hands still to play. */
  handsLeft: number
  /** Sit down: deal the trial table. */
  onStart: () => void
  /**
   * The account's trial table is saved on this device (a reload, a closed
   * tab): the card that continues it. It is then the only thing offered —
   * "continue your table" beside "take a seat" at a new one would be two
   * answers to one question.
   */
  savedTable?: ReactNode
  /** Shown above the offer: a saved table that is not the trial's, when there is one. */
  notice?: ReactNode
}

/**
 * Where an account without Pro lands when it opens the casino table and still
 * has trial hands: what it gets, in three lines, and one button.
 *
 * It stands in for the setup screen, which the trial does not have (see
 * `trial-table.ts`). Deliberately not the table itself: opening a link must
 * not start a session, and someone coming back from a summary or a discarded
 * table needs a place to arrive that is not a deal already under way.
 *
 * Three sentences and no list. What the table is, what it tells you, and the
 * one condition — said before the first card rather than at the paywall.
 */
export function TrialIntro({ handsLeft, onStart, savedTable, notice }: TrialIntroProps) {
  const { t } = useTranslation()
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="relative isolate min-h-full px-4 py-8 flex flex-col items-center">
        <TrainingBackdrop mode="casinoSession" showRails railBreakpoint="2xl" />
        <div className="w-full max-w-md my-auto">
          {savedTable ? (
            <div data-testid="trial-intro-saved">
              {savedTable}
              <p className="mt-3 text-center text-xs text-content/50" data-testid="trial-intro-left">
                {t('casino.trial.left', { count: handsLeft })}
              </p>
            </div>
          ) : (
            <>
              {notice && <div className="mb-6 empty:hidden">{notice}</div>}
              <section className="surface p-6 md:p-8 text-center" data-testid="trial-intro">
                <span className="mx-auto grid place-items-center w-12 h-12 rounded-xl text-gold bg-gold/15 border border-gold/30">
                  <Club size={24} className="fill-current" />
                </span>
                <h2 className="mt-4 text-2xl font-extrabold text-gold-gradient" data-testid="trial-intro-title">
                  {t('casino.trial.introTitle', { count: handsLeft })}
                </h2>
                <p className="mt-3 text-sm text-content/65 leading-relaxed">{t('casino.trial.introBody')}</p>
                <button
                  onClick={onStart}
                  data-testid="trial-start"
                  className="lift-glow mt-6 w-full py-3.5 rounded-xl font-semibold text-on-gold
                    bg-gradient-to-b from-gold-bright to-gold border border-gold/50 cursor-pointer
                    flex items-center justify-center gap-2 shadow-[0_10px_30px_-12px_var(--color-gold)]"
                >
                  <Play size={18} className="fill-current" />
                  {t('casino.trial.start')}
                </button>
                <p className="mt-4 text-xs text-content/45">{t('casino.trial.introNote')}</p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
