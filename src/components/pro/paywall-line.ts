import {
  CURRICULUM,
  currentStage,
  deriveCurriculum,
  stageIndex,
  type StageId,
} from '../../services/curriculum'
import { goalStage, type Goal } from '../../services/learner-profile'
import type { TrainingSessionResult } from '../../services/stats-types'

/**
 * What the paywall says about *this* learner, above the plans.
 *
 * The generic sub-line ("unlock the advanced modes…") is true for everyone
 * and therefore about no one. The app already knows where a learner stands on
 * the path and which stage on it Pro opens next, so the paywall can say that
 * instead — in two short sentences, with nothing invented:
 *
 * - `lead` names where they are: the stage they just finished, or the stage
 *   their plan is at.
 * - `support` names what Pro has to do with it: the next stage is Pro, this
 *   stage's practice is Pro, or a stage further along is.
 *
 * Every claim is derived the way the plan derives it (`deriveCurriculum`,
 * `currentStage`), as a free account — the paywall is what a free account
 * sees — so the two screens cannot tell different stories.
 *
 * Returns null, and the panel keeps its generic line, when there is nothing
 * true to personalise with: no placement and no session, a learner who has
 * reached their goal, or a goal with no Pro stage left on it.
 */

/** A translation key and what it interpolates, if anything. */
export interface PaywallSentence {
  key: string
  /** Translation key of the stage title for `{{stage}}`. */
  stageTitleKey?: string
  /** Plain numbers the sentence names (`count` selects the plural). */
  values?: Record<string, number>
}

export interface PaywallLine {
  lead: PaywallSentence
  support: PaywallSentence
}

export interface PaywallLineInput {
  sessions: readonly TrainingSessionResult[]
  /** Where the learner was placed, or null if they never were. */
  placement: StageId | null
  readStages: readonly StageId[]
  /** Stages finished and paid under an earlier bar; they stay finished. */
  claimed: readonly StageId[]
  /** Where the learner's path ends. The plan's own default when unset. */
  goal?: Goal | null
}

/**
 * The personal line for one learner. Pure.
 *
 * @param input - The learner's history and plan answers
 */
export function paywallLine({ sessions, placement, readStages, claimed, goal }: PaywallLineInput): PaywallLine | null {
  // No history at all: nothing is known, so nothing is claimed.
  if (placement === null && sessions.length === 0) return null

  const progress = deriveCurriculum(sessions, readStages, false, claimed)
  const entry = placement ?? CURRICULUM[0].id
  const current = currentStage(progress, entry)
  if (!current) return null

  const at = stageIndex(current.stage.id)
  const end = stageIndex(goalStage(goal ?? 'serious'))
  // Past the goal the plan itself says "done"; a paywall that named a further
  // stage would be selling something the learner said they do not want.
  if (at > end) return null

  if (current.locked) {
    const before = at > 0 ? progress[at - 1] : null
    // "Finished" only for a stage that was actually finished here — not one
    // the placement skipped over as already known.
    if (before?.done) {
      return {
        lead: { key: 'paywall.personalFinished', stageTitleKey: before.stage.titleKey },
        support: { key: 'paywall.personalNextIsPro', stageTitleKey: current.stage.titleKey },
      }
    }
    return {
      lead: { key: 'paywall.personalAt', stageTitleKey: current.stage.titleKey },
      support: { key: 'paywall.personalThisIsPro' },
    }
  }

  const later = progress.slice(at + 1, end + 1).find(p => p.locked && !p.done)
  if (!later) return null
  return {
    lead: { key: 'paywall.personalAt', stageTitleKey: current.stage.titleKey },
    support: { key: 'paywall.personalLaterIsPro', stageTitleKey: later.stage.titleKey },
  }
}

/**
 * What the paywall says to someone who has just used up the free trial of the
 * casino table: what their own hands came to, and what Pro has to do with it.
 *
 * Read from the sessions the trial recorded (`details.trial`), all of them —
 * ten hands may have been played in more than one sitting. Two figures, both
 * counted rather than judged: the hands, and the share of decisions that
 * followed basic strategy, which is the one thing the trial table grades. The
 * money is left out on purpose: over ten hands it is luck, and a paywall that
 * opened with "you lost $150" or "you won $200" would be arguing with chance.
 *
 * Null when there is nothing to say: no trial session on record, or none with
 * a decision in it (ten dealt blackjacks) — then the panel keeps its other
 * line rather than print a percentage of nothing.
 *
 * @param sessions - The learner's session history
 */
export function trialPaywallLine(sessions: readonly TrainingSessionResult[]): PaywallLine | null {
  let hands = 0
  let decisions = 0
  let correct = 0
  for (const session of sessions) {
    if (session.details.type !== 'casinoSession' || session.details.trial !== true) continue
    hands += session.details.handsPlayed
    decisions += session.totalQuestions
    correct += session.correctAnswers
  }
  if (hands === 0 || decisions === 0) return null
  return {
    lead: { key: 'paywall.trialLead', values: { count: hands, pct: Math.round((correct / decisions) * 100) } },
    support: { key: 'paywall.trialSupport' },
  }
}
