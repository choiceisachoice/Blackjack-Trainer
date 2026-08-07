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

export function buildWelcomeCopy(isPro: boolean): WelcomeCopy {
  const stages = CURRICULUM.length
  const free = freeStageCount()

  // Kept to one line each. The welcome screen has to be one complete thought
  // that fits on a laptop without scrolling; three paragraphs of explanation
  // pushed the only button off a 600px window.
  // "A few questions, with real cards" was true of the old placement test and
  // became a lie the moment that test was replaced by a single question. The
  // promise a welcome screen makes has to be the one the next screen keeps.
  const shared: WelcomeStep = {
    title: 'Answer one question',
    body: 'Where you are starting from. That is the only thing we ask.',
  }

  if (isPro) {
    return {
      eyebrow: 'Welcome to Pro',
      headline: 'Everything is open. Let’s find where you start.',
      subhead: `All ${stages} stages and every training mode are unlocked. The only thing left is where to begin — and that is not a guess you should have to make.`,
      steps: [
        shared,
        {
          title: 'Get a plan built around the answer',
          body: 'One ordered path. You start where you actually are.',
        },
        {
          title: 'Train, and let it keep score',
          body: 'Every drill counts toward the stage you are on — nothing else does.',
        },
      ],
      cta: 'Find my starting point',
      footnote: null,
    }
  }

  return {
    eyebrow: 'Welcome',
    headline: 'Card counting, in the order it has to be learned.',
    subhead: `One path from never having played to holding a count at a live table — ${stages} stages, and the fastest way through is to start at the right one.`,
    steps: [
      shared,
      {
        title: 'Get a plan built around the answer',
        body: 'One ordered path. You start where you actually are.',
      },
      {
        title: 'Train, and let it keep score',
        body: `Every drill counts toward the stage you are on. ${free} of the ${stages} stages are free.`,
      },
    ],
    cta: 'Find my starting point',
    footnote: 'Pro unlocks the rest. Nothing is asked of you now.',
  }
}
