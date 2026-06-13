import { useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useStatsStore } from '../../store/stats-store'
import type { TrendDirection } from '../../store/stats-store'
import { useAchievementStore } from '../../store/achievement-store'
import { useAppStore } from '../../store/app-store'
import { achievementEngine } from '../../services/achievements/achievement-engine'
import { getAchievementById } from '../../services/achievements/achievement-list'
import type { TrainingMode, TrainingSessionResult, ModeStats } from '../../services/stats-types'

/** Display config per training mode. */
const MODE_DISPLAY: Record<TrainingMode, { label: string; icon: string; color: string }> = {
  speedDrill:          { label: 'Speed Drill',        icon: '\u26A1', color: '#f59e0b' },
  tableCounting:       { label: 'Table Counting',     icon: '\uD83C\uDFB0', color: '#22c55e' },
  deviationFlashCards: { label: 'Deviation Flash Cards', icon: '\uD83C\uDFAF', color: '#3b82f6' },
  deviationAtTable:    { label: 'Deviation At Table',  icon: '\uD83C\uDFAF', color: '#8b5cf6' },
  betSpread:           { label: 'Bet Spread',          icon: '\uD83D\uDCB0', color: '#ef4444' },
  deckEstimation:      { label: 'Deck Estimation',     icon: '\uD83D\uDC41', color: '#06b6d4' },
  casinoSession:       { label: 'Casino Session',      icon: '\uD83C\uDFB0', color: '#d946ef' },
}

const ALL_MODES: TrainingMode[] = [
  'speedDrill', 'tableCounting', 'deviationFlashCards',
  'deviationAtTable', 'betSpread', 'deckEstimation',
  'casinoSession',
]

