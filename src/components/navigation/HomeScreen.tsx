import { useAppStore } from '../../store/app-store'
import type { AppMode } from '../../store/app-store'
import { useAchievementStore } from '../../store/achievement-store'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import { CountingSystemId } from '../../engine/counting/types'
import { getAllSystems } from '../../engine/counting/counting-systems'

const MODE_CARDS: { mode: AppMode; icon: string; title: string; description: string }[] = [
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
    title: 'Bankroll Simulator',
    description: 'Simulate your edge, risk & hourly win',
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
      <h1 className="text-3xl md:text-5xl font-bold text-gold text-center mb-2">
        Blackjack Card Counting Trainer
      </h1>
      <p className="text-content/50 text-sm md:text-base text-center mb-10 max-w-lg">
        Master card counting with 6 training modes, 6 counting systems, and realistic shoe simulation.
      </p>

      {/* Mode Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 w-full max-w-4xl mb-12">
        {MODE_CARDS.map(({ mode, icon, title, description }) => (
          <button
            key={mode}
            onClick={() => setMode(mode)}
            data-testid={`mode-card-${mode}`}
            className="group relative flex flex-col items-start p-5 rounded-xl
              bg-contrast/5 border border-contrast/10
              hover:border-gold/60 hover:bg-contrast/8 hover:-translate-y-0.5
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

      {/* Analytics & Achievements Buttons */}
      <div className="w-full max-w-4xl space-y-3 mb-12">
        <button
          onClick={() => setMode('analytics')}
          data-testid="analytics-button"
          className="group w-full flex items-center gap-4 p-4 rounded-xl
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
          onClick={() => setMode('achievements')}
          data-testid="achievements-button"
          className="group w-full flex items-center gap-4 p-4 rounded-xl
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
