import type { Achievement } from './achievement-types'
import type { Translate } from '../../i18n/translate'

/**
 * All 102 achievements in the game.
 *
 * The name and the description are not stored here: each achievement's `id` is
 * the stem of its two message keys (`ach.<id>.name`, `ach.<id>.desc`), read
 * through {@link achievementName} and {@link achievementDescription}. Keeping
 * 204 strings out of this file also keeps it what it is — a table of
 * requirements — rather than half data and half copy.
 */
export const ALL_ACHIEVEMENTS: Achievement[] = [
  // ── Getting Started (3) ──────────────────────────────
  {
    id: 'first_hand',
    icon: '\uD83C\uDFB0',
    category: 'getting_started',
    requirement: { type: 'sessions', value: 1 },
    tier: 'bronze',
  },
  {
    id: 'card_sharp',
    icon: '\uD83C\uDCCF',
    category: 'getting_started',
    requirement: { type: 'mode_complete', value: 5 },
    tier: 'bronze',
  },
  {
    id: 'data_driven',
    icon: '\uD83D\uDCCA',
    category: 'getting_started',
    requirement: { type: 'bankroll_sim', value: 1 },
    tier: 'bronze',
  },

  // ── Dedication (8) ───────────────────────────────────
  {
    id: 'on_fire',
    icon: '\uD83D\uDD25',
    category: 'dedication',
    requirement: { type: 'streak', value: 3 },
    tier: 'bronze',
  },
  {
    id: 'week_warrior',
    icon: '\uD83D\uDD25',
    category: 'dedication',
    requirement: { type: 'streak', value: 7 },
    tier: 'silver',
  },
  {
    id: 'unstoppable',
    icon: '\uD83D\uDD25',
    category: 'dedication',
    requirement: { type: 'streak', value: 14 },
    tier: 'gold',
  },
  {
    id: 'legendary',
    icon: '\uD83D\uDD25',
    category: 'dedication',
    requirement: { type: 'streak', value: 30 },
    tier: 'diamond',
  },
  {
    id: 'dedicated_student',
    icon: '\u23F1\uFE0F',
    category: 'dedication',
    requirement: { type: 'time', value: 60 },
    tier: 'bronze',
  },
  {
    id: 'serious_grinder',
    icon: '\u23F1\uFE0F',
    category: 'dedication',
    requirement: { type: 'time', value: 600 },
    tier: 'silver',
  },
  {
    id: 'professional_trainee',
    icon: '\u23F1\uFE0F',
    category: 'dedication',
    requirement: { type: 'time', value: 3000 },
    tier: 'gold',
  },
  {
    id: 'century',
    icon: '\uD83C\uDFAF',
    category: 'dedication',
    requirement: { type: 'sessions', value: 100 },
    tier: 'silver',
  },
  {
    id: 'thousand_hands',
    icon: '\uD83C\uDFAF',
    category: 'dedication',
    requirement: { type: 'hands', value: 1000, mode: 'deviationFlashCards' },
    tier: 'silver',
  },

  // ── Mastery (4) ──────────────────────────────────────
  {
    id: 'sharp_eye',
    icon: '\u2705',
    category: 'mastery',
    requirement: { type: 'accuracy', value: 80 },
    tier: 'bronze',
  },
  {
    id: 'precision',
    icon: '\u2705',
    category: 'mastery',
    requirement: { type: 'accuracy', value: 90 },
    tier: 'silver',
  },
  {
    id: 'sniper',
    icon: '\u2705',
    category: 'mastery',
    requirement: { type: 'accuracy', value: 95 },
    tier: 'gold',
  },
  {
    id: 'perfection',
    icon: '\u2705',
    category: 'mastery',
    requirement: { type: 'perfect', value: 10 },
    tier: 'silver',
  },

  // ── Speed (2) ────────────────────────────────────────
  {
    id: 'quick_counter',
    icon: '\u26A1',
    category: 'speed',
    requirement: { type: 'speed', value: 1, mode: 'speedDrill' },
    tier: 'bronze',
  },
  {
    id: 'lightning_fast',
    icon: '\u26A1',
    category: 'speed',
    requirement: { type: 'speed', value: 2, mode: 'speedDrill' },
    tier: 'silver',
  },
  // ── Counting (3) ─────────────────────────────────────
  {
    id: 'count_rookie',
    icon: '\uD83D\uDD22',
    category: 'counting',
    requirement: { type: 'sessions', value: 5, mode: 'speedDrill' },
    tier: 'bronze',
  },
  {
    id: 'count_expert',
    icon: '\uD83D\uDD22',
    category: 'counting',
    requirement: { type: 'sustained_accuracy', value: 90, mode: 'speedDrill', window: 20 },
    tier: 'gold',
  },
  {
    id: 'six_systems',
    icon: '\uD83D\uDD22',
    category: 'counting',
    requirement: { type: 'sustained_accuracy', value: 95, mode: 'speedDrill', window: 30 },
    tier: 'diamond',
  },

  // ── Deviations (3) ───────────────────────────────────
  {
    id: 'deviation_student',
    icon: '\uD83D\uDCCB',
    category: 'deviations',
    requirement: { type: 'sessions', value: 5, mode: 'deviationFlashCards' },
    tier: 'bronze',
  },
  {
    id: 'illustrious_18',
    icon: '\uD83D\uDCCB',
    category: 'deviations',
    requirement: { type: 'accuracy', value: 90, mode: 'deviationFlashCards' },
    tier: 'gold',
  },
  {
    id: 'table_general',
    icon: '\uD83D\uDCCB',
    category: 'deviations',
    requirement: { type: 'accuracy', value: 95, mode: 'deviationFlashCards' },
    tier: 'gold',
  },

  // ── Bet Spread & Estimation (2) ──────────────────────
  {
    id: 'spread_master',
    icon: '\uD83D\uDCB0',
    category: 'simulation',
    requirement: { type: 'sustained_accuracy', value: 90, mode: 'betSpread', window: 10 },
    tier: 'gold',
  },
  {
    id: 'deck_hawk',
    icon: '\uD83D\uDC41',
    category: 'simulation',
    requirement: { type: 'sustained_accuracy', value: 90, mode: 'deckEstimation', window: 10 },
    tier: 'gold',
  },

  // ── Simulation (3) ───────────────────────────────────
  {
    id: 'risk_analyst',
    icon: '\uD83C\uDFE6',
    category: 'simulation',
    requirement: { type: 'bankroll_sim', value: 5 },
    tier: 'silver',
  },
  {
    id: 'edge_hunter',
    icon: '\uD83D\uDC8E',
    category: 'simulation',
    requirement: { type: 'bankroll_sim', value: 100 },
    tier: 'gold',
  },

  // ── Casino Session – Getting Started (3) ─────────────
  {
    id: 'casino_first_session',
    icon: '\uD83C\uDFB0',
    category: 'casino_session',
    requirement: { type: 'sessions', value: 1, mode: 'casinoSession' },
    tier: 'bronze',
  },
  {
    id: 'casino_full_table',
    icon: '\uD83C\uDFB0',
    category: 'casino_session',
    requirement: { type: 'casino_bots', value: 5 },
    tier: 'bronze',
  },
  {
    id: 'casino_marathon',
    icon: '\uD83C\uDFB0',
    category: 'casino_session',
    requirement: { type: 'casino_hands', value: 50 },
    tier: 'silver',
  },

  // ── Casino Session – Grades (4) ─────────────────────
  {
    id: 'casino_passing_grade',
    icon: '\uD83D\uDCDD',
    category: 'casino_session',
    requirement: { type: 'casino_grade', value: 70 },
    tier: 'bronze',
  },
  {
    id: 'casino_honor_student',
    icon: '\uD83D\uDCDD',
    category: 'casino_session',
    requirement: { type: 'casino_grade', value: 80 },
    tier: 'silver',
  },
  {
    id: 'casino_deans_list',
    icon: '\uD83D\uDCDD',
    category: 'casino_session',
    requirement: { type: 'casino_grade', value: 90 },
    tier: 'gold',
  },
  {
    id: 'casino_valedictorian',
    icon: '\uD83D\uDCDD',
    category: 'casino_session',
    requirement: { type: 'casino_grade', value: 95 },
    tier: 'gold',
  },

  // ── Casino Session – Accuracy (4) ───────────────────
  {
    id: 'casino_bet_master',
    icon: '\uD83C\uDFAF',
    category: 'casino_session',
    requirement: { type: 'casino_bet_accuracy', value: 90 },
    tier: 'gold',
  },
  {
    id: 'casino_perfect_play',
    icon: '\uD83C\uDFAF',
    category: 'casino_session',
    requirement: { type: 'casino_play_accuracy', value: 95 },
    tier: 'gold',
  },
  {
    id: 'casino_eagle_eye',
    icon: '\uD83C\uDFAF',
    category: 'casino_session',
    requirement: { type: 'casino_count_accuracy', value: 90 },
    tier: 'gold',
  },
  {
    id: 'casino_triple_threat',
    icon: '\uD83C\uDFAF',
    category: 'casino_session',
    requirement: { type: 'casino_triple', value: 90 },
    tier: 'diamond',
  },

  // ── Casino Session – Profit (3) ─────────────────────
  {
    id: 'casino_in_the_green',
    icon: '\uD83D\uDCB0',
    category: 'casino_session',
    requirement: { type: 'casino_profit', value: 1 },
    tier: 'bronze',
  },
  {
    id: 'casino_high_roller',
    icon: '\uD83D\uDCB0',
    category: 'casino_session',
    requirement: { type: 'casino_profit', value: 1000 },
    tier: 'silver',
  },
  {
    id: 'casino_whale',
    icon: '\uD83D\uDCB0',
    category: 'casino_session',
    requirement: { type: 'casino_profit', value: 5000 },
    tier: 'gold',
  },

  // ── Casino Session – Special Moments (4) ────────────
  {
    id: 'casino_natural',
    icon: '\uD83C\uDCCF',
    category: 'casino_session',
    requirement: { type: 'casino_blackjack', value: 1 },
    tier: 'bronze',
  },
  {
    id: 'casino_hot_streak',
    icon: '\uD83C\uDCCF',
    category: 'casino_session',
    requirement: { type: 'casino_streak', value: 5 },
    tier: 'silver',
  },
  {
    id: 'casino_splitting_aces',
    icon: '\uD83C\uDCCF',
    category: 'casino_session',
    requirement: { type: 'casino_split_aces', value: 1 },
    tier: 'silver',
  },
  {
    id: 'casino_four_of_a_kind',
    icon: '\uD83C\uDCCF',
    category: 'casino_session',
    requirement: { type: 'casino_max_split', value: 4 },
    tier: 'gold',
  },

  // ── Casino Session – Dedication (2) ─────────────────
  {
    id: 'casino_session_grinder',
    icon: '\uD83D\uDD25',
    category: 'casino_session',
    requirement: { type: 'sessions', value: 10, mode: 'casinoSession' },
    tier: 'silver',
  },
  {
    id: 'casino_pro',
    icon: '\uD83C\uDFC6',
    category: 'casino_session',
    requirement: { type: 'casino_grade_count', value: 3 },
    tier: 'diamond',
  },

  // ── Daily & Weekly Challenges (5) ───────────────────
  {
    id: 'first_daily',
    icon: '\u2615',
    category: 'challenges',
    requirement: { type: 'daily_completed', value: 1 },
    tier: 'bronze',
  },
  {
    id: 'challenge_regular',
    icon: '\uD83D\uDCC5',
    category: 'challenges',
    requirement: { type: 'daily_completed', value: 10 },
    tier: 'silver',
  },
  {
    id: 'daily_devotion',
    icon: '\uD83D\uDD25',
    category: 'challenges',
    requirement: { type: 'daily_streak', value: 7 },
    tier: 'gold',
  },
  {
    id: 'first_weekly',
    icon: '\uD83D\uDCC6',
    category: 'challenges',
    requirement: { type: 'weekly_completed', value: 1 },
    tier: 'bronze',
  },
  {
    id: 'weekly_master',
    icon: '\uD83C\uDFC5',
    category: 'challenges',
    requirement: { type: 'weekly_completed', value: 10 },
    tier: 'gold',
  },

  // ── Level System (5) ──────────────────────────────────
  {
    id: 'level_5',
    icon: '\u2B50',
    category: 'level_system',
    requirement: { type: 'reach_level', value: 5 },
    tier: 'bronze',
  },
  {
    id: 'level_10',
    icon: '\u2B50',
    category: 'level_system',
    requirement: { type: 'reach_level', value: 10 },
    tier: 'silver',
  },
  {
    id: 'level_15',
    icon: '\uD83C\uDF1F',
    category: 'level_system',
    requirement: { type: 'reach_level', value: 15 },
    tier: 'gold',
  },
  {
    id: 'level_20',
    icon: '\uD83C\uDF1F',
    category: 'level_system',
    requirement: { type: 'reach_level', value: 20 },
    tier: 'gold',
  },
  {
    id: 'level_25',
    icon: '\uD83D\uDC51',
    category: 'level_system',
    requirement: { type: 'reach_level', value: 25 },
    tier: 'diamond',
  },

  // ── Milestones (5) ────────────────────────────────────
  {
    id: 'five_thousand_hands',
    icon: '\uD83C\uDFAF',
    category: 'milestones',
    requirement: { type: 'total_hands', value: 5000 },
    tier: 'silver',
  },
  {
    id: 'ten_thousand_hands',
    icon: '\uD83C\uDFAF',
    category: 'milestones',
    requirement: { type: 'total_hands', value: 10000 },
    tier: 'gold',
  },
  {
    id: 'twenty_hours',
    icon: '\u23F0',
    category: 'milestones',
    requirement: { type: 'total_hours', value: 20 },
    tier: 'silver',
  },
  {
    id: 'hundred_hours',
    icon: '\u23F0',
    category: 'milestones',
    requirement: { type: 'total_hours', value: 100 },
    tier: 'gold',
  },
  {
    id: 'five_hundred_sessions',
    icon: '\uD83C\uDFC6',
    category: 'milestones',
    requirement: { type: 'sessions', value: 500 },
    tier: 'diamond',
  },

  // ── Extreme Challenges (4) ────────────────────────────
  {
    id: 'triple_perfect',
    icon: '\uD83D\uDCAF',
    category: 'extreme',
    requirement: { type: 'perfect_sessions', value: 3 },
    tier: 'gold',
  },
  {
    id: 'ten_perfects',
    icon: '\uD83D\uDCAF',
    category: 'extreme',
    requirement: { type: 'perfect_sessions', value: 10 },
    tier: 'diamond',
  },
  {
    id: 'mega_profit',
    icon: '\uD83D\uDCB5',
    category: 'extreme',
    requirement: { type: 'casino_profit', value: 10000 },
    tier: 'diamond',
  },
  {
    id: 'unstoppable_run',
    icon: '\uD83D\uDD25',
    category: 'extreme',
    requirement: { type: 'casino_streak', value: 10 },
    tier: 'gold',
  },
  // ── Counting Mastery (6) ──────────────────────────────
  {
    id: 'tc_sharpshooter',
    icon: '\uD83D\uDD22',
    category: 'counting_mastery',
    requirement: { type: 'casino_count_accuracy', value: 95 },
    tier: 'gold',
  },
  {
    id: 'system_scholar',
    icon: '\uD83D\uDCDA',
    category: 'counting_mastery',
    requirement: { type: 'accuracy', value: 95, mode: 'deckEstimation' },
    tier: 'gold',
  },
  {
    id: 'counting_grinder',
    icon: '\uD83D\uDD22',
    category: 'counting_mastery',
    requirement: { type: 'hands', value: 5000, mode: 'deviationFlashCards' },
    tier: 'gold',
  },
  {
    id: 'deviation_virtuoso',
    icon: '\uD83D\uDCCB',
    category: 'counting_mastery',
    requirement: { type: 'accuracy', value: 95, mode: 'deviationFlashCards' },
    tier: 'gold',
  },
  {
    id: 'master_collector',
    icon: '\uD83C\uDFC6',
    category: 'counting_mastery',
    requirement: { type: 'meta_unlocks', value: 50 },
    tier: 'diamond',
  },
  {
    id: 'card_counter',
    icon: '\uD83C\uDFC6',
    category: 'counting_mastery',
    requirement: { type: 'meta_unlocks', value: 20 },
    tier: 'silver',
  },

  // ── Bankroll Tracker (17) ───────────────────────────────

  // Bronze (5)
  {
    id: 'tracker_first_session',
    icon: '\uD83D\uDCDD',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_sessions', value: 1 },
    tier: 'bronze',
  },
  {
    id: 'tracker_first_win',
    icon: '\uD83D\uDC9A',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_first_win', value: 1 },
    tier: 'bronze',
  },
  {
    id: 'tracker_5_sessions',
    icon: '\uD83C\uDFB0',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_sessions', value: 5 },
    tier: 'bronze',
  },
  {
    id: 'tracker_long_session',
    icon: '\u23F1\uFE0F',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_session_hours', value: 3 },
    tier: 'bronze',
  },

  // Silver (5)
  {
    id: 'tracker_10_sessions',
    icon: '\uD83C\uDCCF',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_sessions', value: 10 },
    tier: 'silver',
  },
  {
    id: 'tracker_win_streak_3',
    icon: '\uD83D\uDD25',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_win_streak', value: 3 },
    tier: 'silver',
  },
  {
    id: 'tracker_profit_1000',
    icon: '\uD83D\uDCB0',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_total_profit', value: 1000 },
    tier: 'silver',
  },
  {
    id: 'tracker_25_hours',
    icon: '\u231A',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_total_hours', value: 25 },
    tier: 'silver',
  },
  {
    id: 'tracker_comeback',
    icon: '\uD83D\uDCAA',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_comeback', value: 3 },
    tier: 'silver',
  },

  // Gold (5)
  {
    id: 'tracker_50_sessions',
    icon: '\u2660\uFE0F',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_sessions', value: 50 },
    tier: 'gold',
  },
  {
    id: 'tracker_win_streak_7',
    icon: '\uD83C\uDF1F',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_win_streak', value: 7 },
    tier: 'gold',
  },
  {
    id: 'tracker_profit_5000',
    icon: '\uD83D\uDC8E',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_total_profit', value: 5000 },
    tier: 'gold',
  },
  {
    id: 'tracker_100_hours',
    icon: '\uD83D\uDD50',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_total_hours', value: 100 },
    tier: 'gold',
  },
  {
    id: 'tracker_big_win',
    icon: '\uD83E\uDD11',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_single_session_profit', value: 500 },
    tier: 'gold',
  },

  // Diamond (2)
  {
    id: 'tracker_100_sessions',
    icon: '\uD83D\uDC51',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_sessions', value: 100 },
    tier: 'diamond',
  },
  {
    id: 'tracker_profit_10000',
    icon: '\uD83C\uDFC6',
    category: 'bankrollTracker',
    requirement: { type: 'tracker_total_profit', value: 10000 },
    tier: 'diamond',
  },

  // ── 2026-07 balance-pass additions (11) → 100 total ──
  {
    id: 'well_rounded',
    icon: '🎯',
    category: 'mastery',
    requirement: { type: 'all_modes_accuracy', value: 80 },
    tier: 'silver',
  },
  {
    id: 'renaissance_counter',
    icon: '🎓',
    category: 'mastery',
    requirement: { type: 'all_modes_accuracy', value: 90 },
    tier: 'gold',
  },
  {
    id: 'in_the_zone',
    icon: '🎯',
    category: 'mastery',
    requirement: { type: 'session_streak', value: 20 },
    tier: 'silver',
  },
  {
    id: 'unbreakable',
    icon: '💯',
    category: 'mastery',
    requirement: { type: 'session_streak', value: 50 },
    tier: 'diamond',
  },
  {
    id: 'quick_draw',
    icon: '⚡',
    category: 'counting_mastery',
    requirement: { type: 'quickfire_accuracy', value: 90 },
    tier: 'silver',
  },
  {
    id: 'blur',
    icon: '💨',
    category: 'speed',
    requirement: { type: 'speed_accuracy', value: 95 },
    tier: 'gold',
  },
  {
    id: 'deviation_ace',
    icon: '🎯',
    category: 'casino_session',
    requirement: { type: 'casino_deviation_accuracy', value: 95 },
    tier: 'gold',
  },
  {
    id: 'marathon_mind',
    icon: '⏱️',
    category: 'dedication',
    requirement: { type: 'session_duration', value: 60 },
    tier: 'silver',
  },
  {
    id: 'daily_double',
    icon: '☕',
    category: 'dedication',
    requirement: { type: 'modes_in_day', value: 5 },
    tier: 'bronze',
  },
  {
    id: 'night_owl',
    icon: '🌙',
    category: 'dedication',
    requirement: { type: 'night_session', value: 1 },
    tier: 'bronze',
  },
  {
    id: 'platinum_collector',
    icon: '🏆',
    category: 'counting_mastery',
    requirement: { type: 'meta_unlocks', value: 75 },
    tier: 'diamond',
  },

  // ── Deviation-set mastery (enabled by per-deviation tracking) ──
  {
    id: 'fab_four_master',
    icon: '🛡️',
    category: 'deviations',
    requirement: { type: 'deviation_set_mastery', value: 3, deviationSet: 'fab4' },
    tier: 'silver',
  },
  {
    id: 'deviation_sage',
    icon: '📜',
    category: 'deviations',
    requirement: { type: 'deviation_set_mastery', value: 3, deviationSet: 'i18' },
    tier: 'diamond',
  },
]

/** Lookup achievement by ID. */
export function getAchievementById(id: string): Achievement | undefined {
  return ALL_ACHIEVEMENTS.find(a => a.id === id)
}

/** The achievement's name, in the reader's language. */
export function achievementName(a: Achievement, t: Translate): string {
  return t(`ach.${a.id}.name`)
}

/** What the achievement asks for, in the reader's language. */
export function achievementDescription(a: Achievement, t: Translate): string {
  return t(`ach.${a.id}.desc`)
}