/** Format seconds into a human-readable duration. */
function formatDuration(seconds: number): string {
  if (seconds < 60) return '< 1m'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

/** Format ISO timestamp to relative time. */
function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

/** Trend arrow icon. */
function trendArrow(trend: TrendDirection): string {
  if (trend === 'improving') return '\u2191'
  if (trend === 'declining') return '\u2193'
  return '\u2192'
}

/** Color for trend. */
function trendColor(trend: TrendDirection): string {
  if (trend === 'improving') return 'text-green-400'
  if (trend === 'declining') return 'text-red-400'
  return 'text-content/50'
}

/** Color for accuracy value. */
function accuracyColor(accuracy: number): string {
  if (accuracy >= 0.8) return 'text-green-400'
  if (accuracy >= 0.6) return 'text-yellow-400'
  return 'text-red-400'
}

/** Streak motivation text based on consecutive day count. */
export function getStreakMotivation(streak: number): string {
  if (streak === 0) return 'Start your streak today!'
  if (streak <= 2) return 'Keep it going! \uD83D\uDD25'
  if (streak <= 6) return "You're on fire! \uD83D\uDD25\uD83D\uDD25"
  if (streak <= 13) return 'One week strong! \uD83D\uDD25\uD83D\uDD25\uD83D\uDD25'
  return 'Unstoppable! \uD83D\uDD25\uD83D\uDD25\uD83D\uDD25\uD83D\uDD25'
}

/**
 * Build chart data: per-session accuracy with smart x-axis labels.
 *
 * Uses time (HH:MM) when all sessions are on the same day,
 * date (Mon DD) when sessions span multiple days.
 */
export function buildChartData(sessions: TrainingSessionResult[]) {
  const chronological = [...sessions].reverse()
  const dates = new Set(chronological.map(s => s.timestamp.slice(0, 10)))
  const sameDay = dates.size <= 1

  return chronological.map((s, i) => {
    const d = new Date(s.timestamp)
    const date = sameDay
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return {
      label: `#${i + 1}`,
      date,
      [s.mode]: Math.round(s.accuracy * 100),
    }
  })
}

/** Compute quick insight stats across all modes. */
export function computeQuickStats(byMode: Partial<Record<TrainingMode, ModeStats>>) {
  const entries = Object.entries(byMode) as [TrainingMode, ModeStats][]
  const played = entries.filter(([, s]) => s.totalSessions > 0)
  if (played.length < 2) return null

  const best = played.reduce((a, b) => a[1].accuracy > b[1].accuracy ? a : b)
  const worst = played.reduce((a, b) => a[1].accuracy < b[1].accuracy ? a : b)
  const mostPracticed = played.reduce((a, b) => a[1].totalSessions > b[1].totalSessions ? a : b)

  return {
    best: { mode: best[0] as TrainingMode, accuracy: best[1].accuracy },
    worst: { mode: worst[0] as TrainingMode, accuracy: worst[1].accuracy },
    mostPracticed: { mode: mostPracticed[0] as TrainingMode, sessions: mostPracticed[1].totalSessions },
  }
}

/** Performance-based glow for stat cards. */
function getPerformanceGlow(value: number | null): React.CSSProperties {
  if (value === null || value === undefined) {
    return {
      border: '1px solid rgba(255, 255, 255, 0.08)',
      boxShadow: '0 0 10px rgba(255, 255, 255, 0.03)',
    }
  }
  if (value >= 90) {
    return {
      border: '1px solid rgba(255, 215, 0, 0.4)',
      boxShadow: '0 0 15px rgba(255, 215, 0, 0.15), inset 0 0 10px rgba(255, 215, 0, 0.03)',
    }
  }
  if (value >= 70) {
    return {
      border: '1px solid rgba(34, 197, 94, 0.4)',
      boxShadow: '0 0 15px rgba(34, 197, 94, 0.15), inset 0 0 10px rgba(34, 197, 94, 0.03)',
    }
  }
  if (value >= 50) {
    return {
      border: '1px solid rgba(234, 179, 8, 0.4)',
      boxShadow: '0 0 15px rgba(234, 179, 8, 0.15), inset 0 0 10px rgba(234, 179, 8, 0.03)',
    }
  }
  return {
    border: '1px solid rgba(239, 68, 68, 0.4)',
    boxShadow: '0 0 15px rgba(239, 68, 68, 0.15), inset 0 0 10px rgba(239, 68, 68, 0.03)',
  }
}

/**
 * Analytics dashboard displaying training statistics, trends, and session history.
 *
 * Loads data from the stats store on mount and renders overview cards,
 * accuracy trend chart, mode breakdown, weakest deviations, and session history.
 */
export function AnalyticsDashboard() {
  const sessions = useStatsStore(s => s.sessions)
  const lifetimeStats = useStatsStore(s => s.lifetimeStats)
  const isLoading = useStatsStore(s => s.isLoading)
  const loadStats = useStatsStore(s => s.loadStats)
  const getAccuracyTrend = useStatsStore(s => s.getAccuracyTrend)
  const getWeakestDeviations = useStatsStore(s => s.getWeakestDeviations)
  const getTrainingStreak = useStatsStore(s => s.getTrainingStreak)
  const resetAllStats = useStatsStore(s => s.resetAllStats)

  useEffect(() => {
    loadStats()
  }, [loadStats])

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-content/50">Loading stats...</p>
      </div>
    )
  }

  const streak = getTrainingStreak()
  const weakest = getWeakestDeviations(8)
  const overallTrend = getAccuracyTrend()
  const chartData = buildChartData(sessions)

  // Find which modes have data for chart legend
  const modesWithData = ALL_MODES.filter(m =>
    sessions.some(s => s.mode === m)
  )

  const quickStats = lifetimeStats ? computeQuickStats(lifetimeStats.byMode) : null

  const totalSessions = lifetimeStats?.totalSessions ?? 0
  const totalTime = lifetimeStats?.totalPracticeSeconds ?? 0
  const overallAccuracy = lifetimeStats?.overallAccuracy ?? 0
  const totalCorrect = lifetimeStats?.totalCorrect ?? 0
  const totalQuestions = lifetimeStats?.totalQuestions ?? 0

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" data-testid="analytics-dashboard">
      {/* Section 1: Overview Cards */}
      <section>
        <h2 className="text-lg font-semibold text-content mb-3">Overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {/* Total Sessions */}
          <div className="stat-card bg-contrast/5 rounded-xl p-4" style={getPerformanceGlow(null)}>
            <p className="text-2xl md:text-3xl font-bold text-content">{totalSessions}</p>
            <p className="text-xs text-content/50 mt-1">Total Sessions</p>
            <p className="text-xs text-content/30">across all modes</p>
          </div>

          {/* Training Time */}
          <div className="stat-card bg-contrast/5 rounded-xl p-4" style={getPerformanceGlow(null)}>
            <p className="text-2xl md:text-3xl font-bold text-content">{formatDuration(totalTime)}</p>
            <p className="text-xs text-content/50 mt-1">Training Time</p>
            <p className="text-xs text-content/30">total time trained</p>
          </div>

          {/* Overall Accuracy */}
          <div
            className="stat-card bg-contrast/5 rounded-xl p-4"
            style={getPerformanceGlow(totalSessions > 0 ? Math.round(overallAccuracy * 100) : null)}
          >
            <p className={`text-2xl md:text-3xl font-bold ${totalSessions > 0 ? accuracyColor(overallAccuracy) : 'text-content/30'}`}>
              {totalSessions > 0 ? `${Math.round(overallAccuracy * 100)}%` : '--'}
            </p>
            <p className="text-xs text-content/50 mt-1">Overall Accuracy</p>
            <p className="text-xs text-content/30">{totalCorrect}/{totalQuestions}</p>
          </div>

          {/* Training Streak */}
          <div className="stat-card bg-contrast/5 rounded-xl p-4" style={getPerformanceGlow(null)}>
            <p className="text-2xl md:text-3xl font-bold text-content">
              {streak > 0 ? streak : '--'}
              {streak > 0 && <span className="ml-1 text-orange-400" data-testid="streak-fire">{'\uD83D\uDD25'}</span>}
            </p>
            <p className="text-xs text-content/50 mt-1">Day Streak</p>
            <p className="text-xs text-content/30" data-testid="streak-motivation">
              {getStreakMotivation(streak)}
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Accuracy Trend Chart */}
      <section>
        <h2 className="text-lg font-semibold text-content mb-3">
          Accuracy Trend
          <span className={`ml-2 text-sm ${trendColor(overallTrend)}`}>{trendArrow(overallTrend)}</span>
        </h2>
        {chartData.length >= 2 ? (
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#a3a3a3', fontSize: 12 }}
                  axisLine={{ stroke: 'rgba(128,128,128,0.2)' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#a3a3a3', fontSize: 12 }}
                  axisLine={{ stroke: 'rgba(128,128,128,0.2)' }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-tooltip-bg)',
                    border: '1px solid var(--color-tooltip-border)',
                    borderRadius: 8,
                    color: 'var(--color-content)',
                  }}
                  cursor={{ stroke: 'rgba(128,128,128,0.3)', strokeDasharray: '3 3' }}
                  formatter={(value: number, name: string) => [`${value}%`, name]}
                  labelFormatter={(_label: string, payload: Array<{ payload?: { date?: string } }>) => {
                    const date = payload?.[0]?.payload?.date
                    return date ? `Session: ${date}` : `Session: ${_label}`
                  }}
                />
                <Legend />
                {modesWithData.map(mode => (
                  <Line
                    key={mode}
                    type="monotone"
                    dataKey={mode}
                    name={MODE_DISPLAY[mode].label}
                    stroke={MODE_DISPLAY[mode].color}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 7 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-8 text-center">
            <p className="text-content/40" data-testid="chart-empty">Play more sessions to see trends</p>
          </div>
        )}
      </section>

      {/* Quick Stats Badges */}
      {quickStats && (
        <div className="flex flex-wrap gap-2" data-testid="quick-stats">
          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full text-xs text-green-400" data-testid="quick-best">
            Best Mode: {MODE_DISPLAY[quickStats.best.mode].label} ({Math.round(quickStats.best.accuracy * 100)}%)
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full text-xs text-red-400" data-testid="quick-worst">
            Needs Work: {MODE_DISPLAY[quickStats.worst.mode].label} ({Math.round(quickStats.worst.accuracy * 100)}%)
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full text-xs text-blue-400" data-testid="quick-most">
            Most Practiced: {MODE_DISPLAY[quickStats.mostPracticed.mode].label} ({quickStats.mostPracticed.sessions} sessions)
          </span>
        </div>
      )}

      {/* Recent Achievements */}
      <RecentAchievements />

      {/* Section 3: Mode Breakdown */}
      <section>
        <h2 className="text-lg font-semibold text-content mb-3">Mode Breakdown</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ALL_MODES.map(mode => {
            const display = MODE_DISPLAY[mode]
            const modeStats = lifetimeStats?.byMode[mode]
            const trend = getAccuracyTrend(mode)
            const lastSession = sessions.find(s => s.mode === mode)

            if (!modeStats || modeStats.totalSessions === 0) {
              return (
                <div key={mode} className="stat-card bg-contrast/5 rounded-xl p-4 opacity-50" style={getPerformanceGlow(null)}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{display.icon}</span>
                    <span className="text-sm font-medium text-content/60">{display.label}</span>
                  </div>
                  <p className="text-xs text-content/30">Not yet played</p>
                </div>
              )
            }

            const modeAccuracy = Math.round((lastSession?.accuracy ?? modeStats.accuracy) * 100)

            return (
              <div key={mode} className="stat-card bg-contrast/5 rounded-xl p-4" style={getPerformanceGlow(modeAccuracy)}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{display.icon}</span>
                  <span className="text-sm font-medium text-content">{display.label}</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-content/50">Sessions</span>
                    <span className="text-content">{modeStats.totalSessions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content/50">Accuracy</span>
                    <span className={accuracyColor(lastSession?.accuracy ?? modeStats.accuracy)}>
                      {modeAccuracy}%
                      <span className={`ml-1 ${trendColor(trend)}`}>{trendArrow(trend)}</span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content/50">Best</span>
                    <span className={accuracyColor(modeStats.bestAccuracy)} data-testid={`mode-best-${mode}`}>
                      {Math.round(modeStats.bestAccuracy * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content/50">Average</span>
                    <span className={accuracyColor(modeStats.accuracy)} data-testid={`mode-avg-${mode}`}>
                      {Math.round(modeStats.accuracy * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content/50">Best Streak</span>
                    <span className="text-content">{modeStats.bestStreak}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content/50">Last Played</span>
                    <span className="text-content/70">
                      {lastSession ? formatRelativeTime(lastSession.timestamp) : '--'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Section 4: Weakest Deviations */}
      <section>
        <h2 className="text-lg font-semibold text-content mb-3">Weakest Deviations</h2>
        {weakest.length > 0 ? (
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4 space-y-3">
            {weakest.map(({ name, accuracy }) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-sm text-content w-48 truncate">{name}</span>
                <div className="flex-1 h-2 bg-contrast/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${accuracy >= 0.8 ? 'bg-green-500' : accuracy >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.round(accuracy * 100)}%` }}
                  />
                </div>
                <span className={`text-sm font-medium text-right whitespace-nowrap ${accuracyColor(accuracy)}`}>
                  {Math.round(accuracy * 100)}% accuracy
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-8 text-center">
            <p className="text-content/40" data-testid="deviations-empty">Complete deviation training to see weak spots</p>
          </div>
        )}
      </section>

      {/* Section 5: Session History */}
      <section>
        <h2 className="text-lg font-semibold text-content mb-3">Recent Sessions</h2>
        {sessions.length > 0 ? (
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl divide-y divide-white/5">
            {sessions.slice(0, 20).map(session => {
              const display = MODE_DISPLAY[session.mode]
              return (
                <div key={session.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="text-lg">{display.icon}</span>
                  <span className="text-content flex-1 truncate">{display.label}</span>
                  <span className="text-content/40 text-xs">{formatRelativeTime(session.timestamp)}</span>
                  <span className={`font-medium w-12 text-right ${accuracyColor(session.accuracy)}`}>
                    {Math.round(session.accuracy * 100)}%
                  </span>
                  <span className="text-content/40 text-xs w-12 text-right">{formatDuration(session.durationSeconds)}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-8 text-center">
            <p className="text-content/40" data-testid="sessions-empty">No sessions recorded yet</p>
          </div>
        )}
      </section>

      {/* Section 6: Reset Data */}
      <section className="pb-8">
        <button
          onClick={() => {
            if (window.confirm('Are you sure you want to reset all training data? This cannot be undone.')) {
              resetAllStats()
            }
          }}
          className="text-sm text-red-400/60 hover:text-red-400 transition-colors cursor-pointer"
          data-testid="reset-all-stats"
        >
          Reset All Data
        </button>
      </section>
    </div>
  )
}

const TIER_BADGE: Record<string, string> = {
  bronze: '\uD83E\uDD49',
  silver: '\uD83E\uDD48',
  gold: '\uD83E\uDD47',
  diamond: '\uD83D\uDC8E',
}

/** Recent achievements section with link to full gallery. */
function RecentAchievements() {
  const totalUnlocked = useAchievementStore(s => s.totalUnlocked)
  const setMode = useAppStore(s => s.setMode)

  const recent = achievementEngine.getUnlocked()
    .sort((a, b) => b.unlockedAt - a.unlockedAt)
    .slice(0, 3)
    .map(u => ({ ...u, achievement: getAchievementById(u.achievementId) }))
    .filter(u => u.achievement != null)

  return (
    <section data-testid="recent-achievements">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-content">
          Recent Achievements
          <span className="ml-2 text-sm text-content/40">({totalUnlocked} unlocked)</span>
        </h2>
        <button
          onClick={() => setMode('achievements')}
          className="text-xs text-gold hover:text-gold/80 transition-colors cursor-pointer"
          data-testid="view-all-achievements"
        >
          View All →
        </button>
      </div>

      {recent.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {recent.map(({ achievementId, unlockedAt, achievement }) => (
            <div
              key={achievementId}
              className="bg-contrast/5 border border-contrast/10 rounded-xl p-3 flex items-center gap-3"
            >
              <span className="text-2xl">{achievement!.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-content truncate">{achievement!.name}</p>
                <p className="text-xs text-content/40">
                  {new Date(unlockedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <span className="text-lg">{TIER_BADGE[achievement!.tier]}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-6 text-center">
          <p className="text-content/40" data-testid="no-achievements">No achievements unlocked yet. Keep training!</p>
        </div>
      )}
    </section>
  )
}
