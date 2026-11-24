import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Award, Check, Crosshair, RotateCcw, Sparkles, Target, Trophy, X } from 'lucide-react'
import { useStatsStore } from '../../store/stats-store'
import { useLevelStore, type AwardLine, type XpAward } from '../../store/level-store'
import { useAchievementStore } from '../../store/achievement-store'
import { useIsPro } from '../../store/entitlement-store'
import { ALL_ACHIEVEMENTS, achievementDescription, achievementName } from '../../services/achievements/achievement-list'
import { achievementEngine } from '../../services/achievements/achievement-engine'
import { computeLifetimeStats } from '../../services/storage/storage-service'
import { claimedStageIds, getReadStages } from '../../services/curriculum'
import type { TrainingMode } from '../../services/stats-types'
import type { Achievement } from '../../services/achievements/achievement-types'
import { formatPercent } from './deviation-utils'
import { ResultTrail } from './FlashPanel'
import type { RoundCapture } from './round-capture'
import {
  compareWithBest,
  nearestAward,
  recordedRound,
  roundPercent,
  roundVerdict,
  stageLine,
  xpFill,
  type BestComparison,
  type NearestAward,
  type RoundScore,
  type StageLine,
  type XpFill,
} from './round-summary-model'

/**
 * One answer the round got wrong, as the summary lists it. Plain strings, so
 * any mode can fill it: a flashcard ("Hard 16 vs 10", "TC +2", Hit → Stand),
 * a bet ("TC +3", 2 units → 4 units), a deck estimate (3.5 → 4 decks).
 */
export interface SummaryMiss {
  /** Stable key within the round. */
  id: string
  /** The spot, in the reader's language. */
  spot: string
  /** A short tag beside it, e.g. the true count. */
  tag?: string
  /** What was answered; struck through. Omit when there is nothing to show. */
  chosen?: string
  /** The right answer. */
  right: string
}

/** A way to drill just the missed spots — only for a mode that can. */
export interface SummaryDrill {
  label: string
  onDrill: () => void
}

/** Props of {@link RoundSummary}. */
export interface RoundSummaryProps {
  /** The mode the round was played in: decides the best, the plan stage and the awards. */
  mode: TrainingMode
  /** Right answers out of all answers. */
  score: RoundScore
  /** Taken by `captureRound` as the round ended; null shows the round without history. */
  capture: RoundCapture | null
  /** Right/wrong per answer, in order, for the trail under the score. */
  trail?: readonly (boolean | null)[]
  /** One or two small figures under the score ("Best streak 7"). */
  figures?: readonly { label: string; value: ReactNode }[]
  /** The misses, in the order they happened. */
  misses: readonly SummaryMiss[]
  /** Something mode-specific above the misses (a focus round's per-hand results). */
  aside?: ReactNode
  /** "Drill these" — passed only when the mode can start a round on just the misses. */
  drill?: SummaryDrill | null
  onAgain: () => void
  /** Label of the primary button; "Again" when omitted. */
  againLabel?: string
  /** Test id of the primary button; `summary-again` when omitted. */
  againTestId?: string
  onBack: () => void
  /** Label of the way back; "Back" when omitted. */
  backLabel?: string
}

/** The smallest share of the level bar an award above zero is drawn with. */
const MIN_GAIN = 0.015

/** How many misses are listed before "and N more". */
const MISSES_SHOWN = 6

/** How many unlocked awards are named before "and N more". */
const UNLOCKS_SHOWN = 3

/**
 * Up to this many misses, the plan stage and the next award sit under them in
 * the right panel; with more, they move to the middle panel. A round with six
 * misses and both blocks in one panel ran under the buttons at 720 px.
 */
const PROGRESS_BESIDE_MISSES = 3

/**
 * The motion, from motion-craft's tables (`motion-tokens.md`):
 *
 *  - The sheet arrives once: an 12 px rise over 240 ms, Carbon *productive
 *    entrance* — transform only, as the flashcard verdict (an opacity fade
 *    measured a flicker at its end there).
 *  - The XP bar and its number move together after it: 600 ms, Carbon
 *    *expressive standard* — this is the one moment on the screen that is a
 *    reward, so it is allowed to be seen. A bar is spatial but it carries a
 *    value, so no overshoot: a bar that fills past the XP earned and returns
 *    would say something false. 240 + 600 = 840 ms, under a second.
 *  - Reduced motion: the final state, nothing travels.
 */
