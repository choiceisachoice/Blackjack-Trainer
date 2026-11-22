import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAchievementStore } from '../../store/achievement-store'
import { useStatsStore } from '../../store/stats-store'
import { useLevelStore } from '../../store/level-store'
import { achievementEngine } from '../../services/achievements/achievement-engine'
import { ALL_ACHIEVEMENTS, achievementName, achievementDescription } from '../../services/achievements/achievement-list'
import { LEVELS } from '../../services/level-system'
import type { Achievement, AchievementCategory, AchievementTier } from '../../services/achievements/achievement-types'
import { ProgressBar, EmptyState } from '../common/ui'
import { medalProgress } from './medal-progress'
import { Lock, Trophy } from 'lucide-react'

/** Filter options for the collection. */
type FilterMode = 'all' | 'unlocked' | 'locked'

/** Category display config. */
// Only the icons live here now; every label is `awards.cat.<category>`.
const CATEGORY_ICON: Record<AchievementCategory, string> = {
  getting_started:  '🎰',
  dedication:       '🔥',
  mastery:          '✅',
  speed:            '⚡',
  counting:         '🔢',
  deviations:       '📋',
  simulation:       '🏦',
  casino_session:   '🎰',
  challenges:       '📅',
  level_system:     '⭐',
  milestones:       '🎯',
  extreme:          '💯',
  counting_mastery: '🔢',
  bankrollTracker:  '💰',
}

const CATEGORY_ORDER: AchievementCategory[] = [
  'getting_started', 'dedication', 'mastery', 'speed',
  'counting', 'deviations', 'simulation', 'casino_session',
  'challenges', 'level_system', 'milestones', 'extreme', 'counting_mastery',
  'bankrollTracker',
]

/**
 * Metallic tier colours, as authored for the dark theme.
 *
 * They used to be labelled "theme-independent", which is the same assumption
 * that left `--color-success` unreadable on white: a colour that gleams on
 * near-black is not the same colour on paper, it is barely a colour at all.
 * Measured in the browser before this changed — diamond as text on the light
 * surface read **1.24:1** and gold's "95% complete" label 1.44:1.
 *
 * Read them through `tierInk` rather than directly.
 */
const TIER_HEX: Record<AchievementTier, string> = {
  bronze: '#cd7f32',
  silver: '#c9c9c9',
  gold: '#ffd23f',
  diamond: '#9fe9ff',
}

/**
 * Format a timestamp to a readable date, in the reader's language.
 *
 * The locale used to be pinned to `en-US`, so a German reader was shown
 * "Aug 11, 2026" on a page that was otherwise entirely in German.
 */
