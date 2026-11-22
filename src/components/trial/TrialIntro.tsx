import { useTranslation } from 'react-i18next'
import { Button } from '../common/ui'
import { GUEST_ROUND_HANDS } from '../../services/guest-trial'

interface TrialIntroProps {
  /** Deal the first hand. */
  onStart: () => void
  /**
   * Carry the page's `<h1>`. `/try` has no other heading, so the card is it;
   * on the landing the section's own `<h2>` stands beside the card and the
   * card must not add a second one.
   */
  titled?: boolean
  /** The round is on its way (its code is still loading): the button waits. */
  busy?: boolean
}

/**
 * The screen before the first hand of the trial round: what it is, how long,
 * and one button.
 *
 * Its own small module, apart from the round itself, on purpose. It is what
 * the prerendered pages show (`/try`, and the landing's play section), so it
 * has to render without the trainer — which the landing only fetches once a
 * visitor is about to play. The wrapper is the same one the round's screens
 * use, so the card that replaces this one sits exactly where this one sat.
 */
export function TrialIntro({ onStart, titled = false, busy = false }: TrialIntroProps) {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      <div className="surface w-full max-w-md p-6 md:p-8 text-center" data-testid="try-intro">
        <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('try.eyebrow')}</div>
        {titled && (
          <h1 className="mt-3 text-2xl md:text-3xl font-extrabold tracking-tight text-balance">{t('try.title')}</h1>
        )}
        <p className="mt-3 text-sm text-content/60 leading-relaxed">{t('try.intro', { hands: GUEST_ROUND_HANDS })}</p>
        <Button size="lg" className="w-full mt-6" onClick={onStart} aria-busy={busy || undefined} data-testid="try-start">
          {t('try.start')}
        </Button>
      </div>
    </div>
  )
}
