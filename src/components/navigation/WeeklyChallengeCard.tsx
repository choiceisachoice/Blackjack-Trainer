import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarRange, Check, Flame } from 'lucide-react'
import { useWeeklyChallengeStore } from '../../store/weekly-challenge-store'
import { weeklyChallengeEngine } from '../../services/challenges/weekly-challenge'
import { challengeMeter } from './challenge-meter'
import { ChallengeMeterView } from './ChallengeMeterView'

/** Format remaining time as "Xd Xh Xm". */
function formatTimeRemaining(remaining: { days: number; hours: number; minutes: number }): string {
  const parts: string[] = []
  if (remaining.days > 0) parts.push(`${remaining.days}d`)
  if (remaining.hours > 0 || remaining.days > 0) parts.push(`${remaining.hours}h`)
  parts.push(`${remaining.minutes}m`)
  return parts.join(' ')
}

/**
 * Weekly Challenge card in the home screen's rail.
 *
 * Same compact shape as the daily card — which, how long, the task and its
 * reward, then a meter that says how many are left — so the two read as a
 * pair rather than as two different widgets.
 */
export function WeeklyChallengeCard() {
  const { t } = useTranslation()
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
      data-testid="weekly-challenge-card"
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
          <CalendarRange size={13} className="text-gold/80" aria-hidden="true" />
          {t('chal.weekly')}
        </span>
        <span className="flex items-center gap-2 tabular-nums text-content/40">
          {streak > 0 && (
            <span
              data-testid="weekly-streak-badge"
              className="inline-flex items-center gap-1 font-semibold text-gold"
            >
              <Flame size={11} aria-hidden="true" />
              {t('chal.weekStreak', { n: streak })}
            </span>
          )}
          {state.completed ? t('chal.nextMonday') : t('chal.remaining', { time: formatTimeRemaining(timeRemaining) })}
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
          +{challenge.xpReward} XP
        </span>
      </div>

      <ChallengeMeterView meter={meter} done={state.completed} label={label} />

      {/* Just-completed celebration */}
      {justCompleted && (
        <div className="mt-2 text-center text-gold font-bold text-sm animate-pulse">
          {t('chal.xpEarned', { xp: challenge.xpReward })}
        </div>
      )}
    </div>
  )
}
