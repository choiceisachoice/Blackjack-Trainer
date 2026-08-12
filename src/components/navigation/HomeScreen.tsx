import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Zap, GraduationCap, Coins, Layers, Wallet, Club,
  ClipboardList, BarChart3, Grid3x3, Trophy, BookOpen, ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import type { AppMode } from '../../store/app-store'
import { useAchievementStore } from '../../store/achievement-store'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import { TrainingPlan } from '../plan/TrainingPlan'
import { StartHere } from '../onboarding/StartHere'
import { GuidedTour } from '../onboarding/GuidedTour'
import { DailyChallengeCard } from './DailyChallengeCard'
import { WeeklyChallengeCard } from './WeeklyChallengeCard'
import { DashboardHeader, ProductTitle } from './DashboardHeader'

interface FeatureCard {
  mode: AppMode
  icon: LucideIcon
  titleKey: string
  descKey: string
}

// The names come from the shared `modes` namespace, not from here: the home
// screen, the nav bar, the analytics header and the Learn guide all label the
// same screens, and they used to hold four separate copies of those words.
const TRAINING_CARDS: FeatureCard[] = [
  { mode: 'speedDrill', icon: Zap, titleKey: 'modes.speedDrill', descKey: 'home.desc.speedDrill' },
  { mode: 'deviationTraining', icon: GraduationCap, titleKey: 'modes.deviationFlashCards', descKey: 'home.desc.deviationTraining' },
  { mode: 'betSpread', icon: Coins, titleKey: 'modes.betSpread', descKey: 'home.desc.betSpread' },
  { mode: 'deckEstimation', icon: Layers, titleKey: 'modes.deckEstimation', descKey: 'home.desc.deckEstimation' },
  { mode: 'bankrollSim', icon: Wallet, titleKey: 'modes.bankrollTracker', descKey: 'home.desc.bankrollSim' },
]

const TOOL_CARDS: FeatureCard[] = [
  { mode: 'learn', icon: BookOpen, titleKey: 'modes.learn', descKey: 'home.desc.learn' },
  { mode: 'analytics', icon: BarChart3, titleKey: 'modes.analytics', descKey: 'home.desc.analytics' },
  { mode: 'strategyChart', icon: Grid3x3, titleKey: 'modes.strategyChart', descKey: 'home.desc.strategyChart' },
  { mode: 'achievements', icon: Trophy, titleKey: 'modes.achievements', descKey: 'home.desc.achievements' },
]

/**
 * Home screen — the signed-in dashboard: your progress, your challenges, and
 * the way back into every training mode. The marketing pitch lives on the
 * public landing page; a returning user gets their own numbers instead.
 * The app focuses on the Hi-Lo system; navigation lives in the global NavBar.
 */
export function HomeScreen() {
  // The tour is owned here rather than by the card that launches it: it points
  // at things all over this screen, and it has to outlive the card — taking the
  // suggestion puts the card away, and a tour unmounted by its own trigger
  // would close on its first frame.
  const [touring, setTouring] = useState(false)

  // No `min-h-full` here: that asked for a second full viewport on top of the
  // 62px header and produced a scrollbar on every visit (see TrainerApp). The
  // shell now hands down the remaining height; this only has to fill it.
  return (
    <div className="relative w-full flex flex-col items-center px-4 pb-4">
      <div className="hero-glow" />

      {touring && <GuidedTour onClose={() => setTouring(false)} />}

      {/*
        The plan is the home screen now, and it owns what surrounds it.

        Before this, three things competed to answer "what do I do?" — eight
        equal-weight mode tiles, two challenge cards and an onboarding checklist.
        Now there is one answer, and browsing lives underneath it.

        The `before`/`after` slots render only once the plan itself is showing:
        a brand-new account gets the welcome and the questionnaire on a clean
        screen, with no mode grid underneath to shrug at. That decision lives
        inside TrainingPlan because that is where the state lives.
      */}
      <TrainingPlan
        embedded
        before={
          <>
            <ProductTitle />
            {/* Sits above the plan because it answers a question the plan
                assumes you already have: not "what is my next stage" but
                "what do I do with any of this". It removes itself once
                acted on, so a returning user never sees it. */}
            <StartHere onTour={() => setTouring(true)} />
          </>
        }
        after={<HomeSections />}
      />
    </div>
  )
}

