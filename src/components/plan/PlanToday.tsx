import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BookOpen, Check, Club, Flame, Lock, Play, RotateCcw, Timer, X } from 'lucide-react'
import { CURRICULUM, stageIndex, type StageId, type StageProgress } from '../../services/curriculum'
import {
  DAY_OPTIONS,
  MINUTE_OPTIONS,
  type TimeBudget,
  type TrainingMinutes,
} from '../../services/learner-profile'
import type { BlockKind, DayPlan, PlanBlock, WeekPlan } from '../../services/daily-plan'
import type { AppMode } from '../../store/app-store'

const KIND_ICON: Record<BlockKind, typeof Play> = {
  read: BookOpen,
  warmup: RotateCcw,
  work: Play,
  table: Club,
}

/** A stage's title by id. */
function useStageTitle(): (id: StageId) => string {
  const { t } = useTranslation()
  return id => t(CURRICULUM[stageIndex(id)].titleKey)
}

/**
 * How often and how long — the two numbers the plan is cut to.
 *
 * Two rows of plain buttons rather than four named paces: "a couple of times
 * a week" hid a number, and a learner who trains on Sundays only could not
 * say so.
 */
export function TimeBudgetPicker({
  budget,
  onChange,
}: {
  budget: TimeBudget
  onChange: (next: TimeBudget) => void
}) {
  const { t } = useTranslation()
  const chip = (selected: boolean) =>
    `min-w-11 h-11 px-3 rounded-xl border text-[0.95rem] font-semibold tabular-nums cursor-pointer transition-colors ${
      selected
        ? 'border-gold/60 bg-gold/15 text-gold'
        : 'border-contrast/12 text-content/70 hover:border-gold/35 hover:text-content'
    }`

  return (
    <div data-testid="time-budget">
      <h3 className="text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-content/40">
        {t('plan.time.daysHeading')}
      </h3>
      <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label={t('plan.time.daysHeading')}>
        {DAY_OPTIONS.map(d => (
          <button
            key={d}
            onClick={() => onChange({ ...budget, daysPerWeek: d })}
            aria-pressed={budget.daysPerWeek === d}
            data-testid={`budget-days-${d}`}
            className={chip(budget.daysPerWeek === d)}
          >
            {d}
          </button>
        ))}
      </div>

      <h3 className="mt-6 text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-content/40">
        {t('plan.time.minutesHeading')}
      </h3>
      <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label={t('plan.time.minutesHeading')}>
        {MINUTE_OPTIONS.map((m: TrainingMinutes) => (
          <button
            key={m}
            onClick={() => onChange({ ...budget, minutesPerDay: m })}
            aria-pressed={budget.minutesPerDay === m}
            data-testid={`budget-minutes-${m}`}
            className={chip(budget.minutesPerDay === m)}
          >
            {t('plan.today.minutes', { n: m })}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The second and last question before the app opens: how much time is there?
 *
 * Asked once. The answer travels with the account, so signing in on another
 * day or another device never asks it again; it stays editable in the plan.
 */
export function TimeQuestion({
  initial,
  weeks,
  onDone,
}: {
  initial: TimeBudget
  /** Weeks to the goal for a budget — shown live, so the choice has a visible consequence. */
  weeks: (budget: TimeBudget) => number
  onDone: (budget: TimeBudget) => void
}) {
  const { t } = useTranslation()
  const [budget, setBudget] = useState(initial)
  const n = weeks(budget)

  return (
    <div className="app-canvas flex-1 overflow-y-auto" data-testid="time-question">
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <span className="grid place-items-center w-11 h-11 rounded-xl text-gold bg-gold/10 border border-gold/20 mb-5">
          <Timer size={20} />
        </span>
        <h1 className="text-[1.75rem] md:text-4xl font-extrabold text-gold-gradient leading-[1.1] pb-1 tracking-tight">
          {t('plan.timeQuestion.heading')}
        </h1>
        <p className="mt-3 text-[0.95rem] text-content/55 leading-relaxed max-w-[52ch]">
          {t('plan.timeQuestion.sub')}
        </p>

        <div className="mt-8 surface rounded-2xl p-5 md:p-6">
          <TimeBudgetPicker budget={budget} onChange={setBudget} />
          {n > 0 && (
            <p className="mt-6 pt-5 border-t border-contrast/10 text-sm text-content/60" data-testid="time-question-forecast">
              {t('plan.forecast', { count: n })}
            </p>
          )}
        </div>

        <button
          onClick={() => onDone(budget)}
          data-testid="time-question-done"
          className="mt-8 inline-flex items-center gap-2.5 rounded-xl px-6 py-3.5 text-[1.0625rem] font-semibold
            bg-gradient-to-b from-gold-bright to-gold text-on-gold cursor-pointer"
        >
          {t('plan.timeQuestion.continue')} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}

/** Monday to Sunday as seven dots: trained, today, still to come. */
export function WeekDots({ week }: { week: WeekPlan }) {
  const { t } = useTranslation()
  const names = t('plan.week.dayNames', { returnObjects: true }) as string[]
  return (
    <div className="flex items-center gap-1.5" data-testid="plan-week" aria-label={t('plan.week.days', { trained: week.trained, target: week.target })}>
      {week.days.map((trained, i) => (
        <span key={i} className="flex flex-col items-center gap-1">
          <span
            className={`grid place-items-center w-6 h-6 rounded-full border text-[0.625rem] ${
              trained
                ? 'bg-gold border-gold text-on-gold'
                : i === week.todayIndex
                  ? 'border-gold/70 text-gold'
                  : 'border-contrast/15 text-transparent'
            }`}
            data-trained={trained}
          >
            {trained ? <Check size={12} strokeWidth={3} /> : '·'}
          </span>
          <span className={`text-[0.625rem] leading-none ${i === week.todayIndex ? 'text-gold' : 'text-content/35'}`}>
            {Array.isArray(names) ? names[i] : ''}
          </span>
        </span>
      ))}
    </div>
  )
}

/**
 * Today's blocks, one row each, and the one button that starts the next.
 *
 * A row can be started on its own — the order is a suggestion, and someone
 * who wants the table first should not have to argue with a list.
 */
export function TodayBlocks({
  day,
  week,
  weekStreak = 0,
  onOpen,
}: {
  day: DayPlan
  week: WeekPlan
  /**
   * Weeks in a row with the planned days kept. Shown from two — one kept week
   * is "Week done", which the line already says.
   */
  weekStreak?: number
  /** Start a block: the screen it is done on, and the block itself. */
  onOpen: (mode: AppMode, block: PlanBlock) => void
}) {
  const { t } = useTranslation()
  const title = useStageTitle()
  const name = (b: PlanBlock) => `${t(`plan.today.kind.${b.kind}`)} · ${title(b.stage)}`

  // Four runs of one drill are one line that says "4", not four identical
  // lines. Grouped wherever they sit in the day, in order of first appearance.
  const rows: { key: string; first: PlanBlock; blocks: PlanBlock[] }[] = []
  for (const b of day.blocks) {
    const key = `${b.kind}-${b.stage}`
    const row = rows.find(r => r.key === key)
    if (row) row.blocks.push(b)
    else rows.push({ key, first: b, blocks: [b] })
  }

  return (
    <section className="mt-5" data-testid="plan-today">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <div className="text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-content/40">
            {t('plan.today.title')}
          </div>
          <div className="mt-1 text-sm text-content/60 tabular-nums" data-testid="plan-today-minutes">
            {t('plan.today.doneOf', { done: day.doneMinutes, total: day.minutes })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 text-xs tabular-nums ${week.met ? 'text-success' : 'text-content/50'}`}>
            {/* One flame at a time: with a streak beside it, the streak has it. */}
            {week.met && weekStreak < 2 && <Flame size={13} />}
            {week.met ? t('plan.week.met') : t('plan.week.days', { trained: week.trained, target: week.target })}
          </span>
          {weekStreak >= 2 && (
            <span
              className="inline-flex items-center gap-1 text-xs tabular-nums text-gold"
              data-testid="plan-week-streak"
              title={t('xp.weekStreak.hint')}
            >
              <Flame size={13} aria-hidden="true" />
              {t('xp.weekStreak.label', { count: weekStreak })}
            </span>
          )}
          <WeekDots week={week} />
        </div>
      </div>

      {day.blocks.length === 0 ? (
        <p className="mt-4 text-sm text-content/55">{t('plan.today.empty')}</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-1.5">
          {rows.map(({ key, first: b, blocks }) => {
            const Icon = KIND_ICON[b.kind]
            const isNext = blocks.some(x => x.id === day.next?.id)
            const doneRuns = blocks.filter(x => x.done).length
            const allDone = doneRuns === blocks.length
            const minutes = blocks.reduce((n, x) => n + x.minutes, 0)
            return (
              <li key={key}>
                <button
                  onClick={() => onOpen(b.mode, blocks.find(x => !x.done) ?? b)}
                  data-testid={`plan-block-${b.kind}`}
                  data-done={allDone}
                  data-runs={blocks.length}
                  className={`group w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left cursor-pointer
                    border transition-colors ${
                      isNext
                        ? 'border-gold/45 bg-gold/[.07]'
                        : 'border-contrast/10 hover:border-gold/30'
                    }`}
                >
                  <span
                    className={`grid place-items-center w-7 h-7 rounded-full shrink-0 border ${
                      allDone
                        ? 'bg-gold border-gold text-on-gold'
                        : isNext
                          ? 'border-gold text-gold'
                          : 'border-contrast/20 text-content/45'
                    }`}
                  >
                    {allDone ? <Check size={14} strokeWidth={3} /> : <Icon size={13} className={b.kind === 'table' ? 'fill-current' : ''} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.6875rem] font-semibold tracking-[0.1em] uppercase text-content/40">
                      {t(`plan.today.kind.${b.kind}`)}
                    </span>
                    <span className={`block text-[0.95rem] font-semibold leading-snug line-clamp-2 ${allDone ? 'text-content/45' : ''}`}>
                      {title(b.stage)}
                    </span>
                  </span>
                  {/* One pip per run, filled as the runs are recorded. */}
                  {blocks.length > 1 && (
                    <span className="shrink-0 flex items-center gap-1" aria-hidden>
                      {blocks.map(x => (
                        <span
                          key={x.id}
                          // Dots, not bars: two upright bars beside a play icon are a pause sign.
                          className={`w-2 h-2 rounded-full ${x.done ? 'bg-gold' : 'bg-contrast/20'}`}
                        />
                      ))}
                    </span>
                  )}
                  <span className="shrink-0 w-24 text-right text-xs text-content/45 tabular-nums">
                    {blocks.length > 1 && <span className="text-content/70 font-semibold">{doneRuns}/{blocks.length} · </span>}
                    {t('plan.today.minutes', { n: minutes })}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {day.next ? (
        <button
          onClick={() => onOpen(day.next!.mode, day.next!)}
          data-testid="plan-today-start"
          className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold
            bg-gradient-to-b from-gold-bright to-gold text-on-gold cursor-pointer"
        >
          <Play size={16} />
          {t(day.doneMinutes > 0 ? 'plan.today.next' : 'plan.today.start', { block: name(day.next) })}
        </button>
      ) : day.complete ? (
        <div className="mt-4 rounded-xl border border-success/30 bg-success/[.06] px-4 py-3" data-testid="plan-today-complete">
          <div className="flex items-center gap-2 font-semibold text-success">
            <Check size={16} strokeWidth={3} /> {t('plan.today.complete')}
          </div>
          <p className="mt-1 text-sm text-content/55 max-w-[58ch]">{t('plan.today.completeSub')}</p>
        </div>
      ) : null}
    </section>
  )
}

/**
 * The whole road as one line of seven points.
 *
 * On the home screen the seven stage cards were a second page of text under
 * the answer to "what do I do now". The line says where you are; the cards
 * live on the plan's own page, one click away.
 */
export function PathStrip({
  progress,
  activeId,
  entryIndex,
  goalIndex,
  onOpen,
}: {
  progress: readonly StageProgress[]
  activeId: StageId | null
  /** Index of the stage the placement starts at; earlier ones count as known. */
  entryIndex: number
  /** Index of the last stage the goal needs; later ones are drawn faint. */
  goalIndex: number
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const activeIndex = activeId ? stageIndex(activeId) : -1

  return (
    <section className="mt-8" data-testid="plan-path">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-xs font-bold tracking-[0.16em] uppercase text-content/40">{t('plan.path.title')}</h3>
        <button
          onClick={onOpen}
          data-testid="plan-path-open"
          className="inline-flex items-center gap-1.5 text-sm text-content/55 hover:text-gold cursor-pointer transition-colors"
        >
          {t('plan.path.open')} <ArrowRight size={14} />
        </button>
      </div>

      <ol className="mt-4 grid grid-cols-7 gap-0">
        {progress.map((p, i) => {
          // The road is walked in order. A stage finished ahead of the one on
          // turn is finished and stays counted — but drawn like the stages
          // behind, it made a road with a gap in it: "done" after "not done".
          // It gets an outlined tick, "done already", until the road reaches it.
          const reached = progress.slice(entryIndex, i).every(q => q.done)
          const early = i >= entryIndex && p.done && !reached
          const known = (p.done || i < entryIndex) && !early
          const isActive = i === activeIndex
          const beyond = i > goalIndex
          return (
            <li
              key={p.stage.id}
              className={`relative flex flex-col items-center text-center px-0.5 ${beyond ? 'opacity-40' : ''}`}
              data-testid={`path-node-${p.stage.id}`}
              data-state={known ? 'done' : early ? 'early' : isActive ? 'active' : 'ahead'}
            >
              {/* The rail between this point and the next. */}
              {i < progress.length - 1 && (
                <span
                  aria-hidden
                  className={`absolute top-[13px] left-1/2 w-full h-px ${
                    known ? 'bg-gold/60' : 'bg-contrast/15'
                  }`}
                />
              )}
              <span
                className={`relative z-10 grid place-items-center w-[27px] h-[27px] rounded-full text-xs font-bold border ${
                  known
                    ? 'bg-gold border-gold text-on-gold'
                    : early
                      ? 'bg-casino-bg border-gold/60 text-gold'
                    : isActive
                      ? 'bg-casino-bg border-gold text-gold shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-gold)_18%,transparent)]'
                      : 'bg-casino-bg border-contrast/20 text-content/40'
                }`}
              >
                {known || early ? <Check size={13} strokeWidth={3} /> : p.locked ? <Lock size={11} /> : i + 1}
              </span>
              <span
                className={`mt-2 text-[0.6875rem] leading-tight max-w-[11ch] hyphens-auto ${
                  isActive ? 'text-content font-semibold' : 'text-content/45'
                }`}
              >
                {t(p.stage.titleKey)}
              </span>
              {isActive && !p.readOnly && (
                <span className="mt-1 text-[0.625rem] text-gold tabular-nums">
                  {p.current}/{p.target} · {t('plan.daysProgress', { days: p.days, target: p.targetDays })}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/**
 * Three sentences for a new account, in place of a tour through eight screens.
 *
 * It answers the question the home screen raises and the plan assumes: what
 * is all this, and what am I supposed to do with it. Dismissed once, gone for
 * the account.
 */
export function HowItWorks({ onDismiss, onTour }: { onDismiss: () => void; onTour?: () => void }) {
  const { t } = useTranslation()
  return (
    <section
      className="relative w-full max-w-3xl mx-auto mb-6 surface rounded-2xl p-5 md:p-6 border border-gold/20"
      data-testid="how-it-works"
    >
      <button
        onClick={onDismiss}
        data-testid="how-it-works-dismiss"
        aria-label={t('plan.how.dismiss')}
        className="absolute top-4 right-4 grid place-items-center w-8 h-8 rounded-lg
          text-content/35 hover:text-content hover:bg-contrast/8 cursor-pointer transition-colors"
      >
        <X size={16} />
      </button>
      <h2 className="text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-gold/80">{t('plan.how.title')}</h2>
      <ol className="mt-4 grid gap-4 md:grid-cols-3">
        {(['s1', 's2', 's3'] as const).map((k, i) => (
          <li key={k} className="flex gap-3">
            <span className="grid place-items-center w-6 h-6 rounded-full shrink-0 text-xs font-bold text-gold border border-gold/35">
              {i + 1}
            </span>
            <p className="text-sm text-content/65 leading-relaxed">{t(`plan.how.${k}`)}</p>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={onDismiss}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold
            border border-gold/40 text-gold hover:bg-gold/10 cursor-pointer transition-colors"
        >
          <Check size={15} /> {t('plan.how.dismiss')}
        </button>
        {onTour && (
          <button
            onClick={onTour}
            data-testid="how-it-works-tour"
            className="text-sm text-content/50 hover:text-content cursor-pointer transition-colors"
          >
            {t('startHere.showAround')}
          </button>
        )}
      </div>
    </section>
  )
}
