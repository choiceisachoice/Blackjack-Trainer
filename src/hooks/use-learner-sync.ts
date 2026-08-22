import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useStatsStore } from '../store/stats-store'
import { useIsPro } from '../store/entitlement-store'
import { useChallengeStore } from '../store/challenge-store'
import { useWeeklyChallengeStore } from '../store/weekly-challenge-store'
import { useLevelStore } from '../store/level-store'
import { activeStage, deriveCurriculum, getReadStages } from '../services/curriculum'
import { pendingStageAwards, markStageClaimed } from '../services/stage-rewards'
import { getProfile, sessionsPerWeek } from '../services/learner-profile'

/**
 * Keeps the challenge engines pointed at the learner's current stage.
 *
 * The app used to hold four separate opinions about where a user stood — the
 * training plan derived one from the placement test and session history, while
 * the daily and weekly challenges each picked from a date hash that knew
 * nothing about anyone. This hook makes the plan's stage the one that feeds the
 * others, so finishing today's challenge advances the plan instead of pulling
 * sideways.
 *
 * Mounted once in the app shell. Re-runs whenever the session history or the
 * Pro entitlement changes, which are the only two inputs that can move a
 * learner between stages.
 */
export function useLearnerSync(): void {
  const { t } = useTranslation()
  const sessions = useStatsStore(s => s.sessions)
  const isPro = useIsPro()
  const syncDaily = useChallengeStore(s => s.syncLearner)
  const syncWeekly = useWeeklyChallengeStore(s => s.syncLearner)
  const addXP = useLevelStore(s => s.addChallengeXP)

  useEffect(() => {
    // The pace answer reaches challenge selection here, so a learner with
    // twenty minutes a week is never handed a five-session day.
    const profile = getProfile()
    const context = {
      stage: activeStage(sessions, isPro),
      isPro,
      sessionsPerWeek: profile ? sessionsPerWeek(profile.commitment) : undefined,
    }
    syncDaily(context)
    syncWeekly(context)

    // Pay out any stage finished since the last run. Mark each claimed only
    // after the XP has actually been added, so a failure re-tries rather than
    // silently swallowing the reward.
    for (const award of pendingStageAwards(deriveCurriculum(sessions, getReadStages(), isPro))) {
      addXP(award.xp, 'plan.stageComplete', { stage: t(award.titleKey) })
      markStageClaimed(award.stage)
    }
    // `t` is a dependency because the XP ledger entry names the stage; the
    // effect is idempotent (each stage is marked claimed once), so an extra
    // run after a language change costs nothing.
  }, [sessions, isPro, syncDaily, syncWeekly, addXP, t])
}
