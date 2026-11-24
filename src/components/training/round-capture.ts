import { activeStage, type StageId } from '../../services/curriculum'
import { selectIsPro, useEntitlementStore } from '../../store/entitlement-store'
import { useLevelStore } from '../../store/level-store'
import { useAchievementStore } from '../../store/achievement-store'
import { useStatsStore } from '../../store/stats-store'

/**
 * What the round summary needs to know about the instant a round ended —
 * taken *before* the round is recorded and paid, because recording it changes
 * every one of these.
 */
export interface RoundCapture {
  /** `lastAward.id` before the payout: only a later award is this round's. */
  awardSince: number
  /** Sessions recorded before the round: the round is the one not in here. */
  sessionIds: ReadonlySet<string>
  /**
   * The plan stage the learner was on. Recording a round can finish a stage
   * and move the plan on; the summary is about the stage the round worked on.
   */
  stage: StageId | null
  /** Awards unlocked before the round: the ones unlocked since are this round's. */
  unlockedBefore: ReadonlySet<string>
}

/**
 * End a round: take the snapshot the summary compares against, claim the
 * coming XP award and the awards it unlocks for the summary (so neither
 * toast announces them as well), then record and pay the round.
 *
 * Use it where a mode used to call `finish()` from `useSessionSave` on its way
 * to the summary:
 *
 * ```ts
 * setCapture(captureRound(finish))
 * setPhase('summary')
 * ```
 *
 * @param finish - The mode's `finish` from `useSessionSave`
 * @returns The snapshot, for `RoundSummary`'s `capture` prop
 */
export function captureRound(finish: () => void): RoundCapture {
  const sessions = useStatsStore.getState().sessions
  const capture: RoundCapture = {
    awardSince: useLevelStore.getState().lastAward?.id ?? 0,
    sessionIds: new Set(sessions.map(s => s.id)),
    stage: activeStage(sessions, selectIsPro(useEntitlementStore.getState())),
    unlockedBefore: new Set(useAchievementStore.getState().unlockedIds),
  }
  useLevelStore.getState().holdAwardInPlace()
  useAchievementStore.getState().holdUnlocksInPlace()
  finish()
  return capture
}