function formatDate(ts: number, locale: string): string {
  return new Date(ts).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
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
  const { t, i18n } = useTranslation()
  const unlockedIds = useAchievementStore(s => s.unlockedIds)
  const totalUnlocked = useAchievementStore(s => s.totalUnlocked)
  const sessions = useStatsStore(s => s.sessions)
  const lifetimeStats = useStatsStore(s => s.lifetimeStats)
  const loadStats = useStatsStore(s => s.loadStats)
  const getTrainingStreak = useStatsStore(s => s.getTrainingStreak)
  // Through the palette: the ladder's colours are authored for the dark
  // theme, where pale reads as brilliant. On the light surface the elite
  // tier fell to about 1.1:1 — see `services/level-palette.ts`.
  const level = useLevelStore(s => s.level)
  const levelProgress = useLevelStore(s => s.progress)
  const refreshLevel = useLevelStore(s => s.refresh)

  const [filter, setFilter] = useState<FilterMode>('all')
  // The one medal whose description is pinned open by a tap or a click.
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    void loadStats()
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

  const nextKey = LEVELS.find(l => l.level === level.level + 1)?.titleKey

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
          <div className="text-[0.75rem] font-semibold tracking-[0.22em] uppercase text-content/50 flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gold" style={{ boxShadow: '0 0 10px var(--color-gold)' }} />
            {t('awards.yourTrophies')}
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gold-gradient leading-[1.15] pb-0.5">{t('awards.title')}</h1>
          <p className="text-sm text-content/50" data-testid="unlock-count">{t('awards.unlockCount', { n: totalUnlocked, total })}</p>
        </div>

        {/* 1 — Rank hero */}
        <section className="surface relative overflow-hidden p-5 md:p-6 flex flex-wrap items-center gap-5 md:gap-7">
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: `radial-gradient(45% 120% at 12% 50%, ${level.glowColor}, transparent 70%)` }} />
          <ProgressRing percent={levelProgress.required === 0 ? 100 : levelProgress.percent} size={96} color={level.color}>
            <span className="text-center">
              <span className="block text-3xl font-extrabold leading-none" style={{ color: level.color }}>{level.level}</span>
              <span className="block text-[0.625rem] tracking-[0.18em] uppercase text-content/50 mt-0.5">{t('awards.level')}</span>
            </span>
          </ProgressRing>
          <div className="relative flex-1 min-w-[220px]">
            <div className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: level.color }} data-testid="rank-title">{t(level.titleKey)}</div>
            <div className="text-sm text-content/50 mt-0.5">
              {nextKey
                ? t('levels.tierNext', { tier: t(`levels.tier.${level.tier}`), name: t(nextKey) })
                : t('levels.tierMax', { tier: t(`levels.tier.${level.tier}`) })}
            </div>
            <ProgressBar
              className="mt-3"
              height={10}
              value={levelProgress.required === 0 ? 100 : levelProgress.percent}
              fill={`linear-gradient(90deg, ${level.color}, var(--color-gold-bright))`}
              label={t('awards.levelProgress', { defaultValue: 'Level' })}
            />
            <div className="flex justify-between text-[0.75rem] text-content/40 mt-1.5">
              <span>{t('awards.xpAmount', { xp: levelProgress.current.toLocaleString(i18n.language) })}</span>
              {/* `awards.maxLevel` already existed; this line carried its own
                  English copy of it right next to the translated one. */}
              <span>{levelProgress.required === 0 ? t('awards.maxLevel') : t('awards.xpToNext', { xp: (levelProgress.required - levelProgress.current).toLocaleString(i18n.language), n: level.level + 1 })}</span>
            </div>
          </div>
          <div className="relative flex gap-6 md:gap-7">
            <HeroStat value={totalUnlocked} label={t('awards.unlocked')} color="var(--color-gold-bright)" />
            <HeroStat value={total - totalUnlocked} label={t('awards.locked')} />
            <HeroStat value={diamondUnlocked} label={t('awards.diamond')} color={TIER_HEX.diamond} />
          </div>
        </section>

        {/* 2 — Next up */}
        {closest.length > 0 && (
          <section>
            <SectionTitle>{t('awards.closest')}</SectionTitle>
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
              {closest.map(({ a, p }) => (
                <div key={a.id} className="flex items-center gap-3.5 p-4 rounded-2xl border border-contrast/15 bg-surface"
                  data-testid={`next-up-${a.id}`}>
                  <ProgressRing percent={p} size={56} color={TIER_HEX[a.tier]}>
                    <span className="text-[1.3rem]">{a.icon}</span>
                  </ProgressRing>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate text-content">{achievementName(a, t)}</div>
                    <div className="text-[11.5px] text-content/40 leading-snug mt-0.5">{achievementDescription(a, t)}</div>
                    <div className="text-[0.75rem] font-semibold mt-1" style={{ color: TIER_HEX[a.tier] }}>{t('awards.percentComplete', { pct: p })}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 3 — Level roadmap */}
        <section>
          <SectionTitle>{t('awards.yourClimb', { n: level.level, total: LEVELS.length })}</SectionTitle>
          <LevelRoadmap currentLevel={level.level} />
        </section>

        {/* 4 — Collection */}
        <section>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <SectionTitle className="mb-0">{t('awards.collection')}</SectionTitle>
            <div className="flex items-center gap-3">
              <span className="text-xs text-content/40">{t('awards.percentComplete', { pct: overallPercent })}</span>
              <div className="flex gap-2">
                {(['all', 'unlocked', 'locked'] as FilterMode[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    data-testid={`filter-${f}`}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
                      ${filter === f ? 'bg-gold/20 text-gold border border-gold/40' : 'bg-contrast/5 text-content/50 border border-contrast/10 hover:text-content/70'}`}
                  >
                    {t(`awards.${f === 'all' ? 'all' : f === 'unlocked' ? 'unlocked' : 'locked'}`)}
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
                  <span className="text-lg">{CATEGORY_ICON[cat]}</span>
                  <span className="text-sm font-semibold text-content">{t(`awards.cat.${cat}`)}</span>
                  <ProgressBar
                    value={catDone}
                    max={catTotal}
                    height={4}
                    className="flex-1 max-w-[160px]"
                    label={t(`awards.cat.${cat}`)}
                  />
                  <span className="text-[0.75rem] text-content/40">{catDone}/{catTotal}</span>
                </div>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
                  {items.map(a => (
                    <Medal
                      key={a.id}
                      achievement={a}
                      unlocked={unlockedIds.includes(a.id)}
                      unlockedAt={unlockedMap.get(a.id)}
                      progress={progressOf(a)}
                      pinned={openId === a.id}
                      onToggle={() => setOpenId(id => (id === a.id ? null : a.id))}
                      onDismiss={() => setOpenId(id => (id === a.id ? null : id))}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <EmptyState
              icon={filter === 'unlocked' ? Lock : Trophy}
              title={filter === 'unlocked' ? t('awards.noneUnlocked') : t('awards.allUnlocked')}
            />
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
      <div className="text-[0.6875rem] tracking-[0.1em] uppercase text-content/40">{label}</div>
    </div>
  )
}

/** Small uppercase section heading. */
function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-xs font-bold tracking-[0.1em] uppercase text-content/50 mb-3 ${className}`}>{children}</h2>
}

/** The 25-level journey as a horizontally scrollable track, scrolled to current. */
function LevelRoadmap({ currentLevel }: { currentLevel: number }) {
  const { t } = useTranslation()
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
    // Twenty-five levels do not fit, so the strip opens on the current one —
    // mid-scroll, with a name cut in half at the left edge ("artenfan") and
    // nothing to say there was more. Both edges fade out now, which is what
    // says "this continues", and the row is padded by the width of the fade so
    // the first and the last level can still be scrolled clear of it.
    <div className="surface py-5">
      <div
        className="overflow-x-auto overflow-y-hidden"
        ref={scrollRef}
        data-testid="level-roadmap"
        style={{
          maskImage: 'linear-gradient(90deg, transparent, #000 44px, #000 calc(100% - 44px), transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 44px, #000 calc(100% - 44px), transparent)',
        }}
      >
      <div className="relative min-w-max px-11 pb-1">
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
                      ? { background: 'var(--color-gold)', borderColor: 'var(--color-gold)', color: 'var(--color-on-gold)' }
                      : current
                        // 8%, not 25%: the numeral is the level's own colour
                        // sitting on a wash of that same colour, and at 25% it
                        // measured 3.75:1. The ring keeps its 25% — it is
                        // decoration, not a ground for text.
                        ? { background: `color-mix(in srgb, ${l.color} 8%, var(--color-surface))`, borderColor: l.color, color: l.color, boxShadow: `0 0 0 4px color-mix(in srgb, ${l.color} 25%, transparent)` }
                        : { background: 'var(--color-surface-2)', borderColor: 'var(--color-line-strong, rgba(255,255,255,.14))', color: 'var(--color-content)', opacity: 0.5 }
                  }
                >
                  {done ? '✓' : l.level}
                </div>
                <div className={`text-[10.5px] text-center leading-tight ${current ? 'font-bold' : 'text-content/50'}`}
                  style={current ? { color: l.color } : undefined}>
                  {t(l.titleKey)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      </div>
    </div>
  )
}

/** Space kept between the description and the edge of the screen. */
const POPOVER_MARGIN = 8

/**
 * A single achievement rendered as a collectible medal.
 *
 * The medal is a button and its description a popover the medal owns. It
 * used to be a hover tooltip — `whitespace-nowrap`, some 440px of it, laid
 * out invisibly beside every medal: on a phone the page scrolled 190px
 * sideways into nothing, and a tap showed nothing at all, because a finger
 * does not hover. Now a tap or a click pins the description open, the mouse
 * and the keyboard's focus ring still show it in passing, and it is only in
 * the document while it is shown, wrapped to at most 260px and moved
 * sideways until it sits inside the screen.
 *
 * @param pinned - Whether this medal's description is pinned open
 * @param onToggle - Pin or unpin it (a tap, a click, Enter)
 * @param onDismiss - Unpin it (Escape, a press anywhere else)
 */
function Medal({ achievement, unlocked, unlockedAt, progress, pinned, onToggle, onDismiss }: {
  achievement: Achievement
  unlocked: boolean
  unlockedAt?: number
  progress: number
  pinned: boolean
  onToggle: () => void
  onDismiss: () => void
}) {
  const { t, i18n } = useTranslation()
  const tc = TIER_HEX[achievement.tier]
  const name = achievementName(achievement, t)
  const desc = achievementDescription(achievement, t)
  const title = unlocked
    ? t('awards.unlockedOn', { name, desc, date: unlockedAt ? formatDate(unlockedAt, i18n.language) : '' })
    : t('awards.inProgress', { name, desc, pct: Math.round(progress) })

  // How far along a locked award is, where that can be measured at all.
  const ring = unlocked ? null : medalProgress(achievement, progress)

  const popoverId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLSpanElement>(null)
  // Passing interest: a mouse over the medal, or the keyboard's focus on it.
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const open = pinned || hovered || focused

  // Keep it on the screen. Centred over an 84px medal, a 260px box runs off
  // the side for the first and the last medal of every row on a phone.
  useLayoutEffect(() => {
    const pop = popoverRef.current
    if (!open || !pop) return
    pop.style.setProperty('--shift', '0px')
    const box = pop.getBoundingClientRect()
    const width = document.documentElement.clientWidth
    let shift = 0
    if (box.left < POPOVER_MARGIN) shift = POPOVER_MARGIN - box.left
    else if (box.right > width - POPOVER_MARGIN) shift = width - POPOVER_MARGIN - box.right
    pop.style.setProperty('--shift', `${Math.round(shift)}px`)
  }, [open, title])

  useEffect(() => {
    if (!pinned) return
    const onDown = (e: PointerEvent) => {
      if (!buttonRef.current?.contains(e.target as Node)) onDismiss()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss() }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pinned, onDismiss])

  return (
    // `relative` is load-bearing, not styling: the sr-only span and the
    // popover below are absolutely positioned, so without a positioned
    // ancestor they resolve against <html> and their static offset (far down a
    // long list) inflates the document's scroll height — the page then scrolls
    // past its own content into empty space, next to the real scrollbar of the
    // app shell.
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      // A finger also fires the mouse-compatible enter, and never the leave:
      // only a real mouse counts as hovering.
      onPointerEnter={e => { if (e.pointerType === 'mouse') setHovered(true) }}
      onPointerLeave={() => setHovered(false)}
      onFocus={e => {
        // Only the keyboard's focus. A click focuses the button too, and the
        // second click must be able to close what the first one opened.
        let viaKeyboard = false
        try { viaKeyboard = e.currentTarget.matches(':focus-visible') } catch { /* selector unknown */ }
        setFocused(viaKeyboard)
      }}
      onBlur={() => setFocused(false)}
      aria-expanded={open}
      aria-describedby={open ? popoverId : undefined}
      className="relative block w-full text-center cursor-pointer rounded-xl py-1
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      data-testid={`achievement-card-${achievement.id}`}
    >
      <span
        className="relative grid w-14 h-14 mx-auto rounded-full place-items-center text-[1.5rem] border-2"
        style={
          unlocked
            ? { borderColor: tc, background: `radial-gradient(circle at 50% 35%, color-mix(in srgb, ${tc} 22%, var(--color-surface)), var(--color-surface))`, boxShadow: `0 0 14px -4px color-mix(in srgb, ${tc} 55%, transparent)` }
            : { borderColor: 'var(--color-line-strong, rgba(255,255,255,.14))', background: 'var(--color-surface-2)' }
        }
      >
        <span style={unlocked ? undefined : { filter: 'grayscale(1)', opacity: 0.45 }}>{achievement.icon}</span>
        {/* The medal's own rim, filled as far as the award is earned. No
            number: that stays in the description a tap opens. Decorative for
            a screen reader, which is read the percentage below. */}
        {ring != null && ring > 0 && (
          <svg
            aria-hidden="true"
            data-testid={`medal-ring-${achievement.id}`}
            data-percent={Math.round(ring)}
            className="absolute -inset-0.5 -rotate-90 pointer-events-none"
            viewBox="0 0 56 56"
          >
            <circle
              cx="28" cy="28" r="27" fill="none" stroke={tc} strokeWidth="2" strokeLinecap="round"
              pathLength={100} strokeDasharray={`${ring} 100`} opacity={0.9}
            />
          </svg>
        )}
      </span>
      <span className={`block text-[0.6875rem] mt-1.5 leading-tight ${unlocked ? 'text-content/70' : 'text-content/35'}`}>
        {name}
      </span>
      {unlocked
        ? <span className="sr-only" data-testid={`unlocked-date-${achievement.id}`}>{unlockedAt ? formatDate(unlockedAt, i18n.language) : t('awards.unknownDate')}</span>
        : <span className="sr-only" data-testid={`progress-${achievement.id}`}>{Math.round(progress)}%</span>}
      {open && (
        <span
          ref={popoverRef}
          id={popoverId}
          role="tooltip"
          data-testid={`achievement-popover-${achievement.id}`}
          className="pointer-events-none absolute bottom-full left-1/2 mb-1 z-50 block w-max max-w-[min(80vw,260px)]
            whitespace-normal text-left rounded-lg border px-2.5 py-1.5 text-xs font-medium leading-snug text-content shadow-lg"
          style={{
            transform: 'translateX(calc(-50% + var(--shift, 0px)))',
            backgroundColor: 'var(--color-tooltip-bg)',
            borderColor: 'var(--color-tooltip-border)',
          }}
        >
          {title}
        </span>
      )}
    </button>
  )
}
