import { useAppStore } from '../../store/app-store'
import type { AppMode } from '../../store/app-store'
import { useAchievementStore } from '../../store/achievement-store'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import { CountingSystemId } from '../../engine/counting/types'
import { getAllSystems } from '../../engine/counting/counting-systems'
import { CursorSpotlight, GlowTitle } from './GlowEffects'
import { DailyChallengeCard } from './DailyChallengeCard'
import { WeeklyChallengeCard } from './WeeklyChallengeCard'
import { LevelBadge } from './LevelBadge'

const TRAINING_CARDS: { mode: AppMode; icon: string; title: string; description: string }[] = [
  {
    mode: 'speedDrill',
    icon: '\u26A1',
    title: 'Speed Drill',
    description: 'Train your counting speed with flashing cards',
  },
  {
    mode: 'tableCounting',
    icon: '\uD83C\uDFB0',
    title: 'Table Counting',
    description: 'Play blackjack while keeping the count',
  },
  {
    mode: 'deviationTraining',
    icon: '\uD83C\uDFAF',
    title: 'Deviation Training',
    description: 'Master the Illustrious 18 & Fab 4',
  },
  {
    mode: 'betSpread',
    icon: '\uD83D\uDCB0',
    title: 'Bet Spread',
    description: 'Practice optimal bet sizing by True Count',
  },
  {
    mode: 'deckEstimation',
    icon: '\uD83D\uDC41',
    title: 'Deck Estimation',
    description: 'Estimate remaining decks from the shoe',
  },
  {
    mode: 'bankrollSim',
    icon: '\uD83D\uDCB0',
    title: 'Bankroll Tracker',
    description: 'Track your real casino results',
  },
]

const systems = getAllSystems()

/**
 * Home screen with training mode selection cards and counting system picker.
 */
