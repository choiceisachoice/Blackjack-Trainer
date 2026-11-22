import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useStatsStore } from '../store/stats-store'
import { useIsPro } from '../store/entitlement-store'
import { useChallengeStore } from '../store/challenge-store'
import { useWeeklyChallengeStore } from '../store/weekly-challenge-store'
import { useLevelStore } from '../store/level-store'
import { activeStage, deriveCurriculum, getReadStages } from '../services/curriculum'
import { pendingStageAwards, markStageClaimed } from '../services/stage-rewards'
import { budgetOf, getProfile, sessionsPerWeek } from '../services/learner-profile'
import { pendingWeeklyAwards, getClaimedRewards, markRewardClaimed } from '../services/weekly-rewards'
import { todayKey } from '../services/date-utils'
import { useAwaitingAccount, usePlanState } from './use-plan-state'

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
  // The planned days decide whether a week is kept, so a change of plan (a tap
  // here, or the account's copy arriving) has to run the effect again.
  const plan = usePlanState()
  const awaitingAccount = useAwaitingAccount()

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

    // A kept week, and weeks kept in a row. Paid here for the same reason as
    // the stages: derived from the recorded sessions, marked paid only after
    // the XP is in. Two things are waited for first. Without the learner's
    // own answer there is no plan to keep — the default pace is not a promise
    // anyone made. And right after a sign-in the sessions are back before the
    // account's plan and its paid set are, so judging then would measure the
    // week against the wrong number of days and pay what is already paid.
    if (profile && !awaitingAccount) {
      const awards = pendingWeeklyAwards({
        sessions,
        daysPerWeek: budgetOf(profile).daysPerWeek,
        today: todayKey(),
        claimed: getClaimedRewards(),
      })
      for (const award of awards) {
        if (award.kind === 'week') addXP(award.xp, 'xp.source.weekGoal')
        else addXP(award.xp, 'xp.source.weekStreak', { n: String(award.weeks) })
        markRewardClaimed(award.key)
      }
    }
    // `t` is a dependency because the XP ledger entry names the stage; the
    // effect is idempotent (each stage and each week is marked claimed once),
    // so an extra run after a language change costs nothing.
  }, [sessions, isPro, syncDaily, syncWeekly, addXP, t, plan, awaitingAccount])
}