const ENTER = { duration: 0.24, ease: [0, 0, 0.38, 0.9] as const }
const FILL = { duration: 0.6, delay: 0.24, ease: [0.4, 0.14, 0.3, 1] as const }

/**
 * The end of a drill round, laid out landscape: the score against your own
 * best on the left, what the round earned in the middle (XP filling the level
 * bar, the plan stage it moved, the nearest award), the misses with the right
 * answers on the right, and the way on at the foot. On a phone the same parts
 * stack into one sheet with "Again" pinned above the cookie bar.
 *
 * The XP and the awards the round unlocked are shown here, in the moment that
 * earned them — so neither toast announces them as well (`captureRound`
 * claims both, this releases them on the way out, as seen). Anything else
 * still arrives as a toast in its corner.
 *
 * ## It fits on one screen
 *
 * Landscape, the three panels and the buttons fit the owner's 2000×720 with
 * no scrolling in the worst case (a perfect round with a new best, five XP
 * parts, unlocked awards, the plan stage and the next award, in German).
 * The panels split the content by question — *how did I do* (left), *what
 * did I get* (middle), *what next* (right: the misses, then the plan stage
 * and the next award) — so a round without misses does not leave a column
 * empty and a round with six does not push anything under the footer.
 *
 * Every figure is derived from what is already recorded — the sessions, the
 * level store's last award, the plan's own stage counting, the award engine —
 * nothing new is stored.
 */
