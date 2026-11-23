import type { ReactNode, Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { Volume2, VolumeX } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { soundEngine } from '../../services/sound-engine'
import { STAGE_FRAME, STAGE_HEIGHT } from './stage-layout'

interface TrialStageProps {
  /** The left of the bar above the felt: which hand this is. */
  status: ReactNode
  /** The table. */
  felt: ReactNode
  /** What is asked of the player now: the deal, a decision, the next hand. */
  controls: ReactNode
  /** The frame's element, for a caller that needs to know where it is on the page. */
  frameRef?: Ref<HTMLDivElement>
}

/**
 * The frame of the guest table: a slim bar, the felt, and the controls under
 * it — the casino table's own arrangement, at the size of a section of a page.
 *
 * One frame for the intro and the round, so the round's code arrives into a
 * box that is already the right size: the felt stays where it is and only
 * what lies on it changes. Side by side on a phone held sideways, where the
 * height is what is scarce. The controls keep one height through every
 * state — the deal, a decision, a verdict — so the felt, which fits itself
 * to what is left, never changes size during a round.
 */
export function TrialStage({ status, felt, controls, frameRef }: TrialStageProps) {
  const { t } = useTranslation()
  return (
    <div
      ref={frameRef}
      data-testid="trial-stage"
      className={`${STAGE_FRAME} ${STAGE_HEIGHT} grid grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto]
        [grid-template-areas:'bar'_'felt'_'controls']
        short:grid-cols-[minmax(0,1fr)_13.5rem] short:grid-rows-[auto_minmax(0,1fr)]
        short:[grid-template-areas:'felt_bar'_'felt_controls']`}
    >
      <div
        className="[grid-area:bar] h-9 px-3 sm:px-4 flex items-center justify-between gap-3 text-xs
          bg-contrast/5 border-b border-contrast/10 short:border-l"
        data-testid="trial-bar"
      >
        <span className="text-content/60 tabular-nums whitespace-nowrap" data-testid="trial-status">{status}</span>
        <span className="flex items-center gap-2.5">
          <span className="text-content/40 whitespace-nowrap">{t('try.table.playMoney')}</span>
          <SoundToggle />
        </span>
      </div>
      <div className="[grid-area:felt] min-h-0 min-w-0 flex">{felt}</div>
      <div
        className="[grid-area:controls] h-[7.75rem] lg:h-[6.5rem] short:h-auto px-3 py-3 short:px-2
          flex flex-col justify-center short:justify-start short:pt-4
          bg-contrast/5 border-t border-contrast/10 short:border-t-0 short:border-l"
        data-testid="trial-controls"
      >
        {controls}
      </div>
    </div>
  )
}

/**
 * The table's sound, on and off. The app's own setting, so a visitor who
 * switched it off here finds it off in the trainer too. Switching it on is a
 * click, and the sounds that follow are played from timers: that click is
 * where the audio is woken (`soundEngine.prime`).
 */
function SoundToggle() {
  const { t } = useTranslation()
  const on = useAppStore(s => s.soundEnabled)
  const toggle = useAppStore(s => s.toggleSound)
  return (
    <button
      type="button"
      onClick={() => { toggle(); soundEngine.prime() }}
      aria-label={t('nav.sound')}
      aria-pressed={on}
      title={on ? t('nav.soundOn') : t('nav.soundOff')}
      data-testid="trial-sound"
      className="grid place-items-center w-8 h-8 -my-1 -mr-1.5 rounded-lg text-content/55 hover:text-gold cursor-pointer"
    >
      {on ? <Volume2 size={15} /> : <VolumeX size={15} />}
    </button>
  )
}
