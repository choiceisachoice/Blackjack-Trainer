import { useEffect, useMemo, useRef, useState } from 'react'
import { useAchievementStore } from '../../store/achievement-store'
import { useStatsStore } from '../../store/stats-store'
import { useLevelStore } from '../../store/level-store'
import { achievementEngine } from '../../services/achievements/achievement-engine'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import { LEVELS } from '../../services/level-system'
import type { Achievement, AchievementCategory, AchievementTier } from '../../services/achievements/achievement-types'

/** Filter options for the collection. */
type FilterMode = 'all' | 'unlocked' | 'locked'

/** Category display config. */
const CATEGORY_DISPLAY: Record<AchievementCategory, { label: string; icon: string }> = {
  getting_started:  { label: 'Getting Started', icon: '🎰' },
  dedication:       { label: 'Dedication',      icon: '🔥' },
  mastery:          { label: 'Mastery',          icon: '✅' },
  speed:            { label: 'Speed',            icon: '⚡' },
  counting:         { label: 'Counting',         icon: '🔢' },
  deviations:       { label: 'Deviations',       icon: '📋' },
  simulation:       { label: 'Bet Spread, Estimation & Simulation', icon: '🏦' },
  casino_session:   { label: 'Casino Session',   icon: '🎰' },
  challenges:       { label: 'Daily & Weekly Challenges', icon: '📅' },
  level_system:     { label: 'Level System',     icon: '⭐' },
  milestones:       { label: 'Milestones',       icon: '🎯' },
  extreme:          { label: 'Extreme Challenges', icon: '💯' },
  counting_mastery: { label: 'Counting Mastery', icon: '🔢' },
  bankrollTracker:  { label: 'Bankroll Tracker', icon: '💰' },
}

const CATEGORY_ORDER: AchievementCategory[] = [
  'getting_started', 'dedication', 'mastery', 'speed',
  'counting', 'deviations', 'simulation', 'casino_session',
  'challenges', 'level_system', 'milestones', 'extreme', 'counting_mastery',
  'bankrollTracker',
]

/** Metallic tier colors (theme-independent). */
const TIER_HEX: Record<AchievementTier, string> = {
  bronze: '#cd7f32',
  silver: '#c9c9c9',
  gold: '#ffd23f',
  diamond: '#9fe9ff',
}

/** Format a timestamp to a readable date. */
function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** A circular progress ring (SVG). Optionally renders centered content. */
function ProgressRing({ percent, size, color, track = 'var(--color-contrast)', width = 4, children }: {
  percent: number
  size: number
  color: string
  track?: string
  width?: number
  children?: React.ReactNode
}) {
  const r = size / 2 - width
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeOpacity={0.12} strokeWidth={width} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={width}
          strokeLinecap="round" strokeDasharray={`${(c * Math.max(0, Math.min(100, percent))) / 100} ${c}`}
        />
      </svg>
      {children != null && <span className="absolute inset-0 grid place-items-center">{children}</span>}
    </div>
  )
}

/**
 * Achievements gallery (2.0) — a single scroll that leads with identity and
 * momentum, then the full collection:
 *   1. Rank hero — level badge, title, XP progress, headline counts.
 *   2. Next up — the locked awards closest to unlocking (progress rings).
 *   3. Level roadmap — the 25-level journey with the current position.
 *   4. Collection — every achievement as a medal, grouped by category, filterable.
 *
 * All figures come from real stores (level/XP, stats, unlock state).
 */
