import { CURRICULUM } from '../../services/curriculum'

import { PRO_MODES } from '../../services/pro-features'

/**
 * Copy for the first screen a new account sees.
 *
 * Free and Pro get different words on purpose. A free account is being told
 * where it can get to and what the ceiling is; a paying one is being told the
 * ceiling is gone. Saying the same thing to both wastes the only moment either
 * of them is paying full attention.
 *
 * Every number here is derived, never typed. Claims about "7 stages" or "5
 * training modes" rot the moment the curriculum changes, and a welcome screen
 * that lies in its first sentence is worse than no welcome screen.
 */

export interface WelcomeStep {
  title: string
  body: string
}

export interface WelcomeCopy {
  eyebrow: string
  headline: string
  subhead: string
  steps: WelcomeStep[]
  cta: string
  /** Small print under the button. Null when there is nothing honest to add. */
  footnote: string | null
}

/** Stages a free account can drill end to end. */
export function freeStageCount(): number {
  return CURRICULUM.filter(s => !s.drill || !PRO_MODES.has(s.drill.mode)).length
}

/**
 * Just enough of i18next's `t` to build this copy, declared here so the module
 * stays a plain function the tests can call with any translator.
 */
export type Translate = (key: string, vars?: Record<string, unknown>) => string

export function buildWelcomeCopy(isPro: boolean, t: Translate): WelcomeCopy {
  const stages = CURRICULUM.length
  const free = freeStageCount()

  // Kept to one line each. The welcome screen has to be one complete thought
  // that fits on a laptop without scrolling; three paragraphs of explanation
  // pushed the only button off a 600px window.
  // "A few questions, with real cards" was true of the old placement test and
  // became a lie the moment that test was replaced by a single question. The
  // promise a welcome screen makes has to be the one the next screen keeps.
  const shared: WelcomeStep = {
    title: t('welcome.stepOne.title'),
    body: t('welcome.stepOne.body'),
  }

  if (isPro) {
    return {
      eyebrow: t('welcome.pro.eyebrow'),
      headline: t('welcome.pro.headline'),
      subhead: t('welcome.pro.subhead', { stages }),
      steps: [
        shared,
        {
          title: t('welcome.stepPlan.title'),
          body: t('welcome.stepPlan.body'),
        },
        {
          title: t('welcome.stepTrain.title'),
          body: t('welcome.stepTrain.bodyPro'),
        },
      ],
      cta: t('welcome.cta'),
      footnote: null,
    }
  }

  return {
    eyebrow: t('welcome.free.eyebrow'),
    headline: t('welcome.free.headline'),
    subhead: t('welcome.free.subhead', { stages }),
    steps: [
      shared,
      {
        title: t('welcome.stepPlan.title'),
        body: t('welcome.stepPlan.body'),
      },
      {
        title: t('welcome.stepTrain.title'),
        body: t('welcome.stepTrain.bodyFree', { free, stages }),
      },
    ],
    cta: t('welcome.cta'),
    footnote: t('welcome.footnote'),
  }
}
