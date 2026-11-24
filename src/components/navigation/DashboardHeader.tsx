import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Flame, Target, Clock, Trophy } from 'lucide-react'
import { useLevelStore } from '../../store/level-store'
import { useStatsStore } from '../../store/stats-store'
import { useAchievementStore } from '../../store/achievement-store'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import { LEVELS } from '../../services/level-system'
import { formatDuration } from '../analytics/analytics-derive'
import { ExampleTag } from '../common/ExampleTag'

/** Sample figures for the preview a learner sees before their first session. */
const EXAMPLE = { streak: 3, accuracy: 86, seconds: 4_800, awards: 4 }

/**
 * "How am I doing", in one card: the level as a ring with the XP to the next,
 * the learner's own figures, and the week (handed in by the plan, which owns
 * it).
 *
 * It sits in the home screen's rail. It used to be a full-width header above
 * the plan — 190px between the learner and today's start button on a
 * 720px-high screen — and it said who you are in a 30px title while the
 * next step waited two scrolls down.
 *
 * Every figure is derived from recorded sessions; nothing is invented. Before
 * the first session the figures are a faint, plainly labelled example of what
 * will appear — never zeros presented as a result, never sample numbers
 * presented as the learner's own.
 */
export function DashboardHeader({ week }: {
  /** The week block, from the plan; drawn under the figures. */
  week?: ReactNode
}) {
  const { t, i18n } = useTranslation()
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
  const awards = ALL_ACHIEVEMENTS.length
  const fmt = (n: number) => n.toLocaleString(i18n.language)

  return (
    <section className="@container surface rounded-2xl p-5" data-testid="progress-card">
      <div className="flex items-center gap-4">
        <LevelRing
          level={level.level}
          percent={progress.percent}
          color={level.color}
          label={nextLevel ? t('levels.progressTo', { name: t(nextLevel.titleKey) }) : t('levels.progressGeneric')}
        />
        {/* No tier word above the title: the tiers ("Beginner", "Pro") share
            words with the level names, and "Beginner" over "XP to Beginner"
            read as a contradiction. The ring carries the number. */}
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight leading-tight" style={{ color: level.color }}>
            {t(level.titleKey)}
          </h2>
          <div className="mt-1.5 text-xs text-content/50 tabular-nums leading-snug">
            {nextLevel
              ? t('levels.xpTo', { current: fmt(progress.current), required: fmt(progress.required), name: t(nextLevel.titleKey) })
              : t('levels.maxReached', { xp: fmt(totalXP) })}
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-contrast/8">
        {played && lifetimeStats ? (
          <div className="grid grid-cols-1 @xs:grid-cols-2 gap-x-4 gap-y-2.5 text-[0.8125rem]">
            {streak > 0 && <Stat icon={Flame} label={t('home.stat.streak', { count: streak })} />}
            <Stat icon={Target} label={t('home.stat.accuracy', { pct: Math.round(lifetimeStats.overallAccuracy * 100) })} />
            <Stat icon={Clock} label={formatDuration(lifetimeStats.totalPracticeSeconds)} note={t('home.stat.timeLabel')} />
            <Stat icon={Trophy} label={`${totalUnlocked}/${awards} ${t('nav.modes.achievements')}`} />
          </div>
        ) : (
          <div data-testid="stats-example">
            <p className="text-[0.6875rem] text-content/45 leading-relaxed">
              <ExampleTag className="mr-2 align-[1px]" />
              {t('home.statsPreview')}
            </p>
            <div className="mt-3 grid grid-cols-1 @xs:grid-cols-2 gap-x-4 gap-y-2.5 text-[0.8125rem] opacity-40" aria-hidden="true">
              <Stat icon={Flame} label={t('home.stat.streak', { count: EXAMPLE.streak })} />
              <Stat icon={Target} label={t('home.stat.accuracy', { pct: EXAMPLE.accuracy })} />
              <Stat icon={Clock} label={formatDuration(EXAMPLE.seconds)} note={t('home.stat.timeLabel')} />
              <Stat icon={Trophy} label={`${EXAMPLE.awards}/${awards} ${t('nav.modes.achievements')}`} />
            </div>
          </div>
        )}
      </div>

      {week && <div className="mt-5 pt-4 border-t border-contrast/8">{week}</div>}
    </section>
  )
}

/**
 * The level as a medal: the same bezel of ticks and ring as the level-up
 * moment, at rest, filled to the share of the way to the next level.
 *
 * The ring eases to a new value (a session just paid XP) and draws its first
 * value without motion — the home screen is opened dozens of times a session,
 * and an entrance there is latency, not news.
 */
function LevelRing({ level, percent, color, label }: {
  level: number
  percent: number
  color: string
  label: string
}) {
  const pct = Math.max(0, Math.min(100, percent))
  // Struck, as on the level-up medal: the level's colour lit from above.
  const metal: CSSProperties = {
    backgroundImage: `linear-gradient(180deg, color-mix(in oklab, ${color} 45%, white) 30%, ${color} 56%, color-mix(in oklab, ${color} 72%, black) 80%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }
  return (
    <div
      className="relative grid place-items-center size-[76px] shrink-0"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      data-testid="level-ring"
    >
      <svg viewBox="0 0 120 120" aria-hidden className="absolute inset-0 size-full -rotate-90">
        <g stroke="var(--color-gold)" strokeLinecap="round">
          {Array.from({ length: 60 }, (_, i) => (
            <line
              key={i}
              x1="60" y1={i % 5 === 0 ? 1.5 : 2.5} x2="60" y2="5"
              strokeWidth={i % 5 === 0 ? 1.2 : 0.7}
              strokeOpacity={i % 5 === 0 ? 0.5 : 0.2}
              transform={`rotate(${i * 6} 60 60)`}
            />
          ))}
        </g>
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-content)" strokeOpacity="0.09" strokeWidth="5" />
        <circle
          cx="60" cy="60" r="50" fill="none"
          stroke={color} strokeWidth="5" strokeLinecap="round"
          pathLength={100} strokeDasharray="100" strokeDashoffset={100 - pct}
          className="transition-[stroke-dashoffset] duration-500 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
          style={{ filter: `drop-shadow(0 0 3px color-mix(in srgb, ${color} 55%, transparent))` }}
          data-testid="level-ring-fill"
        />
      </svg>
      <span
        aria-hidden
        className="absolute inset-[17%] rounded-full border border-contrast/8"
        style={{ background: 'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.06), rgba(0,0,0,0.28) 75%)' }}
      />
      <span aria-hidden className="relative text-2xl font-extrabold tabular-nums tracking-tight" style={{ color, ...metal }}>
        {level}
      </span>
    </div>
  )
}

/** One derived figure with its icon, and a word for a figure that is only a number. */
function Stat({ icon: Icon, label, note }: { icon: typeof Flame; label: string; note?: string }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0 text-content/75">
      <Icon size={14} className="text-gold/70 shrink-0" />
      <span className="tabular-nums">
        {label}
        {note && <span className="text-content/45"> {note}</span>}
      </span>
    </span>
  )
}