export function AchievementsPage() {
  const unlockedIds = useAchievementStore(s => s.unlockedIds)
  const totalUnlocked = useAchievementStore(s => s.totalUnlocked)
  const sessions = useStatsStore(s => s.sessions)
  const lifetimeStats = useStatsStore(s => s.lifetimeStats)
  const loadStats = useStatsStore(s => s.loadStats)
  const getTrainingStreak = useStatsStore(s => s.getTrainingStreak)
  const level = useLevelStore(s => s.level)
  const levelProgress = useLevelStore(s => s.progress)
  const refreshLevel = useLevelStore(s => s.refresh)

  const [filter, setFilter] = useState<FilterMode>('all')

  useEffect(() => {
    loadStats()
    refreshLevel()
  }, [loadStats, refreshLevel])

  const dayStreak = getTrainingStreak()
  const stats = lifetimeStats ?? {
    totalSessions: 0, totalQuestions: 0, totalCorrect: 0, totalPracticeSeconds: 0,
    overallAccuracy: 0, bestStreak: 0, byMode: {}, dailyStats: [],
  }

  const unlockedMap = useMemo(
    () => new Map(achievementEngine.getUnlocked().map(u => [u.achievementId, u.unlockedAt])),
    // getUnlocked reads the same store slice; recompute when unlock state changes
    [unlockedIds], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const total = ALL_ACHIEVEMENTS.length
  const diamondUnlocked = ALL_ACHIEVEMENTS.filter(a => a.tier === 'diamond' && unlockedIds.includes(a.id)).length
  const overallPercent = total > 0 ? Math.round((totalUnlocked / total) * 100) : 0

  // Progress for every locked achievement (used by Next Up + medal tooltips).
  const progressOf = (a: Achievement) => achievementEngine.getProgress(a, stats, dayStreak, sessions)

  const closest = useMemo(() => {
    return ALL_ACHIEVEMENTS
      .filter(a => !unlockedIds.includes(a.id))
      .map(a => ({ a, p: Math.round(progressOf(a)) }))
      .filter(x => x.p > 0 && x.p < 100)
      .sort((x, y) => y.p - x.p)
      .slice(0, 4)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedIds, sessions, lifetimeStats, dayStreak])

  const nextTitle = LEVELS.find(l => l.level === level.level + 1)?.title

  // Filtered + grouped collection.
  const filtered = ALL_ACHIEVEMENTS.filter(a => {
    if (filter === 'unlocked') return unlockedIds.includes(a.id)
    if (filter === 'locked') return !unlockedIds.includes(a.id)
    return true
  })
  const grouped = CATEGORY_ORDER
    .map(cat => ({ cat, items: filtered.filter(a => a.category === cat) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6" data-testid="achievements-page">
      <div className="max-w-[1140px] mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-content/50 flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold" style={{ boxShadow: '0 0 10px var(--color-gold)' }} />
            Your trophies
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gold-gradient leading-[1.15] pb-0.5">Awards</h1>
          <p className="text-sm text-content/50" data-testid="unlock-count">{totalUnlocked}/{total} unlocked</p>
        </div>

        {/* 1 — Rank hero */}
        <section className="surface relative overflow-hidden p-5 md:p-6 flex flex-wrap items-center gap-5 md:gap-7">
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(45% 120% at 12% 50%, ${level.glowColor}, transparent 70%)` }} />
          <ProgressRing percent={levelProgress.required === 0 ? 100 : levelProgress.percent} size={96} color={level.color}>
            <span className="text-center">
              <span className="block text-3xl font-extrabold leading-none" style={{ color: level.color }}>{level.level}</span>
              <span className="block text-[8px] tracking-[0.18em] uppercase text-content/50 mt-0.5">Level</span>
            </span>
          </ProgressRing>
          <div className="relative flex-1 min-w-[220px]">
            <div className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: level.color }} data-testid="rank-title">{level.title}</div>
            <div className="text-sm text-content/50 mt-0.5 capitalize">
              {level.tier} tier{nextTitle ? ` · next: ${nextTitle}` : ' · max level'}
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-surface-2 border border-contrast/10 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${levelProgress.required === 0 ? 100 : levelProgress.percent}%`, background: `linear-gradient(90deg, ${level.color}, var(--color-gold-bright))` }} />
            </div>
            <div className="flex justify-between text-[11px] text-content/40 mt-1.5">
              <span>{levelProgress.current.toLocaleString('en-US')} XP</span>
              <span>{levelProgress.required === 0 ? 'Max level reached' : `${(levelProgress.required - levelProgress.current).toLocaleString('en-US')} XP to level ${level.level + 1}`}</span>
            </div>
          </div>
          <div className="relative flex gap-6 md:gap-7">
            <HeroStat value={totalUnlocked} label="Unlocked" color="var(--color-gold-bright)" />
            <HeroStat value={total - totalUnlocked} label="Locked" />
            <HeroStat value={diamondUnlocked} label="Diamond" color={TIER_HEX.diamond} />
          </div>
        </section>

        {/* 2 — Next up */}
        {closest.length > 0 && (
          <section>
            <SectionTitle>Closest to unlocking</SectionTitle>
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
              {closest.map(({ a, p }) => (
                <div key={a.id} className="flex items-center gap-3.5 p-4 rounded-2xl border border-contrast/15 bg-surface"
                  data-testid={`next-up-${a.id}`}>
                  <ProgressRing percent={p} size={56} color={TIER_HEX[a.tier]}>
                    <span className="text-[1.3rem]">{a.icon}</span>
                  </ProgressRing>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate text-content">{a.name}</div>
                    <div className="text-[11.5px] text-content/40 leading-snug mt-0.5">{a.description}</div>
                    <div className="text-[11px] font-semibold mt-1" style={{ color: TIER_HEX[a.tier] }}>{p}% complete</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 3 — Level roadmap */}
        <section>
          <SectionTitle>Your climb — level {level.level} of {LEVELS.length}</SectionTitle>
          <LevelRoadmap currentLevel={level.level} />
        </section>

        {/* 4 — Collection */}
        <section>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <SectionTitle className="mb-0">Collection</SectionTitle>
            <div className="flex items-center gap-3">
              <span className="text-xs text-content/40">{overallPercent}% complete</span>
              <div className="flex gap-2">
                {(['all', 'unlocked', 'locked'] as FilterMode[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    data-testid={`filter-${f}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
                      ${filter === f ? 'bg-gold/20 text-gold border border-gold/40' : 'bg-contrast/5 text-content/50 border border-contrast/10 hover:text-content/70'}`}
                  >
                    {f === 'all' ? 'All' : f === 'unlocked' ? 'Unlocked' : 'Locked'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {grouped.map(({ cat, items }) => {
            const catTotal = ALL_ACHIEVEMENTS.filter(a => a.category === cat).length
            const catDone = ALL_ACHIEVEMENTS.filter(a => a.category === cat && unlockedIds.includes(a.id)).length
            return (
              <div key={cat} className="mt-6">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="text-lg">{CATEGORY_DISPLAY[cat].icon}</span>
                  <span className="text-sm font-semibold text-content">{CATEGORY_DISPLAY[cat].label}</span>
                  <div className="flex-1 max-w-[160px] h-1 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-gold" style={{ width: `${catTotal ? (catDone / catTotal) * 100 : 0}%` }} />
                  </div>
                  <span className="text-[11px] text-content/40">{catDone}/{catTotal}</span>
                </div>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
                  {items.map(a => (
                    <Medal
                      key={a.id}
                      achievement={a}
                      unlocked={unlockedIds.includes(a.id)}
                      unlockedAt={unlockedMap.get(a.id)}
                      progress={progressOf(a)}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-content/40">
              {filter === 'unlocked' ? 'No achievements unlocked yet' : 'All achievements unlocked!'}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/** A headline stat in the rank hero. */
function HeroStat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-extrabold tracking-tight" style={color ? { color } : undefined}>{value}</div>
      <div className="text-[10px] tracking-[0.1em] uppercase text-content/40">{label}</div>
    </div>
  )
}

/** Small uppercase section heading. */
function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-xs font-bold tracking-[0.1em] uppercase text-content/50 mb-3 ${className}`}>{children}</h2>
}

/** The 25-level journey as a horizontally scrollable track, scrolled to current. */
function LevelRoadmap({ currentLevel }: { currentLevel: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Bring the current level into view horizontally without scrolling the page.
    const cur = currentRef.current
    const box = scrollRef.current
    if (cur && box) {
      box.scrollLeft = Math.max(0, cur.offsetLeft - box.clientWidth / 2 + cur.clientWidth / 2)
    }
  }, [currentLevel])

  return (
    <div className="surface p-5 overflow-x-auto overflow-y-hidden" ref={scrollRef}>
      <div className="relative min-w-max px-2">
        {/* connecting line */}
        <div className="absolute left-0 right-0 top-[15px] h-[3px] rounded-full"
          style={{ background: 'linear-gradient(90deg, var(--color-gold), var(--color-gold) 0%, var(--color-line-strong, rgba(255,255,255,.14)))' }} />
        <div className="relative flex gap-1">
          {LEVELS.map(l => {
            const done = l.level < currentLevel
            const current = l.level === currentLevel
            return (
              <div key={l.level} ref={current ? currentRef : undefined} className="flex flex-col items-center gap-2 w-[92px] shrink-0">
                <div
                  className="w-[30px] h-[30px] rounded-full grid place-items-center text-xs font-bold border-2 relative z-[1]"
                  style={
                    done
                      ? { background: 'var(--color-gold)', borderColor: 'var(--color-gold)', color: '#12100a' }
                      : current
                        ? { background: `color-mix(in srgb, ${l.color} 25%, var(--color-surface))`, borderColor: l.color, color: l.color, boxShadow: `0 0 0 4px color-mix(in srgb, ${l.color} 25%, transparent)` }
                        : { background: 'var(--color-surface-2)', borderColor: 'var(--color-line-strong, rgba(255,255,255,.14))', color: 'var(--color-content)', opacity: 0.5 }
                  }
                >
                  {done ? '✓' : l.level}
                </div>
                <div className={`text-[10.5px] text-center leading-tight ${current ? 'font-bold' : 'text-content/50'}`}
                  style={current ? { color: l.color } : undefined}>
                  {l.title}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** A single achievement rendered as a collectible medal. */
function Medal({ achievement, unlocked, unlockedAt, progress }: {
  achievement: Achievement
  unlocked: boolean
  unlockedAt?: number
  progress: number
}) {
  const tc = TIER_HEX[achievement.tier]
  const title = unlocked
    ? `${achievement.name} — ${achievement.description} (unlocked ${unlockedAt ? formatDate(unlockedAt) : ''})`
    : `${achievement.name} — ${achievement.description} (${Math.round(progress)}%)`

  return (
    <div className="text-center" data-testid={`achievement-card-${achievement.id}`} title={title}>
      <div
        className="w-14 h-14 mx-auto rounded-full grid place-items-center text-[1.5rem] border-2"
        style={
          unlocked
            ? { borderColor: tc, background: `radial-gradient(circle at 50% 35%, color-mix(in srgb, ${tc} 22%, var(--color-surface)), var(--color-surface))`, boxShadow: `0 0 14px -4px color-mix(in srgb, ${tc} 55%, transparent)` }
            : { borderColor: 'var(--color-line-strong, rgba(255,255,255,.14))', background: 'var(--color-surface-2)' }
        }
      >
        <span style={unlocked ? undefined : { filter: 'grayscale(1)', opacity: 0.45 }}>{achievement.icon}</span>
      </div>
      <div className={`text-[10px] mt-1.5 leading-tight ${unlocked ? 'text-content/70' : 'text-content/35'}`}>
        {achievement.name}
      </div>
      {unlocked
        ? <span className="sr-only" data-testid={`unlocked-date-${achievement.id}`}>{unlockedAt ? formatDate(unlockedAt) : 'Unknown'}</span>
        : <span className="sr-only" data-testid={`progress-${achievement.id}`}>{Math.round(progress)}%</span>}
    </div>
  )
}
