import { useEffect, useState } from 'react'
import { useAchievementStore } from '../../store/achievement-store'
import { useStatsStore } from '../../store/stats-store'
import { achievementEngine } from '../../services/achievements/achievement-engine'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import type { Achievement, AchievementCategory, AchievementTier } from '../../services/achievements/achievement-types'

/** Filter options for the gallery. */
type FilterMode = 'all' | 'unlocked' | 'locked'

/** Category display config. */
const CATEGORY_DISPLAY: Record<AchievementCategory, { label: string; icon: string }> = {
  getting_started: { label: 'Getting Started', icon: '\uD83C\uDFB0' },
  dedication:      { label: 'Dedication',      icon: '\uD83D\uDD25' },
  mastery:         { label: 'Mastery',          icon: '\u2705' },
  speed:           { label: 'Speed',            icon: '\u26A1' },
  counting:        { label: 'Counting',         icon: '\uD83D\uDD22' },
  deviations:      { label: 'Deviations',       icon: '\uD83D\uDCCB' },
  simulation:      { label: 'Bet Spread, Estimation & Simulation', icon: '\uD83C\uDFE6' },
  ultimate:        { label: 'Ultimate',         icon: '\uD83C\uDFC6' },
}

/** Ordered categories for display. */
const CATEGORY_ORDER: AchievementCategory[] = [
  'getting_started', 'dedication', 'mastery', 'speed',
  'counting', 'deviations', 'simulation', 'ultimate',
]

/** Tier border/accent colors. */
const TIER_COLORS: Record<AchievementTier, { border: string; text: string; bg: string }> = {
  bronze:  { border: 'border-[#CD7F32]/60', text: 'text-[#CD7F32]', bg: 'bg-[#CD7F32]/10' },
  silver:  { border: 'border-[#C0C0C0]/60', text: 'text-[#C0C0C0]', bg: 'bg-[#C0C0C0]/10' },
  gold:    { border: 'border-[#FFD700]/60', text: 'text-[#FFD700]', bg: 'bg-[#FFD700]/10' },
  diamond: { border: 'border-[#B9F2FF]/60', text: 'text-[#B9F2FF]', bg: 'bg-[#B9F2FF]/10' },
}

const TIER_BADGE: Record<AchievementTier, string> = {
  bronze: '\uD83E\uDD49',
  silver: '\uD83E\uDD48',
  gold: '\uD83E\uDD47',
  diamond: '\uD83D\uDC8E',
}

/** Format a timestamp to a readable date. */
function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Achievements gallery page displaying all 30 achievements.
 *
 * Shows unlock status, progress bars for locked achievements,
 * and category-grouped sections with filter options.
 */
