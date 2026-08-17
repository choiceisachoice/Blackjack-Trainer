import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Club, ArrowRight, Flame, Target, Clock, Trophy } from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { useLevelStore } from '../../store/level-store'
import { useStatsStore } from '../../store/stats-store'
import { useAchievementStore } from '../../store/achievement-store'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import { LEVELS } from '../../services/level-system'
import { resumeTargetFor } from '../../services/resume-mode'
import { activeStage, CURRICULUM, stageIndex } from '../../services/curriculum'
import { useIsPro } from '../../store/entitlement-store'
import type { AppMode } from '../../store/app-store'
import { formatDuration } from '../analytics/analytics-derive'

/**
 * The product's name, on its own.
 *
 * Split out from the stats card deliberately. The app shell shows only a
 * compact wordmark, so without this the screen opens with no sense of place —
 * but the 270px stats card behind it used to push the plan's "up next" to
 * **763px on a 694px viewport**, i.e. the answer to "what do I do now" sat
 * entirely below the fold. Title on top (78px), numbers underneath the answer.
 */
export function ProductTitle() {
  return (
    <div className="relative z-10 w-full max-w-5xl text-center pt-10 md:pt-14 mb-8">
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gold-gradient leading-[1.15] pb-0.5">
        Blackjack Card Counting Trainer
      </h1>
      <p className="mt-2 text-sm text-content/45">
        Hi-Lo, drilled until the count comes without thinking.
      </p>
    </div>
  )
}

/**
 * The signed-in home header: who you are, how far you've come, and the one
 * button that gets you back to training.
 *
 * Deliberately NOT a second landing page — a returning user reads this every
 * session, so it shows their own numbers instead of selling them the product.
 * Every figure here is derived from recorded sessions; nothing is invented, and
 * a user with no history gets an invitation rather than a wall of zeros.
 */
export function DashboardHeader() {
  const { t } = useTranslation()
  const setMode = useAppStore(s => s.setMode)
  const level = useLevelStore(s => s.level)
  const progress = useLevelStore(s => s.progress)
  const totalXP = useLevelStore(s => s.totalXP)
  const lifetimeStats = useStatsStore(s => s.lifetimeStats)
  const sessions = useStatsStore(s => s.sessions)
  const isPro = useIsPro()
  const loadStats = useStatsStore(s => s.loadStats)
  const getTrainingStreak = useStatsStore(s => s.getTrainingStreak)
  const totalUnlocked = useAchievementStore(s => s.totalUnlocked)

  // Nothing else hydrates the stats store on the home path (analytics, training
  // and achievements each load it themselves), so without this a returning
  // user's dashboard would read zero on a fresh page load.
  useEffect(() => {
    if (lifetimeStats == null) loadStats()
  }, [lifetimeStats, loadStats])

  const played = (lifetimeStats?.totalSessions ?? 0) > 0
  const nextLevel = LEVELS.find(l => l.level === level.level + 1)
  const streak = played ? getTrainingStreak() : 0

  // sessions are sorted newest-first by the store. A retired mode resolves to
  // null, so old history falls back to the generic call to action.
  const resume = sessions[0] ? resumeTargetFor(sessions[0].mode) : null

  // The drill the plan is actually asking for. `activeStage` is null before the
  // placement test and for a finished path; `learn` is the honest fallback,
  // since reading is where someone with no plan should start.
  const stageId = activeStage(sessions, isPro)
  const planTarget: AppMode =
    (stageId && CURRICULUM[stageIndex(stageId)]?.drill?.mode) || 'learn'

  return (
    <section className="relative z-10 w-full max-w-5xl mb-8">
      <div className="surface rounded-2xl p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-5">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-[0.2em] uppercase text-content/40">
              {played ? t('common.welcomeBack') : t('common.welcome')}
            </div>
            <h1 className="mt-2 flex items-baseline gap-2.5 text-2xl md:text-3xl font-bold tracking-tight">
              <span style={{ color: level.color }}>{t(level.titleKey)}</span>
              <span className="text-base font-semibold text-content/35">{t('levels.short', { n: level.level })}</span>
            </h1>

            <div className="mt-4 w-full max-w-sm">
              <div
                className="h-1.5 rounded-full bg-contrast/8 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress.percent)}
                aria-label={nextLevel ? t('levels.progressTo', { name: t(nextLevel.titleKey) }) : t('levels.progressGeneric')}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${progress.percent}%`,
                    background: `linear-gradient(90deg, ${level.color}, var(--color-gold))`,
                  }}
                />
              </div>
              <div className="mt-1.5 text-xs text-content/45 tabular-nums">
                {nextLevel
                  ? t('levels.xpTo', { current: progress.current.toLocaleString(), required: progress.required.toLocaleString(), name: t(nextLevel.titleKey) })
                  : `${totalXP.toLocaleString()} XP — max level reached`}
              </div>
            </div>
          </div>

          {/*
            Where this button goes, in priority order:
              1. the mode they were last in (resume),
              2. the drill their CURRENT PLAN STAGE asks for,
              3. the Learn page.

            It used to fall back to `speedDrill` unconditionally. That is stage
            three of seven and assumes the learner already knows the Hi-Lo card
            values — so an account placed at "the game itself" was sent straight
            into a drill demanding a number whose rule it had never been shown.
            Never point a beginner past their own plan.
          */}
          <button
            onClick={() => setMode(resume?.mode ?? planTarget)}
            className="lift-glow inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold
              text-black bg-gradient-to-b from-gold-bright to-gold border border-gold/50 cursor-pointer
              shadow-[0_10px_30px_-12px_var(--color-gold)]"
          >
            <Club size={18} className="fill-current" />
            {resume
              ? t('common.continueMode', { mode: t(resume.labelKey) })
              : stageId
                ? t('plan.startStage', { stage: t(CURRICULUM[stageIndex(stageId)].titleKey) })
                : t('common.startLearning')}
            <ArrowRight size={17} />
          </button>
        </div>

        {played && lifetimeStats ? (
          <div className="mt-6 pt-5 border-t border-contrast/8 flex flex-wrap gap-x-7 gap-y-3 text-sm">
            {streak > 0 && (
              <Stat icon={Flame} label={`${streak}-day streak`} />
            )}
            <Stat icon={Target} label={`${Math.round(lifetimeStats.overallAccuracy * 100)}% accuracy`} />
            <Stat icon={Clock} label={formatDuration(lifetimeStats.totalPracticeSeconds)} />
            <Stat icon={Trophy} label={`${totalUnlocked}/${ALL_ACHIEVEMENTS.length} awards`} />
          </div>
        ) : (
          <p className="mt-6 pt-5 border-t border-contrast/8 text-sm text-content/50 max-w-lg">
            {t('home.nothingTracked')}
          </p>
        )}
      </div>
    </section>
  )
}

/** One derived figure with its icon. */
function Stat({ icon: Icon, label }: { icon: typeof Flame; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-content/70">
      <Icon size={15} className="text-gold/70 shrink-0" />
      <span className="tabular-nums">{label}</span>
    </span>
  )
}