export function RoundSummary({
  mode, score, capture, trail, figures, misses, aside, drill, onAgain, againLabel, againTestId, onBack, backLabel,
}: RoundSummaryProps) {
  const { t, i18n } = useTranslation()
  const reduced = useReducedMotion() ?? false
  const sessions = useStatsStore(s => s.sessions)
  const lifetimeStats = useStatsStore(s => s.lifetimeStats)
  const lastAward = useLevelStore(s => s.lastAward)
  const totalXP = useLevelStore(s => s.totalXP)
  const unlockedIds = useAchievementStore(s => s.unlockedIds)
  const isPro = useIsPro()

  // The awards this round unlocked, by name: unlocked now, not before it.
  const unlocked = useMemo<Achievement[]>(
    () => (capture ? ALL_ACHIEVEMENTS.filter(a => unlockedIds.includes(a.id) && !capture.unlockedBefore.has(a.id)) : []),
    [capture, unlockedIds],
  )
  const shownUnlocks = useRef<string[]>([])
  useEffect(() => { shownUnlocks.current = unlocked.map(a => a.id) }, [unlocked])

  // The XP and the unlocks are shown here, not in toasts — for as long as
  // this is on screen. On the way out the unlocks shown here leave the toast
  // queue, so they are not announced a second time.
  useEffect(() => {
    useLevelStore.getState().holdAwardInPlace()
    useAchievementStore.getState().holdUnlocksInPlace()
    return () => {
      useLevelStore.getState().releaseAwardInPlace()
      useAchievementStore.getState().releaseUnlocksInPlace(shownUnlocks.current)
    }
  }, [])

  const award: XpAward | null = capture && lastAward && lastAward.id > capture.awardSince ? lastAward : null
  const fill = xpFill(totalXP, award?.amount ?? 0)

  const session = capture ? recordedRound(sessions, capture.sessionIds, mode) : null
  const earlier = useMemo(
    () => (capture ? sessions.filter(s => capture.sessionIds.has(s.id)) : []),
    [sessions, capture],
  )
  const best = capture ? compareWithBest(score, mode, earlier) : null
  const stage = capture ? stageLine(capture.stage, session, sessions, getReadStages(), isPro, claimedStageIds()) : null

  const next = useMemo<NearestAward | null>(() => {
    if (!capture || !lifetimeStats) return null
    const streak = useStatsStore.getState().getTrainingStreak()
    const earlierStats = computeLifetimeStats(earlier)
    return nearestAward(
      ALL_ACHIEVEMENTS.map(a => ({
        achievement: a,
        unlocked: unlockedIds.includes(a.id),
        percent: achievementEngine.getProgress(a, lifetimeStats, streak, sessions),
        before: achievementEngine.getProgress(a, earlierStats, streak, earlier),
      })),
      mode,
    )
  }, [capture, lifetimeStats, earlier, sessions, unlockedIds, mode])

  const progressRight = misses.length <= PROGRESS_BESIDE_MISSES && !aside
  const progress = (stage || next) ? (
    <div className="mt-auto flex flex-col gap-3 pt-3.5 border-t border-contrast/8" data-testid="summary-progress">
      {stage && <StageBlock stage={stage} />}
      {next && <AwardBlock next={next} />}
    </div>
  ) : null

  const pct = roundPercent(score)
  const verdict = roundVerdict(score, mode)
  const tone = pct >= 85 ? 'text-success' : pct >= 60 ? 'text-gold-bright' : 'text-error'
  const toneBg = pct >= 85 ? 'bg-success' : pct >= 60 ? 'bg-gold-bright' : 'bg-error'

  return (
    <div className="flex-1 min-h-0 flex flex-col px-3 sm:px-5 lg:px-8 pt-2 lg:pt-3" data-testid="round-summary">
      <motion.div
        className="relative mx-auto w-full max-w-[90rem] flex-1 min-h-0 flex flex-col lg:justify-center"
        initial={reduced ? false : { y: 12 }}
        animate={{ y: 0 }}
        transition={ENTER}
      >
        {/* A phone scrolls this and keeps the buttons pinned under it; a desk
            sizes the three panels to their content and centres panels and
            buttons together, so a tall screen does not get three tall, empty
            cards with the way on far below them. */}
        <div className="flex-1 lg:flex-initial min-h-0 overflow-y-auto pb-4 lg:pb-0" data-testid="summary-scroll">
          {/* `grid-cols-1` is `minmax(0, 1fr)`: without it the one phone column
              is as wide as its widest unbreakable line — an award's truncated
              description — and every panel ran 18px off a 390px screen. */}
          <div className="grid grid-cols-1 gap-3 lg:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)] max-w-xl lg:max-w-none mx-auto">
            {/* ── Left: how the round went ── */}
            <section className="order-1 lg:order-none surface p-5 flex flex-col gap-3.5 lg:gap-3 min-h-0" aria-labelledby="summary-title" data-testid="summary-panel">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="summary-title" className="text-lg font-extrabold text-gold-gradient leading-tight" data-testid="summary-title">
                  {t('training.summary.title')}
                </h2>
                {verdict && (
                  <span className={`text-sm font-bold ${tone}`} data-testid="summary-verdict">{t(`training.summary.verdict.${verdict}`)}</span>
                )}
              </div>
              {/* The figures sit beside the score, not under it: one row less. */}
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <div className={`text-7xl lg:text-6xl [@media(min-height:821px)]:xl:text-7xl font-extrabold tabular-nums leading-none tracking-tight ${tone}`} data-testid="summary-score">
                    {formatPercent(pct / 100, i18n.language)}
                  </div>
                  <p className="mt-2 text-sm text-content/60 tabular-nums">
                    {t('training.summary.rightOf', { n: score.correct, total: score.total })}
                  </p>
                </div>
                {figures && figures.length > 0 && (
                  <dl className="flex gap-5 shrink-0 text-right" data-testid="summary-figures">
                    {figures.map(f => (
                      <div key={f.label}>
                        <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/45">{f.label}</dt>
                        <dd className="text-2xl font-bold text-content tabular-nums leading-tight">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
              {trail && <ResultTrail total={trail.length} results={trail} index={null} />}
              {best && <BestLine best={best} pct={pct} toneBg={toneBg} />}
            </section>

            {/* ── Middle: what the round earned ── */}
            <section className="order-3 lg:order-none surface p-5 flex flex-col gap-3.5 lg:gap-3 min-h-0" aria-label={t('training.summary.earned')} data-testid="summary-panel">
              <XpBlock award={award} fill={fill} reduced={reduced} hasCapture={capture !== null} />
              {unlocked.length > 0 && <UnlockedBlock unlocked={unlocked} max={progressRight || !progress ? UNLOCKS_SHOWN : 2} />}
              {!progressRight && progress}
            </section>

            {/* ── Right: what next — the misses, then the plan and the next award ── */}
            {/* On a phone this comes right after the score: the misses are what
                to learn from, and the reward is one scroll further. */}
            <section className="order-2 lg:order-none surface p-5 flex flex-col gap-3.5 lg:gap-3 min-h-0" aria-label={t('training.summary.missesTitle')} data-testid="summary-panel">
              {aside}
              <MissList misses={misses} />
              {progressRight && progress}
            </section>
          </div>
        </div>

        {/* ── The way on. Pinned at the foot on a phone, above the cookie bar. ── */}
        <div
          className="shrink-0 sticky bottom-0 z-10 -mx-3 sm:-mx-5 lg:mx-0 px-3 sm:px-5 lg:px-0 pt-3 lg:pt-4
            pb-[calc(0.75rem+var(--cookie-bar,0px))] lg:pb-[calc(1.25rem+var(--cookie-bar,0px))]
            bg-casino-bg/95 lg:bg-transparent border-t border-contrast/8 lg:border-0"
        >
          {/* Phone: "Again" across the full width, the two quieter ways side by
              side under it. Desk: one row, back at the left end, "Again" at
              the right. */}
          <div className="max-w-xl lg:max-w-none mx-auto grid grid-cols-2 gap-2 lg:flex lg:items-center lg:gap-3">
            <button
              type="button"
              onClick={onBack}
              data-testid="back-to-settings"
              className={`order-2 lg:order-none h-10 lg:h-12 px-2 lg:px-4 whitespace-nowrap rounded-xl inline-flex items-center justify-center gap-2 text-sm font-semibold text-content/60 hover:text-content transition-colors cursor-pointer lg:mr-auto ${drill ? '' : 'col-span-2'}`}
            >
              <ArrowLeft size={16} aria-hidden className="max-lg:hidden" />
              {backLabel ?? t('training.summary.back')}
            </button>
            {drill && (
              <button
                type="button"
                onClick={drill.onDrill}
                data-testid="drill-misses"
                className="order-3 lg:order-none h-10 lg:h-12 px-2 lg:px-5 whitespace-nowrap rounded-xl inline-flex items-center justify-center gap-2 text-sm font-semibold text-content bg-contrast/8 hover:bg-contrast/12 border border-contrast/15 transition-colors cursor-pointer"
              >
                <Crosshair size={16} aria-hidden className="text-gold" />
                {drill.label}
              </button>
            )}
            <button
              type="button"
              onClick={onAgain}
              data-testid={againTestId ?? 'summary-again'}
              // The way on is the strongest thing on the screen, and it says so
              // on every size: full width on a phone, the right end on a desk.
              className="order-1 lg:order-none col-span-2 lift-glow h-12 lg:min-w-[14rem] px-6 rounded-xl inline-flex items-center justify-center gap-2.5 text-base font-bold text-on-gold
                bg-gradient-to-b from-gold-bright to-gold border border-gold/50 shadow-[0_10px_30px_-12px_var(--color-gold)] cursor-pointer"
            >
              <RotateCcw size={17} strokeWidth={2.5} aria-hidden />
              {againLabel ?? t('training.summary.again')}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/**
 * The round against the best earlier round of the mode: two bars on one
 * scale (this round, your best) when there is a best, and one line that says
 * what they mean.
 */
function BestLine({ best, pct, toneBg }: { best: BestComparison; pct: number; toneBg: string }) {
  const { t, i18n } = useTranslation()
  const pc = (n: number) => formatPercent(n / 100, i18n.language)
  const previous = best.kind === 'first' ? null : best.previous
  const bars = previous === null ? null : (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-xs" data-testid="summary-best-bars">
      <dt className="text-content/55">{t('training.summary.thisRound')}</dt>
      <dd className="h-2 rounded-full bg-contrast/10 overflow-hidden" aria-hidden>
        <div className={`h-full origin-left ${toneBg}`} style={{ transform: `scaleX(${pct / 100})` }} />
      </dd>
      <dd className="font-bold tabular-nums text-content text-right">{pc(pct)}</dd>
      <dt className="text-content/55">{t('training.summary.yourBest')}</dt>
      <dd className="h-2 rounded-full bg-contrast/10 overflow-hidden" aria-hidden>
        <div className="h-full origin-left bg-contrast/40" style={{ transform: `scaleX(${previous / 100})` }} />
      </dd>
      <dd className="font-semibold tabular-nums text-content/70 text-right">{pc(previous)}</dd>
    </dl>
  )
  if (best.kind === 'new') {
    return (
      <div className="flex flex-col gap-2.5">
        {bars}
        <p className="inline-flex items-center gap-2 self-start rounded-lg px-3 py-1 text-sm font-semibold text-gold-bright bg-gold/10 border border-gold/30" data-testid="summary-best" data-best="new">
          <Trophy size={15} aria-hidden />
          {t('training.summary.best.new', { gain: best.gain, previous: pc(best.previous) })}
        </p>
      </div>
    )
  }
  const text = best.kind === 'first'
    ? t('training.summary.best.first')
    : best.kind === 'equal'
      ? t('training.summary.best.equal')
      : best.kind === 'below'
        ? t('training.summary.best.below', { count: best.gap })
        : best.previous === null ? t('training.summary.best.shortNone') : t('training.summary.best.short', { previous: pc(best.previous) })
  return (
    <div className="flex flex-col gap-2.5">
      {best.kind !== 'short' && bars}
      <p className="text-sm text-content/65 leading-snug" data-testid="summary-best" data-best={best.kind}>{text}</p>
    </div>
  )
}

/** The XP of the round, ticking up while it fills the level bar. */
function XpBlock({ award, fill, reduced, hasCapture }: { award: XpAward | null; fill: XpFill; reduced: boolean; hasCapture: boolean }) {
  const { t, i18n } = useTranslation()
  const amount = award?.amount ?? 0
  // A round's XP can be a sliver of a level (14 of 4,200): drawn to scale it
  // would be under a pixel, and the fill would show nothing. The earned part
  // gets at least a visible notch; the numbers beside it stay exact.
  const from = fill.from
  const to = amount > 0 && !fill.leveledUp ? Math.min(1, Math.max(fill.to, from + MIN_GAIN)) : fill.to

  // One clock for the number and the bar: the bar is driven by the number,
  // so the two cannot drift apart (measured: as two animations they started
  // ~100 ms apart). A payout that joins the award later (a finished stage,
  // an instant after) carries on from where the count stands.
  const shown = useMotionValue(reduced ? amount : 0)
  const scale = useMotionValue(reduced ? to : from)
  const text = useTransform(shown, v => `+${Math.round(v).toLocaleString(i18n.language)}`)
  useEffect(() => {
    const paint = (v: number) => scale.set(from + (to - from) * (amount > 0 ? Math.min(1, v / amount) : 1))
    if (reduced) {
      shown.set(amount)
      paint(amount)
      return
    }
    const first = shown.get() === 0
    const controls = animate(shown, amount, { ...FILL, delay: first ? FILL.delay : 0, onUpdate: paint })
    return () => controls.stop()
  }, [amount, from, to, reduced, shown, scale])

  // Every part, not the toast's three: there is room here, and a folded
  // "Other +80" hides the personal best that is the point of the round.
  const lines: AwardLine[] = award && award.labelKey == null
    ? [...award.parts.map(p => ({ ...p })), ...(award.noteKey ? [{ labelKey: award.noteKey }] : [])]
    : []
  const capped = award && award.amount === 0
  const nf = (n: number) => n.toLocaleString(i18n.language)

  return (
    <div data-testid="summary-xp">
      <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/50">{t('training.summary.earned')}</span>
      <div className="mt-1 flex items-baseline gap-2">
        <motion.span aria-hidden className="text-5xl lg:text-[2.5rem] font-extrabold text-gold tabular-nums leading-none tracking-tight">{text}</motion.span>
        <span aria-hidden className="text-lg font-bold text-gold/80">{'XP'}</span>
        {/* The figure a screen reader gets, and a test can read: the final one. */}
        <span className="sr-only" data-testid="summary-xp-amount">{t('training.summary.xpAmount', { n: amount })}</span>
      </div>
      {lines.length > 0 ? (
        // Two columns, amounts aligned, so five parts read as a short
        // list rather than one run-on line.
        <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-content/55" data-testid="summary-xp-parts">
          {lines.map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 tabular-nums">
              <span className="truncate">{t(l.labelKey, l.labelParams)}</span>
              {l.amount != null && <span className="shrink-0 text-content/80">+{nf(l.amount)}</span>}
            </li>
          ))}
        </ul>
      ) : award ? (
        <p className="mt-2 text-xs text-content/55">{capped ? t('xp.source.dailyCap') : t(award.labelKey ?? 'xp.source.session', award.labelParams)}</p>
      ) : hasCapture ? (
        <p className="mt-2 text-xs text-content/55">{t('training.summary.xpNone')}</p>
      ) : null}

      {/* The level bar: what was there, and what this round added. */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-bold tabular-nums" style={{ color: fill.level.color }}>
            {t('training.summary.level', { n: fill.level.level })} <span className="font-semibold text-content/70">{t(fill.level.titleKey)}</span>
          </span>
          <span className="text-xs text-content/55 tabular-nums" data-testid="summary-to-next">
            {fill.leveledUp
              ? t('training.summary.levelUp', { n: fill.level.level })
              : fill.next ? t('training.summary.toNext', { xp: nf(fill.toNext), n: fill.next.level }) : t('training.summary.topLevel')}
          </span>
        </div>
        <div
          className="relative mt-2 h-3 rounded-full overflow-hidden bg-contrast/10"
          style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.45)' }}
          role="progressbar"
          aria-label={t('training.summary.levelBar')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fill.to * 100)}
          data-testid="summary-level-bar"
          data-from={fill.from.toFixed(3)}
          data-to={fill.to.toFixed(3)}
        >
          {/* This round's part, under what was there before. */}
          <motion.div
            aria-hidden
            className="absolute inset-0 origin-left"
            style={{ scaleX: scale, background: 'linear-gradient(180deg, var(--color-gold-bright), var(--color-gold))' }}
          />
          <div
            aria-hidden
            className="absolute inset-0 origin-left bg-gold/40"
            style={{ transform: `scaleX(${from})` }}
          />
          <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.03) 52%, rgba(0,0,0,0.12))' }} />
        </div>
      </div>
    </div>
  )
}

/** The plan stage this round worked on: how many rounds are above its mark. */
function StageBlock({ stage }: { stage: StageLine }) {
  const { t, i18n } = useTranslation()
  const bar = formatPercent(stage.bar / 100, i18n.language)
  return (
    <div data-testid="summary-stage">
      <div className="flex items-baseline justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/50 min-w-0">
          <Target size={13} aria-hidden className="text-gold shrink-0" />
          <span className="truncate">{t('training.summary.stage.title', { stage: t(stage.titleKey) })}</span>
        </span>
        {(stage.done || stage.roundCleared) && (
          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-success" data-testid="summary-stage-round">
            <Check size={13} strokeWidth={3} aria-hidden />
            {stage.done ? t('training.summary.stage.done') : t('training.summary.stage.counted')}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm font-semibold text-content tabular-nums leading-snug" data-testid="summary-stage-count">
        {t('training.summary.stage.count', { n: stage.cleared, total: stage.target, bar })}
        <span className="font-normal text-content/50"> · {t('training.summary.stage.days', { days: stage.days, total: stage.targetDays })}</span>
      </p>
      <div className="mt-1.5 flex gap-1" aria-hidden>
        {Array.from({ length: stage.target }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < stage.cleared ? 'bg-gold' : 'bg-contrast/12'}`} />
        ))}
      </div>
    </div>
  )
}

/**
 * The locked award closest to unlocking, and what this round added to it —
 * one row: the medal, the name (its description as the hover title and for
 * screen readers), the count in the award's own unit and a thin bar.
 */
function AwardBlock({ next }: { next: NearestAward }) {
  const { t, i18n } = useTranslation()
  const nf = (n: number) => n.toLocaleString(i18n.language)
  const desc = achievementDescription(next.achievement, t)
  return (
    <div data-testid="summary-award">
      <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/50">
        <Sparkles size={13} aria-hidden className="text-gold" />
        {t('training.summary.award.title')}
      </span>
      <div className="mt-1.5 flex items-center gap-2.5" title={desc}>
        <span aria-hidden className="grid place-items-center w-8 h-8 rounded-lg bg-contrast/6 border border-contrast/10 text-base shrink-0">{next.achievement.icon}</span>
        <div className="min-w-0 flex-1">
          {/* Wraps rather than cutting the name: on a phone the count goes under it. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-sm font-bold text-content min-w-0">
              {achievementName(next.achievement, t)}
              <span className="sr-only">{` — ${desc}`}</span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-content/60">
              {next.gain > 0 && <span className="text-gold-bright font-semibold">{t('training.summary.award.gain', { n: nf(next.gain) })} · </span>}
              <span data-testid="summary-award-count">{nf(next.current)}{' / '}{nf(next.target)}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-contrast/10 overflow-hidden" aria-hidden>
            <div className="h-full origin-left bg-gold/80" style={{ transform: `scaleX(${next.percent / 100})` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The awards this round unlocked, by name — the summary is the moment that
 * earned them, so they are told here rather than in a toast over it.
 */
function UnlockedBlock({ unlocked, max }: { unlocked: readonly Achievement[]; max: number }) {
  const { t } = useTranslation()
  const more = unlocked.length - max
  return (
    <div className="pt-3.5 border-t border-contrast/8" data-testid="summary-unlocked">
      <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-gold">
        <Award size={13} aria-hidden />
        {t('training.summary.unlocked', { count: unlocked.length })}
      </span>
      {/* One line per award — the name, then what it was for — so a round
          that unlocks several still fits above the buttons. */}
      <ul className="mt-1.5 flex flex-col gap-1">
        {unlocked.slice(0, max).map(a => (
          <li key={a.id} className="flex items-center gap-2 min-w-0 text-sm" data-testid="summary-unlocked-award" title={achievementDescription(a, t)}>
            <span aria-hidden className="grid place-items-center w-6 h-6 rounded-md bg-gold/10 border border-gold/30 text-xs shrink-0">{a.icon}</span>
            <span className="font-bold text-content shrink-0 max-w-[60%] truncate">{achievementName(a, t)}</span>
            <span className="min-w-0 truncate text-xs text-content/55">{achievementDescription(a, t)}</span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="mt-1.5 text-xs text-content/45">{t('training.summary.moreUnlocked', { count: more })}</p>}
    </div>
  )
}

/** The misses with the right answers — or, for a clean round, the fact. */
function MissList({ misses }: { misses: readonly SummaryMiss[] }) {
  const { t } = useTranslation()
  if (misses.length === 0) {
    return (
      // One row, not a hollow panel: the plan and the next award use the room.
      <div className="flex items-center gap-3" data-testid="summary-no-misses">
        <span className="grid place-items-center w-10 h-10 rounded-full bg-success/12 border border-success/35 text-success shrink-0">
          <Check size={20} strokeWidth={3} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold text-content leading-tight">{t('training.summary.noMisses')}</p>
          <p className="text-sm text-content/55">{t('training.summary.noMissesSub')}</p>
        </div>
      </div>
    )
  }
  const more = misses.length - MISSES_SHOWN
  return (
    <div className="flex flex-col" data-testid="flash-misses">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/50">
        {t('training.summary.missesCount', { count: misses.length })}
      </span>
      <ul className="mt-1 divide-y divide-contrast/8">
        {misses.slice(0, MISSES_SHOWN).map(m => (
          <li key={m.id} className="flex items-start gap-2.5 py-2 text-sm" data-testid="summary-miss">
            <span className="mt-px grid place-items-center w-5 h-5 rounded-full shrink-0 bg-error/15 text-error">
              <X size={12} strokeWidth={3.5} aria-hidden />
            </span>
            {/* The spot wraps rather than truncates: it is the thing to learn. */}
            <span className="min-w-0 flex-1 font-semibold text-content/90 tabular-nums leading-snug">
              {m.spot}
              {m.tag && <span className="ml-2 whitespace-nowrap text-[0.6875rem] font-bold text-gold-bright/80">{m.tag}</span>}
            </span>
            <span className="shrink-0 inline-flex items-baseline gap-1.5 text-xs leading-5">
              {m.chosen && <s className="text-error/75">{m.chosen}</s>}
              <span aria-hidden className="text-content/35">{'→'}</span>
              <span className="font-bold text-success">{m.right}</span>
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="mt-2 text-xs text-content/45">{t('training.summary.moreMisses', { count: more })}</p>}
    </div>
  )
}
