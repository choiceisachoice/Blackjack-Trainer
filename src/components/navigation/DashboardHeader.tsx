import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Flame, Target, Clock, Trophy } from 'lucide-react'
import { useLevelStore } from '../../store/level-store'
import { useStatsStore } from '../../store/stats-store'
import { useAchievementStore } from '../../store/achievement-store'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import { LEVELS } from '../../services/level-system'
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
  const { t } = useTranslation()
  return (
    <div className="relative z-10 w-full max-w-5xl text-center pt-10 md:pt-14 mb-8">
      <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gold-gradient leading-[1.15] pb-0.5">
        Blackjack Card Counting Trainer
      </h1>
      <p className="mt-2 text-sm text-content/45">
        {t('home.tagline')}
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
  const level = useLevelStore(s => s.level)
  const progress = useLevelStore(s => s.progress)
  const totalXP = useLevelStore(s => s.totalXP)
  const lifetimeStats = useStatsStore(s => s.lifetimeStats)
  const loadStats = useStatsStore(s => s.loadStats)
  const getTrainingStreak = useStatsStore(s => s.getTrainingStreak)
  const totalUnlocked = useAchievementStore(s => s.totalUnlocked)

  // Nothing else hydrates the stats store on the home path (analytics, training
  // and achievements each load it themselves), so without this a returning
  // user's dashboard would read zero on a fresh page load.
  useEffect(() => {
    if (lifetimeStats == null) void loadStats()
  }, [lifetimeStats, loadStats])

  const played = (lifetimeStats?.totalSessions ?? 0) > 0
  const nextLevel = LEVELS.find(l => l.level === level.level + 1)
  const streak = played ? getTrainingStreak() : 0


  return (
    <section className="relative z-10 w-full max-w-5xl mb-6">
      <div className="surface rounded-2xl p-5 md:p-6">
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
                  : t('levels.maxReached', { xp: totalXP.toLocaleString() })}
              </div>
            </div>
          </div>

          {/* No button here. "Continue <last mode>" sat beside the plan's own
              "start today's session" and the two disagreed about what to do
              next; the plan is the one that knows. */}
        </div>

        {played && lifetimeStats ? (
          <div className="mt-6 pt-5 border-t border-contrast/8 flex flex-wrap gap-x-7 gap-y-3 text-sm">
            {streak > 0 && (
              <Stat icon={Flame} label={t('home.stat.streak', { count: streak })} />
            )}
            <Stat icon={Target} label={t('home.stat.accuracy', { pct: Math.round(lifetimeStats.overallAccuracy * 100) })} />
            <Stat icon={Clock} label={formatDuration(lifetimeStats.totalPracticeSeconds)} />
            <Stat icon={Trophy} label={`${totalUnlocked}/${ALL_ACHIEVEMENTS.length} ${t('nav.modes.achievements')}`} />
          </div>
        ) : null}
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