/** Everything below the plan: the daily loop, then the browsable modes. */
function HomeSections() {
  const { t } = useTranslation()
  const setMode = useAppStore(s => s.setMode)
  const totalUnlocked = useAchievementStore(s => s.totalUnlocked)

  return (
    <div className="relative z-10 w-full flex flex-col items-center mt-12">
      {/* Your numbers, below the answer. "How am I doing" is a real question,
          but it is not the one someone opens the app with. */}
      <DashboardHeader />

      {/* Challenges sit under the plan, not above it: they are today's nudge,
          not the destination. */}
      <section className="relative z-10 w-full max-w-5xl mb-10 space-y-3">
        <DailyChallengeCard />
        <WeeklyChallengeCard />
      </section>

      {/* Training modes */}
      <section className="relative z-10 w-full max-w-5xl mb-10">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-4 px-1">{t('home.trainingModes')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TRAINING_CARDS.map(({ mode, icon: Icon, titleKey, descKey }) => (
            <button
              key={mode}
              onClick={() => setMode(mode)}
              data-testid={`mode-card-${mode}`}
              className="surface lift-glow group relative flex flex-col items-start p-5 text-left cursor-pointer overflow-hidden"
            >
              <span className="grid place-items-center w-11 h-11 rounded-xl mb-4 text-gold
                bg-gold/10 border border-gold/20 transition-all duration-200
                group-hover:bg-gold/15 group-hover:border-gold/40">
                <Icon size={22} />
              </span>
              <h3 className="text-base font-semibold text-content mb-1">{t(titleKey)}</h3>
              <p className="text-sm text-content/50 leading-snug">{t(descKey)}</p>
              <ArrowRight
                size={16}
                className="absolute top-5 right-5 text-content/20 -translate-x-1 opacity-0
                  transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-gold"
              />
            </button>
          ))}
        </div>
      </section>

      {/* Casino Session — hero feature */}
      <section className="relative z-10 w-full max-w-5xl mb-10 space-y-3">
        <button
          onClick={() => setMode('casinoSession')}
          data-testid="mode-card-casinoSession"
          className="lift-glow group relative flex items-center gap-4 w-full p-5 rounded-2xl text-left cursor-pointer
            border border-gold/30 overflow-hidden
            bg-[linear-gradient(110deg,color-mix(in_srgb,var(--color-gold)_12%,var(--color-surface)),var(--color-surface))]"
        >
          <span className="grid place-items-center w-12 h-12 rounded-xl text-gold bg-gold/15 border border-gold/30 shrink-0">
            <Club size={24} className="fill-current" />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gold">Casino Session</h3>
            <p className="text-sm text-content/55">Play a full multi-seat session at a realistic table</p>
          </div>
          <ArrowRight size={18} className="ml-auto text-gold/60 group-hover:translate-x-1 transition-transform" />
        </button>

        <button
          onClick={() => setMode('casinoSessionTracker')}
          data-testid="mode-card-casinoSessionTracker"
          className="surface lift-glow group flex items-center gap-4 w-full p-5 text-left cursor-pointer"
        >
          <span className="grid place-items-center w-11 h-11 rounded-xl text-content/70 bg-contrast/5 border border-contrast/10 shrink-0">
            <ClipboardList size={22} />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-content">Casino Session Tracker</h3>
            <p className="text-sm text-content/50">Track your training session results</p>
          </div>
        </button>
      </section>

      {/* Tools */}
      <section className="relative z-10 w-full max-w-5xl mb-12">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-4 px-1">{t('home.toolsProgress')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TOOL_CARDS.map(({ mode, icon: Icon, titleKey, descKey }) => (
            <button
              key={mode}
              onClick={() => setMode(mode)}
              data-testid={mode === 'learn' ? 'learn-button' : mode === 'analytics' ? 'analytics-button' : mode === 'strategyChart' ? 'strategy-chart-button' : 'achievements-button'}
              className="surface lift-glow group flex items-start gap-3 p-4 text-left cursor-pointer"
            >
              <span className="grid place-items-center w-10 h-10 rounded-lg text-gold bg-gold/10 border border-gold/20 shrink-0
                transition-all duration-200 group-hover:bg-gold/15">
                <Icon size={19} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-content">
                  {t(titleKey)}
                  {mode === 'achievements' && (
                    <span className="ml-1.5 text-xs font-normal text-content/45">
                      ({totalUnlocked}/{ALL_ACHIEVEMENTS.length})
                    </span>
                  )}
                </h3>
                <p className="text-xs text-content/50 mt-0.5 leading-snug">{t(descKey)}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Scroll-end breathing room. A real box is used (not padding/margin),
          because browsers exclude a scroll container's trailing padding and the
          last child's bottom margin from the scrollable overflow area. */}
      <div aria-hidden className="w-full h-20 md:h-24 shrink-0" />
    </div>
  )
}
