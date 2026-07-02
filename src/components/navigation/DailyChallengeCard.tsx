import { useState, useEffect } from 'react'
import { CalendarCheck } from 'lucide-react'
import { useChallengeStore } from '../../store/challenge-store'
import { CHALLENGE_XP } from '../../services/challenges/challenge-types'

/** Format seconds as HH:MM:SS. */
function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Seconds remaining until midnight (local time). */
function secondsUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000))
}

/**
 * Daily Challenge card displayed on the HomeScreen.
 *
 * Shows today's challenge with progress bar, XP reward, streak, and countdown.
 */
export function DailyChallengeCard() {
  const challenge = useChallengeStore(s => s.challenge)
  const state = useChallengeStore(s => s.state)
  const streak = useChallengeStore(s => s.streak)
  const justCompleted = useChallengeStore(s => s.justCompleted)
  const dismissCompletion = useChallengeStore(s => s.dismissCompletion)
  const refresh = useChallengeStore(s => s.refresh)

  const [countdown, setCountdown] = useState(secondsUntilMidnight)

  // Refresh on mount — ensures store is up-to-date when navigating back to HomeScreen
  useEffect(() => {
    refresh()
  }, [refresh])

  // Countdown timer — ticks every second, detects day change robustly
  useEffect(() => {
    const getLocalDate = () => {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    }
    let lastDate = getLocalDate()
    const interval = setInterval(() => {
      setCountdown(secondsUntilMidnight())
      const today = getLocalDate()
      if (today !== lastDate) {
        lastDate = today
        refresh()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [refresh])

  // Refresh when tab becomes visible (e.g. laptop opened next morning)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh()
        setCountdown(secondsUntilMidnight())
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

  const xp = CHALLENGE_XP[challenge.difficulty]
  const progressPct = challenge.type === 'speed_time'
    ? (state.completed ? 100 : state.progress > 0 ? Math.min(99, Math.round((challenge.target / state.progress) * 100)) : 0)
    : Math.min(100, Math.round((state.progress / challenge.target) * 100))

  return (
    <div
      data-testid="daily-challenge-card"
      className={`w-full rounded-xl border p-4 transition-all duration-300 ${
        state.completed
          ? 'bg-green-900/20 border-green-500/40'
          : justCompleted
            ? 'bg-gold/10 border-gold/60 shadow-lg shadow-gold/10'
            : 'bg-contrast/5 border-contrast/10'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-9 h-9 rounded-lg text-gold bg-gold/10 border border-gold/20 shrink-0">
            <CalendarCheck size={18} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-content">
              Daily Challenge
            </h3>
            <p className="text-xs text-content/40">
              {formatCountdown(countdown)} remaining
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <span
              data-testid="streak-badge"
              className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400"
            >
              {streak} day streak
            </span>
          )}
          <span className="text-xs font-bold text-gold">
            +{xp} XP
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
          data-testid="progress-bar"
          className={`h-full rounded-full transition-all duration-500 ${
            state.completed ? 'bg-green-500' : 'bg-gold'
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
        ) : challenge.type === 'speed_time' ? (
          <span className="text-content/40">
            {state.progress > 0 ? `${state.progress}ms` : '—'} / {challenge.target}ms target
          </span>
        ) : (
          <span className="text-content/40">
            {state.progress} / {challenge.target}
          </span>
        )}
        {state.completed && (
          <span className="text-content/30">
            Come back tomorrow
          </span>
        )}
      </div>

      {/* Just-completed celebration overlay */}
      {justCompleted && (
        <div className="mt-2 text-center text-gold font-bold text-sm animate-pulse">
          +{xp} XP earned!
        </div>
      )}
    </div>
  )
}
