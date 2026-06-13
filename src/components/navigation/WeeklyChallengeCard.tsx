import { useState, useEffect } from 'react'
import { useWeeklyChallengeStore } from '../../store/weekly-challenge-store'
import { weeklyChallengeEngine } from '../../services/challenges/weekly-challenge'

/** Format remaining time as "Xd Xh Xm". */
function formatTimeRemaining(remaining: { days: number; hours: number; minutes: number }): string {
  const parts: string[] = []
  if (remaining.days > 0) parts.push(`${remaining.days}d`)
  if (remaining.hours > 0 || remaining.days > 0) parts.push(`${remaining.hours}h`)
  parts.push(`${remaining.minutes}m`)
  return parts.join(' ')
}

/**
 * Weekly Challenge card displayed on the HomeScreen.
 *
 * Shows this week's challenge with progress bar, XP reward, streak, and countdown.
 * Uses a purple/violet color theme to distinguish from the gold Daily Challenge card.
 */
export function WeeklyChallengeCard() {
  const challenge = useWeeklyChallengeStore(s => s.challenge)
  const state = useWeeklyChallengeStore(s => s.state)
  const streak = useWeeklyChallengeStore(s => s.streak)
  const justCompleted = useWeeklyChallengeStore(s => s.justCompleted)
  const dismissCompletion = useWeeklyChallengeStore(s => s.dismissCompletion)
  const refresh = useWeeklyChallengeStore(s => s.refresh)

  const [timeRemaining, setTimeRemaining] = useState(() => weeklyChallengeEngine.getTimeRemaining())

  // Refresh on mount — ensures store is up-to-date when navigating back to HomeScreen
  useEffect(() => {
    refresh()
  }, [refresh])

  // Countdown timer — ticks every 60 seconds, detects week change robustly
  useEffect(() => {
    let lastWeekId = weeklyChallengeEngine.getWeekId()
    const interval = setInterval(() => {
      setTimeRemaining(weeklyChallengeEngine.getTimeRemaining())
      const currentWeekId = weeklyChallengeEngine.getWeekId()
      if (currentWeekId !== lastWeekId) {
        lastWeekId = currentWeekId
        refresh()
      }
    }, 60_000)

    return () => clearInterval(interval)
  }, [refresh])

  // Refresh when tab becomes visible (e.g. laptop opened after weekend)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh()
        setTimeRemaining(weeklyChallengeEngine.getTimeRemaining())
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [refresh])

  // Auto-dismiss celebration after 3 seconds
  useEffect(() => {
    if (!justCompleted) return
    const timer = setTimeout(() => dismissCompletion(), 3000)
    return () => clearTimeout(timer)
  }, [justCompleted, dismissCompletion])

  const progressPct = Math.min(100, Math.round((state.progress / challenge.target) * 100))

  return (
    <div
      data-testid="weekly-challenge-card"
      className={`w-full rounded-xl border p-4 transition-all duration-300 ${
        state.completed
          ? 'bg-green-900/20 border-green-500/40'
          : justCompleted
            ? 'bg-violet-500/10 border-violet-400/60 shadow-lg shadow-violet-500/10'
            : 'bg-contrast/5 border-violet-500/20'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{challenge.icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-violet-400">
              Weekly Challenge
            </h3>
            <p className="text-xs text-content/40">
              {formatTimeRemaining(timeRemaining)} remaining
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <span
              data-testid="weekly-streak-badge"
              className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300"
            >
              {streak} week streak
            </span>
          )}
          <span className="text-xs font-bold text-violet-400">
            +{challenge.xpReward} XP
          </span>
        </div>
      </div>

      {/* Challenge info */}
      <h4 className="text-base font-semibold text-content mb-0.5">
        {challenge.title}
      </h4>
      <p className="text-sm text-content/50 mb-3">
        {challenge.description}
      </p>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-contrast/10 overflow-hidden mb-1">
        <div
          data-testid="weekly-progress-bar"
          className={`h-full rounded-full transition-all duration-500 ${
            state.completed ? 'bg-green-500' : 'bg-violet-500'
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Progress text */}
      <div className="flex items-center justify-between text-xs">
        {state.completed ? (
          <span className="text-green-400 font-semibold flex items-center gap-1">
            COMPLETE
          </span>
        ) : (
          <span className="text-content/40">
            {state.progress} / {challenge.target}
          </span>
        )}
        {state.completed && (
          <span className="text-content/30">
            New challenge next Monday
          </span>
        )}
      </div>

      {/* Just-completed celebration overlay */}
      {justCompleted && (
        <div className="mt-2 text-center text-violet-400 font-bold text-sm animate-pulse">
          +{challenge.xpReward} XP earned!
        </div>
      )}
    </div>
  )
}
