import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Compass, X, BookOpen, Zap } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { getPlacement } from '../../services/curriculum'
import {
  firstMoveFor,
  recommendationHeadline,
  recommendationReason,
  isRecommendationDone,
  setRecommendationDone,
} from '../../services/recommendation'

/**
 * The recommendation the learner lands on after answering the one question.
 *
 * This is the whole payoff of asking. Before, the answer produced a full-screen
 * result page explaining the placement, and the app opened behind it. Now the
 * app opens first and this card sits on top of it saying one thing: here is
 * what to do next, and here is why.
 *
 * Three ways out, all of them final:
 *  - take the suggestion (opens the screen and puts the card away),
 *  - ask to be shown around (the guided tour),
 *  - dismiss it.
 *
 * It never comes back on its own. A suggestion that reappears after you have
 * answered it is not a suggestion.
 */
export function StartHere({ onTour }: { onTour: () => void }) {
  const { t } = useTranslation()
  const setMode = useAppStore(s => s.setMode)
  const [placement] = useState(() => getPlacement())
  const [done, setDone] = useState(() => isRecommendationDone())

  // Nothing to recommend to someone who skipped the question, and nothing to
  // say to someone who has already dealt with this.
  if (!placement || done) return null

  const move = firstMoveFor(placement)
  const Icon = move.kind === 'read' ? BookOpen : Zap

  const put = (then?: () => void) => {
    setRecommendationDone()
    setDone(true)
    then?.()
  }

  return (
    <section
      className="relative z-10 w-full max-w-5xl mb-8 rounded-2xl border border-gold/30 p-5 md:p-6
        bg-[linear-gradient(110deg,color-mix(in_srgb,var(--color-gold)_10%,var(--color-surface)),var(--color-surface))]"
      data-testid="start-here"
    >
      <button
        onClick={() => put()}
        data-testid="start-here-dismiss"
        aria-label={t('startHere.dismissAria')}
        title={t('startHere.dismiss')}
        className="absolute top-4 right-4 grid place-items-center w-8 h-8 rounded-lg
          text-content/35 hover:text-content hover:bg-contrast/8 cursor-pointer transition-colors"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-4 pr-10">
        <span className="grid place-items-center w-11 h-11 rounded-xl text-gold bg-gold/15 border border-gold/30 shrink-0">
          <Icon size={22} />
        </span>
        <div className="min-w-0">
          <div className="text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-gold/80">
            {t('startHere.eyebrow')}
          </div>
          <h2
            className="mt-1.5 text-lg md:text-xl font-bold tracking-tight leading-snug"
            data-testid="start-here-headline"
          >
            {recommendationHeadline(placement)}
          </h2>
          <p
            className="mt-2 text-[0.95rem] text-content/65 leading-relaxed max-w-[62ch]"
            data-testid="start-here-reason"
          >
            {recommendationReason(placement)}
          </p>
          <p className="mt-2 text-sm text-content/45 leading-relaxed max-w-[62ch]">{move.detail}</p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => put(() => setMode(move.mode))}
              data-testid="start-here-go"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold
                bg-gradient-to-br from-gold-bright to-gold text-casino-bg cursor-pointer"
            >
              {move.action} <ArrowRight size={16} />
            </button>

            {/*
              The third option from the brief, offered to everyone rather than
              picked for them: some people want the drill, some want to know
              what all the other screens are for first, and that preference has
              nothing to do with how much blackjack they know.
            */}
            <button
              onClick={() => put(onTour)}
              data-testid="start-here-tour"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-3 font-semibold
                border border-contrast/15 bg-contrast/[.03] text-content/80
                hover:border-gold/40 hover:text-content cursor-pointer transition-colors"
            >
              <Compass size={16} /> {t('startHere.showAround')}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
