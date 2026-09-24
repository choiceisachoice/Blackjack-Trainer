// The learner the demo recordings show.
//
// Not Darius's account and not an empty one: a person who has trained for
// six weeks, reached level 12, unlocked a dozen awards and has three hands
// they keep getting wrong — enough history for every screen to look lived
// in, and the same history every time the camera rolls. The shapes here
// mirror what the app writes to localStorage; the keys are the app's own.

const DAY = 24 * 60 * 60 * 1000

/** A small deterministic generator so the fixture never changes between runs. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260924)
const between = (lo, hi) => lo + rand() * (hi - lo)
const pick = arr => arr[Math.floor(rand() * arr.length)]
const id = n => `demo-${String(n).padStart(3, '0')}-0000-4000-8000-000000000000`

/** The deviations the learner still gets wrong, weakest first — what Analytics ranks. */
const WEAK = { '16 vs 10': 0.45, 'Insurance': 0.55, '12 vs 3': 0.62 }
const STRONG = ['15 vs 10', '10,10 vs 5', '12 vs 2', '11 vs A', '9 vs 2', '13 vs 2', '12 vs 4']

function session(n, mode, daysAgo, details, accuracy, questions) {
  const correct = Math.round(questions * accuracy)
  return {
    id: id(n),
    mode,
    timestamp: new Date(Date.now() - daysAgo * DAY - between(1, 8) * 3600 * 1000).toISOString(),
    countingSystem: 'hi-lo',
    durationSeconds: Math.round(between(150, 700)),
    totalQuestions: questions,
    correctAnswers: correct,
    accuracy: correct / questions,
    bestStreak: Math.round(between(3, Math.max(4, questions / 2))),
    details,
  }
}

function deviationDetails(days) {
  const per = {}
  for (const [name, acc] of Object.entries(WEAK)) {
    const total = Math.round(between(2, 5))
    // Slightly better in recent weeks, so the trend has a direction.
    const recentBoost = days < 14 ? 0.12 : 0
    const c = Math.round(total * Math.min(0.95, acc + recentBoost))
    per[name] = { correct: c, incorrect: total - c }
  }
  for (const name of STRONG.slice(0, 3 + Math.floor(rand() * 3))) {
    const total = Math.round(between(1, 4))
    const c = Math.round(total * between(0.8, 1))
    per[name] = { correct: c, incorrect: total - c }
  }
  return { type: 'deviationFlashCards', deviationSet: 'all', perDeviation: per }
}

/** Forty-odd sessions over six weeks, accuracy climbing from ~70 % to ~90 %. */
function buildSessions() {
  const out = []
  let n = 1
  for (let day = 42; day >= 0; day--) {
    // Not every day: three to five sessions a week.
    if (rand() < 0.42) continue
    const progress = 1 - day / 42 // 0 at the start, 1 today
    const acc = 0.7 + progress * 0.2
    const count = rand() < 0.35 ? 2 : 1
    for (let i = 0; i < count; i++) {
      const mode = pick(['speedDrill', 'speedDrill', 'deviationFlashCards', 'deviationFlashCards', 'betSpread', 'deckEstimation', 'casinoSession'])
      if (mode === 'speedDrill') {
        const rounds = 20
        const errors = Array.from({ length: rounds }, () => (rand() < acc ? 0 : pick([1, -1, 2])))
        out.push(session(n++, mode, day, { type: 'speedDrill', cardsPerRound: 20, speedMs: pick([1000, 750, 500]), rcErrors: errors }, acc, rounds))
      } else if (mode === 'deviationFlashCards') {
        out.push(session(n++, mode, day, deviationDetails(day), Math.min(0.92, acc), 20))
      } else if (mode === 'betSpread') {
        out.push(session(n++, mode, day, { type: 'betSpread', questionMode: 'random', tcCorrect: 8, tcTotal: 10, betCorrect: 16, betTotal: 20 }, acc, 20))
      } else if (mode === 'deckEstimation') {
        const est = Array.from({ length: 10 }, () => {
          const actual = Math.round(between(1, 5) * 2) / 2
          const error = rand() < acc ? 0 : 0.5
          return { actual, estimated: actual + error, error }
        })
        out.push(session(n++, mode, day, { type: 'deckEstimation', deckCount: 6, accuracyMode: 'half', quickFire: false, estimations: est }, acc, 10))
      } else {
        const hands = Math.round(between(30, 60))
        const net = Math.round(between(-180, 420) / 5) * 5
        out.push(session(n++, mode, day, {
          type: 'casinoSession', handsPlayed: hands, netProfit: net,
          overallScore: Math.round(acc * 100), grade: acc > 0.85 ? 'A' : acc > 0.78 ? 'B' : 'C',
          betAccuracy: Math.round(between(75, 95)), playAccuracy: Math.round(acc * 100),
          countAccuracy: Math.round(between(70, 95)), totalCountChecks: 6,
          deviationAccuracy: Math.round(between(55, 85)), totalDeviationSituations: 4,
          playStyle: 'counting', numBots: 2, hadBlackjack: rand() < 0.7, longestWinStreak: Math.round(between(2, 6)),
          splitAces: rand() < 0.3, maxSplitHands: 2,
          startingBankroll: 5000, finalBankroll: 5000 + net,
          tableConfig: { numDecks: 6, minBet: 25, blackjackPays: 1.5 },
        }, acc, hands))
      }
    }
  }
  return out
}

/** Awards a six-week learner would plausibly hold, oldest first. */
const ACHIEVEMENTS = [
  'first_hand', 'card_sharp', 'data_driven', 'on_fire', 'week_warrior', 'dedicated_student',
  'century', 'sharp_eye', 'quick_counter', 'count_rookie', 'deviation_student',
  'casino_first_session', 'casino_passing_grade', 'level_5', 'level_10', 'first_daily',
]

/**
 * Every localStorage key the app reads at start, with the demo learner's values.
 *
 * @returns Map of key → string value, as `localStorage.setItem` wants it
 */
export function buildDemoStorage() {
  const sessions = buildSessions()
  const unlocked = ACHIEVEMENTS.map((achievementId, i) => ({
    achievementId,
    unlockedAt: Date.now() - (40 - i * 2.4) * DAY,
  }))
  return {
    // Progress
    bjt_sessions: JSON.stringify(sessions),
    bjt_level_xp: '13500', // level 12 needs 12,800; level 13 needs 17,000
    bjt_achievements: JSON.stringify(unlocked),
    bjt_sim_count: '3',
    bjt_sim_best_edge: '85',
    // Every stage the session history already satisfies is marked paid, or
    // the first frame of every take carries a "+350 XP — stage complete" toast.
    bjt_claimed_stages: JSON.stringify(['rules', 'basic-strategy', 'hi-lo', 'true-count', 'deviations']),
    // The plan: placed, past the questionnaire, on the deviations stage.
    bjt_placement: 'deviations',
    bjt_learner_profile: JSON.stringify({ goal: 'serious', commitment: 'regular' }),
    bjt_read_stages: JSON.stringify(['rules', 'basic-strategy', 'hi-lo', 'true-count']),
    // Every first-run screen already seen, so none of them interrupts a take.
    bjt_welcome_seen: 'true',
    bjt_onboarding_seen: 'true',
    bjt_tour_seen: '1',
    bjt_recommendation_done: '1',
    bjt_level_intro_seen: 'true',
    bjt_start_level: 'intermediate',
    // Device
    bjt_locale: 'en',
    bjt_sound_settings: JSON.stringify({ enabled: false, volume: 0.15 }),
    bjt_dealing_speed: 'normal',
    bjt_ambient_volume: '0',
  }
}