export function AchievementsPage() {
  const unlockedIds = useAchievementStore(s => s.unlockedIds)
  const totalUnlocked = useAchievementStore(s => s.totalUnlocked)
  const sessions = useStatsStore(s => s.sessions)
  const lifetimeStats = useStatsStore(s => s.lifetimeStats)
  const loadStats = useStatsStore(s => s.loadStats)
  const getTrainingStreak = useStatsStore(s => s.getTrainingStreak)

  const [filter, setFilter] = useState<FilterMode>('all')

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const dayStreak = getTrainingStreak()
  const stats = lifetimeStats ?? {
    totalSessions: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    totalPracticeSeconds: 0,
    overallAccuracy: 0,
    bestStreak: 0,
    byMode: {},
    dailyStats: [],
  }

  // Get unlock timestamps
  const unlockedMap = new Map(
    achievementEngine.getUnlocked().map(u => [u.achievementId, u.unlockedAt])
  )

  // Filter achievements
  const filteredAchievements = ALL_ACHIEVEMENTS.filter(a => {
    if (filter === 'unlocked') return unlockedIds.includes(a.id)
    if (filter === 'locked') return !unlockedIds.includes(a.id)
    return true
  })

  // Group by category
  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    achievements: filteredAchievements.filter(a => a.category === cat),
  })).filter(g => g.achievements.length > 0)

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" data-testid="achievements-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Achievements</h2>
          <p className="text-sm text-white/50" data-testid="unlock-count">
            {totalUnlocked}/{ALL_ACHIEVEMENTS.length} unlocked
          </p>
        </div>

        {/* Progress ring */}
        <div className="relative w-14 h-14">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
            <circle
              cx="28" cy="28" r="24"
              fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4"
            />
            <circle
              cx="28" cy="28" r="24"
              fill="none" stroke="#FFD700" strokeWidth="4"
              strokeDasharray={`${(totalUnlocked / ALL_ACHIEVEMENTS.length) * 150.8} 150.8`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
            {Math.round((totalUnlocked / ALL_ACHIEVEMENTS.length) * 100)}%
          </span>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2">
        {(['all', 'unlocked', 'locked'] as FilterMode[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            data-testid={`filter-${f}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
              ${filter === f
                ? 'bg-gold/20 text-gold border border-gold/40'
                : 'bg-white/5 text-white/50 border border-white/10 hover:text-white/70'
              }`}
          >
            {f === 'all' ? 'All' : f === 'unlocked' ? 'Unlocked' : 'Locked'}
          </button>
        ))}
      </div>

      {/* Category sections */}
      {grouped.map(({ category, achievements }) => (
        <section key={category}>
          <h3 className="text-sm font-semibold text-white/70 mb-3 flex items-center gap-2">
            <span>{CATEGORY_DISPLAY[category].icon}</span>
            <span>{CATEGORY_DISPLAY[category].label}</span>
            <span className="text-white/30">({achievements.length})</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {achievements.map(achievement => (
              <AchievementCard
                key={achievement.id}
                achievement={achievement}
                isUnlocked={unlockedIds.includes(achievement.id)}
                unlockedAt={unlockedMap.get(achievement.id)}
                progress={achievementEngine.getProgress(
                  achievement, stats, dayStreak, sessions,
                )}
              />
            ))}
          </div>
        </section>
      ))}

      {filteredAchievements.length === 0 && (
        <div className="text-center py-12">
          <p className="text-white/40">
            {filter === 'unlocked' ? 'No achievements unlocked yet' : 'All achievements unlocked!'}
          </p>
        </div>
      )}
    </div>
  )
}

/** Single achievement card. */
function AchievementCard({
  achievement,
  isUnlocked,
  unlockedAt,
  progress,
}: {
  achievement: Achievement
  isUnlocked: boolean
  unlockedAt?: number
  progress: number
}) {
  const tier = TIER_COLORS[achievement.tier]

  return (
    <div
      data-testid={`achievement-card-${achievement.id}`}
      className={`
        relative rounded-xl p-4 border transition-all
        ${isUnlocked
          ? `${tier.bg} ${tier.border} shadow-sm`
          : 'bg-white/3 border-white/10 opacity-70'
        }
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-2xl ${isUnlocked ? '' : 'grayscale opacity-50'}`}>
            {achievement.icon}
          </span>
          <div>
            <p className={`text-sm font-semibold ${isUnlocked ? 'text-white' : 'text-white/60'}`}>
              {achievement.name}
            </p>
          </div>
        </div>
        <span className="text-lg" title={achievement.tier}>
          {TIER_BADGE[achievement.tier]}
        </span>
      </div>

      <p className={`text-xs mb-3 ${isUnlocked ? 'text-white/60' : 'text-white/40'}`}>
        {achievement.description}
      </p>

      {isUnlocked ? (
        <p className={`text-xs ${tier.text}`} data-testid={`unlocked-date-${achievement.id}`}>
          Unlocked: {unlockedAt ? formatDate(unlockedAt) : 'Unknown'}
        </p>
      ) : (
        <div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-white/30 transition-all duration-500"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                data-testid={`progress-bar-${achievement.id}`}
              />
            </div>
            <span className="text-xs text-white/40 w-8 text-right">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
