import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Club } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { useIsPro } from '../../store/entitlement-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { useTrialOpen } from '../../store/casino-trial-store'
import { formatDollar } from './helpers'
import { settleSavedSession } from './record-session'

interface ResumeSessionCardProps {
  /**
   * What "Continue" does. On the home screen it is left out: the card asks the
   * Casino Session to open the saved table and goes there. On the setup screen
   * the Casino Session is already mounted and passes its own.
   */
  onContinue?: () => void
  className?: string
}

/**
 * "You have a session in progress" — the one place a saved table is offered.
 *
 * A casino table now survives a closed tab, a reload and a dead phone (see
 * `services/casino-live-session.ts`). Coming back, the player gets two honest
 * choices and no more: sit down again at the same shoe, or take the result of
 * the hands that were played. No dialog and no reminder anywhere else — a card
 * that can be read past is the right weight for something that is never urgent.
 *
 * Shown only when the saved table is not the one being played in this tab.
 * Without Pro the card offers the cash-out alone: the table is a Pro feature,
 * but the hands were played while it was paid for and their result is the
 * player's either way. The one table such an account may sit down at again is
 * its free trial's, for as long as trial hands remain — the hands are counted
 * per account, not per table, so coming back hands out nothing new.
 */
export function ResumeSessionCard({ onContinue, className = '' }: ResumeSessionCardProps) {
  const { t } = useTranslation()
  const saved = useLiveSessionStore(s => s.saved)
  const playingHere = useLiveSessionStore(s => s.activeMode === 'casinoSession')
  const isPro = useIsPro()
  const trialOpen = useTrialOpen()
  const [busy, setBusy] = useState(false)

  if (!saved || playingHere) return null
  const maySit = isPro || (saved.trial && trialOpen)

  const continueSession = () => {
    if (onContinue) { onContinue(); return }
    useLiveSessionStore.getState().requestResume()
    useAppStore.getState().setMode('casinoSession')
  }

  const cashOut = () => {
    if (busy) return
    setBusy(true)
    // Records the session exactly as the table's Cash out does, then the card
    // is gone (the store no longer holds a saved table). No summary screen:
    // the player stays where they are, and the XP toast says what it paid.
    void settleSavedSession(saved.id).finally(() => setBusy(false))
  }

  return (
    <section
      data-testid="resume-session-card"
      aria-label={t('casino.resume.title')}
      className={`w-full flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-gold/30 px-4 py-3
        bg-[linear-gradient(110deg,color-mix(in_srgb,var(--color-gold)_10%,var(--color-surface)),var(--color-surface))] ${className}`}
    >
      <span className="grid place-items-center w-10 h-10 rounded-xl text-gold bg-gold/15 border border-gold/30 shrink-0">
        <Club size={20} className="fill-current" />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <h2 className="text-sm font-semibold text-content">{t('casino.resume.title')}</h2>
        <p className="text-sm text-content/60 tabular-nums" data-testid="resume-session-status">
          {t('casino.resume.status', { hand: saved.handNumber, bankroll: formatDollar(saved.bankroll) })}
        </p>
        {!maySit && <p className="mt-0.5 text-xs text-content/45">{t('casino.resume.proOnly')}</p>}
      </div>
      <div className="flex flex-wrap gap-2 ml-auto">
        {maySit && (
          <button
            onClick={continueSession}
            disabled={busy}
            data-testid="resume-card-continue"
            className="px-4 py-2 rounded-xl text-sm font-bold bg-gold text-on-gold hover:bg-gold/90 cursor-pointer
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('casino.resume.continue')}
          </button>
        )}
        <button
          onClick={cashOut}
          disabled={busy}
          data-testid="resume-card-cash-out"
          className="px-4 py-2 rounded-xl text-sm font-bold border border-contrast/20 text-content hover:border-gold/55 cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('casino.resume.cashOut')}
        </button>
      </div>
    </section>
  )
}