export function HomeScreen() {
  const setMode = useAppStore(s => s.setMode)
  const selectedSystem = useAppStore(s => s.selectedSystem)
  const setSystem = useAppStore(s => s.setSystem)
  const totalUnlocked = useAchievementStore(s => s.totalUnlocked)
  return (
    <div className="min-h-screen bg-casino-bg flex flex-col items-center px-4 py-8 md:py-16">
      {/* Title */}
      <GlowTitle>Blackjack Card Counting Trainer</GlowTitle>
      <div className="flex justify-center mb-4">
        <LevelBadge />
      </div>
      <p className="text-content/50 text-sm md:text-base text-center mb-6 max-w-lg">
        Master card counting with 6 training modes, 6 counting systems, and realistic shoe simulation.
      </p>

      {/* Daily & Weekly Challenges */}
      <div className="w-full max-w-4xl mb-6 px-6 space-y-3">
        <DailyChallengeCard />
        <WeeklyChallengeCard />
      </div>

      {/* Training Mode Cards */}
      <div className="w-full max-w-4xl mb-12" style={{ position: 'relative', overflow: 'hidden', borderRadius: '20px', padding: '24px' }}>
        <CursorSpotlight />
        {/* 6 Training Mode Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {TRAINING_CARDS.map(({ mode, icon, title, description }) => (
            <button
              key={mode}
              onClick={() => setMode(mode)}
              data-testid={`mode-card-${mode}`}
              className="mode-card group relative flex flex-col items-start p-5 rounded-xl
                bg-contrast/5 border border-contrast/10
                hover:border-gold/60 hover:bg-contrast/8
                transition-all duration-200 text-left cursor-pointer"
            >
              {/* Gold accent top bar */}
              <div className="absolute top-0 left-4 right-4 h-0.5 bg-gold/40 group-hover:bg-gold rounded-full transition-colors" />

              <span className="text-3xl mb-3">{icon}</span>
              <h2 className="text-lg font-semibold text-content mb-1">{title}</h2>
              <p className="text-sm text-content/50">{description}</p>
            </button>
          ))}
        </div>

        {/* Casino Session – highlighted in its own row */}
        <button
          onClick={() => setMode('casinoSession')}
          data-testid="mode-card-casinoSession"
          className="mode-card group relative flex items-center gap-4 w-full p-5 rounded-xl
            bg-gradient-to-r from-gold/10 to-transparent border border-gold/30
            hover:border-gold/60 hover:from-gold/15
            transition-all duration-200 text-left cursor-pointer"
        >
          <span className="text-3xl">{'\uD83C\uDFB0'}</span>
          <div>
            <h2 className="text-lg font-semibold text-gold">Casino Session</h2>
            <p className="text-sm text-content/50">Play a full session at a realistic table</p>
          </div>
        </button>

        {/* Casino Session Tracker */}
        <button
          onClick={() => setMode('casinoSessionTracker')}
          data-testid="mode-card-casinoSessionTracker"
          className="mode-card group relative flex items-center gap-4 w-full p-5 rounded-xl mt-3
            bg-contrast/5 border border-contrast/10
            hover:border-gold/60 hover:bg-contrast/8
            transition-all duration-200 text-left cursor-pointer"
        >
          <span className="text-3xl">{'\uD83C\uDFB0'}</span>
          <div>
            <h2 className="text-lg font-semibold text-content">Casino Session Tracker</h2>
            <p className="text-sm text-content/50">Track your training session results</p>
          </div>
        </button>
      </div>

      {/* Analytics & Achievements */}
      <div className="w-full max-w-4xl mb-12" style={{ position: 'relative', overflow: 'hidden', borderRadius: '20px', padding: '24px' }}>
        <CursorSpotlight />
        <button
          onClick={() => setMode('analytics')}
          data-testid="analytics-button"
          className="mode-card group w-full flex items-center gap-4 p-4 rounded-xl
            bg-contrast/5 border border-gold/30
            hover:border-gold/60 hover:bg-contrast/8
            transition-all duration-200 text-left cursor-pointer"
        >
          <span className="text-2xl">{'\uD83D\uDCCA'}</span>
          <div>
            <h2 className="text-base font-semibold text-gold">Analytics</h2>
            <p className="text-sm text-content/50">View your training stats, trends, and progress</p>
          </div>
        </button>

        <button
          onClick={() => setMode('strategyChart')}
          data-testid="strategy-chart-button"
          className="mode-card group w-full flex items-center gap-4 p-4 rounded-xl mt-3
            bg-contrast/5 border border-gold/30
            hover:border-gold/60 hover:bg-contrast/8
            transition-all duration-200 text-left cursor-pointer"
        >
          <span className="text-2xl">{'\uD83D\uDCCB'}</span>
          <div>
            <h2 className="text-base font-semibold text-gold">Basic Strategy Chart</h2>
            <p className="text-sm text-content/50">View the complete strategy table</p>
          </div>
        </button>

        <button
          onClick={() => setMode('achievements')}
          data-testid="achievements-button"
          className="mode-card group w-full flex items-center gap-4 p-4 rounded-xl mt-3
            bg-contrast/5 border border-gold/30
            hover:border-gold/60 hover:bg-contrast/8
            transition-all duration-200 text-left cursor-pointer"
        >
          <span className="text-2xl">{'\uD83C\uDFC6'}</span>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gold">
              Achievements
              <span className="ml-2 text-sm font-normal text-content/50">
                ({totalUnlocked}/{ALL_ACHIEVEMENTS.length})
              </span>
            </h2>
            <p className="text-sm text-content/50">Track your progress and unlock rewards</p>
          </div>
        </button>
      </div>

      {/* System Selector */}
      <div className="flex items-center gap-3">
        <label htmlFor="system-select" className="text-sm text-content/60">
          Counting System:
        </label>
        <select
          id="system-select"
          value={selectedSystem}
          onChange={(e) => setSystem(e.target.value as CountingSystemId)}
          className="bg-contrast/10 border border-contrast/20 rounded-lg px-3 py-2 text-sm text-content
            focus:outline-none focus:border-gold/60 cursor-pointer"
        >
          {systems.map((s) => (
            <option key={s.id} value={s.id} className="bg-select-bg">
              {s.name} (Level {s.level})
            </option>
          ))}
        </select>
      </div>

    </div>
  )
}
