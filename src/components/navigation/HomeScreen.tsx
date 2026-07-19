import {
  Zap, GraduationCap, Coins, Layers, Wallet, Club,
  ClipboardList, BarChart3, Grid3x3, Trophy, BookOpen, ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import type { AppMode } from '../../store/app-store'
import { useAchievementStore } from '../../store/achievement-store'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import { DailyChallengeCard } from './DailyChallengeCard'
import { WeeklyChallengeCard } from './WeeklyChallengeCard'
import { DashboardHeader } from './DashboardHeader'

interface FeatureCard {
  mode: AppMode
  icon: LucideIcon
  title: string
  description: string
}

const TRAINING_CARDS: FeatureCard[] = [
  { mode: 'speedDrill', icon: Zap, title: 'Speed Drill', description: 'Train your counting speed with flashing cards' },
  { mode: 'deviationTraining', icon: GraduationCap, title: 'Flashcards', description: 'Drill every hand — and when to deviate' },
  { mode: 'betSpread', icon: Coins, title: 'Bet Spread', description: 'Practice optimal bet sizing by True Count' },
  { mode: 'deckEstimation', icon: Layers, title: 'Deck Estimation', description: 'Estimate remaining decks from the shoe' },
  { mode: 'bankrollSim', icon: Wallet, title: 'Bankroll Tracker', description: 'Track your real casino results' },
]

const TOOL_CARDS: FeatureCard[] = [
  { mode: 'learn', icon: BookOpen, title: 'Learn', description: 'How card counting works — for beginners' },
  { mode: 'analytics', icon: BarChart3, title: 'Analytics', description: 'View your training stats, trends, and progress' },
  { mode: 'strategyChart', icon: Grid3x3, title: 'Basic Strategy Chart', description: 'View the complete strategy table' },
  { mode: 'achievements', icon: Trophy, title: 'Achievements', description: 'Track your progress and unlock rewards' },
]

/**
 * Home screen — the signed-in dashboard: your progress, your challenges, and
 * the way back into every training mode. The marketing pitch lives on the
 * public landing page; a returning user gets their own numbers instead.
 * The app focuses on the Hi-Lo system; navigation lives in the global NavBar.
 */
export function HomeScreen() {
  const setMode = useAppStore(s => s.setMode)
  const totalUnlocked = useAchievementStore(s => s.totalUnlocked)

  return (
    <div className="relative min-h-full flex flex-col items-center px-4 pb-4">
      <div className="hero-glow" />

      <DashboardHeader />

      {/* Challenges */}
      <section className="relative z-10 w-full max-w-5xl mb-10 space-y-3">
        <DailyChallengeCard />
        <WeeklyChallengeCard />
      </section>

      {/* Training modes */}
      <section className="relative z-10 w-full max-w-5xl mb-10">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-4 px-1">Training Modes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TRAINING_CARDS.map(({ mode, icon: Icon, title, description }) => (
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
              <h3 className="text-base font-semibold text-content mb-1">{title}</h3>
              <p className="text-sm text-content/50 leading-snug">{description}</p>
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
        <h2 className="text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-4 px-1">Tools & Progress</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TOOL_CARDS.map(({ mode, icon: Icon, title, description }) => (
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
                  {title}
                  {mode === 'achievements' && (
                    <span className="ml-1.5 text-xs font-normal text-content/45">
                      ({totalUnlocked}/{ALL_ACHIEVEMENTS.length})
                    </span>
                  )}
                </h3>
                <p className="text-xs text-content/50 mt-0.5 leading-snug">{description}</p>
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
