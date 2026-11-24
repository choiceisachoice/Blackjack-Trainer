import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarCheck, Check, Flame } from 'lucide-react'
import { useChallengeStore } from '../../store/challenge-store'
import { CHALLENGE_XP } from '../../services/challenges/challenge-types'
import { challengeMeter } from './challenge-meter'
import { ChallengeMeterView } from './ChallengeMeterView'

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
 * Daily Challenge card in the home screen's rail.
 *
 * Compact: which challenge and its countdown on one line, the task and its
 * reward on the next, then a meter that says what filling it takes — one slot
 * per unit for a small tally, and how many are left.
 */
export function DailyChallengeCard() {
  const { t } = useTranslation()
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
  const meter = challengeMeter({
    type: challenge.type,
    progress: state.progress,
    target: challenge.target,
    completed: state.completed,
  })

  const label = state.completed ? (
    <span className="inline-flex items-center gap-1 text-success font-semibold">
      <Check size={13} strokeWidth={3} aria-hidden="true" /> {t('chal.complete')}
    </span>
  ) : challenge.type === 'speed_time' ? (
    t('chal.msTarget', { done: state.progress > 0 ? `${state.progress}ms` : '—', target: challenge.target })
  ) : (
    <>
      <span className="text-content/80 font-semibold">{Math.min(state.progress, challenge.target)}</span> / {challenge.target}
      {meter.remaining != null && meter.remaining > 0 && state.progress > 0 && (
        <span className="text-content/40"> · {t('chal.toGo', { count: meter.remaining })}</span>
      )}
    </>
  )

  return (
    <div
      data-testid="daily-challenge-card"
      className={`w-full rounded-xl border p-3.5 transition-colors duration-300 ${
        state.completed
          ? 'bg-success/[.06] border-success/35'
          : justCompleted
            ? 'bg-gold/10 border-gold/60 shadow-lg shadow-gold/10'
            : 'bg-contrast/[.03] border-contrast/10'
      }`}
    >
      {/* Which challenge, and how long it has left */}
      <div className="flex items-center justify-between gap-3 text-[0.6875rem]">
        <span className="inline-flex items-center gap-1.5 font-bold tracking-[0.12em] uppercase text-content/45">
          <CalendarCheck size={13} className="text-gold/80" aria-hidden="true" />
          {t('chal.daily')}
        </span>
        <span className="flex items-center gap-2 tabular-nums text-content/40">
          {streak > 0 && (
            <span
              data-testid="streak-badge"
              className="inline-flex items-center gap-1 font-semibold text-orange-400"
            >
              <Flame size={11} aria-hidden="true" />
              {t('chal.dayStreak', { n: streak })}
            </span>
          )}
          {state.completed ? t('chal.comeBack') : t('chal.remaining', { time: formatCountdown(countdown) })}
        </span>
      </div>

      {/* The task, and what it pays */}
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-content leading-snug">{t(challenge.titleKey)}</h3>
          <p className="mt-0.5 text-xs text-content/50 leading-snug">{t(challenge.descKey)}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums ${
            state.completed ? 'border-success/30 text-success' : 'border-gold/30 bg-gold/10 text-gold'
          }`}
          data-testid="challenge-reward"
        >
          +{xp} XP
        </span>
      </div>

      <ChallengeMeterView meter={meter} done={state.completed} label={label} />

      {/* Just-completed celebration */}
      {justCompleted && (
        <div className="mt-2 text-center text-gold font-bold text-sm animate-pulse">
          {t('chal.xpEarned', { xp })}
        </div>
      )}
    </div>
  )
}
