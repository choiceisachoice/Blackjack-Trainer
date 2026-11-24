import { useEffect, useState, type ReactNode } from 'react'
import { usePlanState, useAwaitingAccount } from '../../hooks/use-plan-state'
import { buildDayPlan, deriveWeek, weeksToGoal } from '../../services/daily-plan'
import { todayKey } from '../../services/date-utils'
import { TimeBudgetPicker, TimeQuestion, TodayBlocks, TodayStart, WeekSummary, PathStrip, HowItWorks } from './PlanToday'
import { ExampleTag } from '../common/ExampleTag'
import { Trans, useTranslation } from 'react-i18next'
import { Check, Lock, BookOpen, Play, Route, RotateCcw, Zap, ChevronRight, Flag, CalendarClock, Pencil, X, TrendingUp, ClipboardList, Timer } from 'lucide-react'
import { Sparkline } from '../analytics/AnalyticsCharts'
import { useAppStore } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useIsPro } from '../../store/entitlement-store'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'
import { useChallengeStore } from '../../store/challenge-store'
import { CHALLENGE_XP } from '../../services/challenges/challenge-types'
import { screenForMode } from '../../services/challenges/challenge-selection'
import { stageXP } from '../../services/stage-rewards'
import {
  CURRICULUM,
  deriveCurriculum,
  currentStage,
  nextUnlockedStage,
  setPlacement,
  markStageRead,
  claimedStageIds,
  setPlacementSkipped,
  clearPlacementSkip,
  stageIndex,
  stageTrend,
  stageEffort,
  type StageProgress,
  type StageTrend,
  type StageEffort,
  drillDescription,
} from '../../services/curriculum'
import { StartingPoint } from './StartingPoint'
import {
  getProfile,
  setProfile,
  profileForLevel,
  goalStage,
  isBeyondGoal,
  nextGoalUp,
  proStagesFor,
  budgetOf,
  commitmentFor,
  GOAL_OPTIONS,
  type LearnerProfile,
  type TimeBudget,
} from '../../services/learner-profile'
import { weekStartKey } from '../../services/date-utils'
import { currentWeekStreak, getClaimedRewards } from '../../services/weekly-rewards'
import { deriveRhythm, rhythmMessage } from '../../services/training-rhythm'
import { WelcomeScreen } from '../onboarding/WelcomeScreen'
import { setWelcomeSeen } from '../../services/onboarding'
import { setRecommendation, setRecommendationDone } from '../../services/recommendation'
import { ProgressBar } from '../common/ui'

/**
 * Used only when the profile is somehow missing while a placement exists —
 * storage cleared between the two writes, say. The full path and a middling
 * pace are the assumptions that hide the least from the learner.
 */
const FALLBACK_PROFILE: LearnerProfile = profileForLevel()

/** What the plan hands to the home screen's rail. */
export interface PlanRailParts {
  /** This week's training days, the run of kept weeks and the seven dots. */
  week: ReactNode
  /** The road, standing up: every stage, the current one marked. */
  path: ReactNode
}

/**
 * The training plan: one ordered path, entered at the stage the placement test
 * put you at, with progress measured from real sessions.
 *
 * Three states in one screen — take the test, see where you landed, then work
 * the plan. Keeping them together means the answer to "what do I do next" is
 * always one place, whether you are on day one or day fifty.
 */
export function TrainingPlan({
  embedded = false,
  before,
  after,
  onTour,
  rail,
}: {
  /**
   * Rendered inside a page that already owns the scroll and the page title.
   * Drops this component's own canvas, scroll container and h1 so the home
   * screen does not end up with two of each.
   */
  embedded?: boolean
  /**
   * Rendered above / below the plan — but ONLY once the plan itself is showing.
   *
   * The slots exist so the decision "does onboarding take over the whole page?"
   * stays here, where the state lives. The home screen cannot answer it without
   * duplicating this component's conditions, and two copies of that logic drift.
   */
  before?: ReactNode
  after?: ReactNode
  /** Starts the guided tour, where the page embedding the plan has one. */
  onTour?: () => void
  /**
   * The home screen's side column, composed by the page from parts only the
   * plan can draw. Given, the embedded plan lays itself out in two columns
   * from 1280px — the plan and `after` on the left, this on the right — and
   * stacks it between the two on anything narrower.
   *
   * A render prop rather than a slot because the week and the road are
   * derived here; the page decides where they sit among its own cards.
   */
  rail?: (parts: PlanRailParts) => ReactNode
}) {
  const { t } = useTranslation()
  const setMode = useAppStore(s => s.setMode)
  const sessions = useStatsStore(s => s.sessions)
  const lifetimeStats = useStatsStore(s => s.lifetimeStats)
  const loadStats = useStatsStore(s => s.loadStats)
  const isPro = useIsPro()
  const showUpgrade = useUpgradePrompt(s => s.show)
  const challenge = useChallengeStore(s => s.challenge)
  const challengeState = useChallengeStore(s => s.state)

  // The answers are read live: the merge with the account's copy lands after
  // this screen has mounted, and a screen that read them once asked a
  // returning learner the first-day question (Darius, 17 Nov 2026).
  const plan = usePlanState()
  const awaitingAccount = useAwaitingAccount()
  const { profile, readStages } = plan
  // A retake puts the question back without throwing the stored answer away:
  // leaving it half-way must not un-place anyone.
  const [retaking, setRetaking] = useState(false)
  const placement = retaking ? null : plan.placement
  // Someone with training on record is not a newcomer, whatever the stored
  // answers say. An account that trained before its answers travelled with it
  // arrives here with sessions and no placement; asking it "have you ever
  // played?" is the question the history has already answered. It gets the
  // plan from the start of the road, with its real progress on it, and the
  // choice of a starting point one click away.
  const knownLearner = sessions.length > 0
  const skipped = retaking ? false : plan.skipped || knownLearner
  const [editing, setEditing] = useState(false)
  // Only ever shown to an account that has neither been greeted nor placed —
  // a retake must not drop the learner back onto a welcome screen.
  const greeted = plan.welcomeSeen || plan.placement !== null || plan.skipped || knownLearner
  // The time question follows the level question, once, in the same sitting.
  const [askingTime, setAskingTime] = useState(false)

  // The plan is entirely derived from session history, so it has to be loaded.
  useEffect(() => {
    if (lifetimeStats == null) void loadStats()
  }, [lifetimeStats, loadStats])

  // ── The account's answers are still on their way ──
  // An empty device right after a sign-in says nothing about the learner.
  // Wait for the merge rather than greet someone who trained here yesterday.
  if (awaitingAccount && plan.placement === null && !plan.skipped) {
    return (
      <div
        className="flex-1 w-full grid place-items-center py-24"
        role="status"
        aria-busy="true"
        aria-label={t('plan.loading')}
        data-testid="plan-loading"
      >
        <div className="w-full max-w-3xl px-4 flex flex-col gap-3">
          <div className="h-5 w-40 rounded-md bg-contrast/8 animate-pulse" />
          <div className="h-44 rounded-2xl bg-contrast/5 animate-pulse" />
          <div className="h-16 rounded-2xl bg-contrast/5 animate-pulse" />
        </div>
      </div>
    )
  }

  // ── 0. Brand-new account → say hello before asking anything ──
  if (!greeted) {
    return <WelcomeScreen isPro={isPro} onStart={() => setWelcomeSeen()} />
  }

  // ── 1. Not placed yet → the one question, but never insist ──
  //
  // There is no step 2 any more. The answer used to lead to a result screen
  // explaining the placement, which was a page of reading standing between
  // someone and the app they had just signed up for. Answering now drops
  // straight through to the plan — which is the home screen — and the reason
  // for the placement is carried by the recommendation that appears there.
  if (!placement && !skipped) {
    return (
      <StartingPoint
        onSkip={() => {
          if (retaking) setRetaking(false)
          else setPlacementSkipped()
        }}
        onPick={option => {
          // A retake keeps the goal and the time already given.
          const kept = getProfile() ?? profileForLevel()
          setPlacement(option.stage)
          setProfile(kept)
          // Remembered so the home screen can open with a first move that
          // matches the answer, rather than the same greeting for everyone.
          const dismissed = plan.recommendationDone
          setRecommendation(option.value)
          // Changing the starting point is not asking for the introduction again.
          if (dismissed) setRecommendationDone()
          clearPlacementSkip()
          // Asked once: an account that has already said how much time it has
          // is not asked again because it changed where it starts.
          setAskingTime(kept.daysPerWeek == null)
          setRetaking(false)
        }}
      />
    )
  }

  // ── 2. The plan ──
  // Works with or without a placement. Someone who skipped the test still gets
  // the real path — the curriculum is a fact about card counting, not a
  // personalisation — they simply start at the beginning of it.
  const placed = placement !== null
  const entry = placement ?? CURRICULUM[0].id
  const progress = deriveCurriculum(sessions, readStages, isPro, claimedStageIds())
  const goal = profile?.goal ?? 'serious'
  const budget = budgetOf(profile)

  // ── 1b. The second question: how much time is there? ──
  if (askingTime) {
    return (
      <TimeQuestion
        initial={budget}
        weeks={b => weeksToGoal(progress, entry, goal, b)}
        onDone={b => {
          setProfile({ ...(getProfile() ?? FALLBACK_PROFILE), ...b, commitment: commitmentFor(b) })
          setAskingTime(false)
        }}
      />
    )
  }

  const goalIndex = stageIndex(goalStage(goal))
  const from = stageIndex(entry)

  // Progress is counted against what the learner said they wanted, not against
  // the full curriculum. Someone who only wants to understand counting should
  // not be shown "2 of 7" forever because they declined the parts about money.
  const next = currentStage(progress, entry)
  const reachedGoal = !next || stageIndex(next.stage.id) > goalIndex
  const active = reachedGoal ? null : next
  const trend = active ? stageTrend(active.stage, sessions) : null
  // Bounded by the goal, so the alternative offered here can never be a stage
  // the list below calls "beyond your goal".
  const openInstead = active?.locked
    ? nextUnlockedStage(progress, entry, goalStage(goal))
    : null
  const today = todayKey()
  const week = deriveWeek(sessions, budget, weekStartKey(), today)
  // Counted from the weeks already paid, plus this one once it is kept — so
  // the number is right in the render that shows "Week done", one effect
  // before the payment is written down. No plan answered, no streak.
  const weekStreak = profile ? currentWeekStreak(getClaimedRewards(), today, week.met) : 0
  const day = buildDayPlan({ progress, placement: entry, goal, isPro, budget, sessions, today, readStages })
  // Opening a stage's reading from the day's list counts as having read it:
  // the app cannot check more than that, and the block must not come back
  // every day until the first drill.
  const openBlock = (mode: Parameters<typeof setMode>[0], block: { kind: string; stage: StageProgress['stage']['id'] }) => {
    if (block.kind === 'read') {
      const p = progress.find(x => x.stage.id === block.stage)
      if (p && !p.readOnly) markStageRead(block.stage)
    }
    setMode(mode)
  }
  const weeksLeft = weeksToGoal(progress, entry, goal, budget)
  // The next rung up, offered only once the current goal is actually done.
  const harder = nextGoalUp(goal)
  // The plan noticing that time has passed. `now` is read once per render
  // rather than inside the derivation, which stays pure and testable.
  const rhythm = deriveRhythm(sessions, progress, new Date())
  const rhythmText = rhythmMessage(rhythm, t)
  const refresh = rhythm.kind === 'rusty' && rhythm.refresh
    ? progress.find(p => p.stage.id === rhythm.refresh) ?? null
    : null
  const inGoal = progress.slice(from, goalIndex + 1)
  // Counted along the whole road to the goal, the way the line of points
  // below draws it: the stages behind the starting point are behind. The
  // header used to count from the starting point only — "1 of 3 stages" over
  // a road with five of seven ticked (audit, 18 Nov 2026).
  const doneCount = from + inGoal.filter(p => p.done).length
  const totalCount = goalIndex + 1

  const confirmRead = (id: StageProgress['stage']['id']) => markStageRead(id)

  const retake = () => setRetaking(true)

  /**
   * Change one answer without re-running the placement test.
   *
   * Goal and pace are opinions, not measurements — they can change on a
   * Tuesday. Making someone re-prove their skill to say "I have more time now"
   * is the kind of friction that ends with the plan being ignored.
   */
  const updateProfile = (patch: Partial<LearnerProfile>) => {
    setProfile({ ...(profile ?? FALLBACK_PROFILE), ...patch })
  }
  const updateBudget = (b: TimeBudget) => updateProfile({ ...b, commitment: commitmentFor(b) })

  const stageNumber = active ? stageIndex(active.stage.id) + 1 : 0
  // On the home screen the week is drawn in the rail beside the level, so the
  // card leaves it out rather than showing it twice on one screen.
  const railMode = embedded && rail != null

  /** Goal and time, one line each, both opening the settings. */
  const goalChips = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => setEditing(v => !v)}
        data-testid="plan-goal"
        aria-expanded={editing}
        className="group inline-flex items-center gap-2 rounded-lg border border-contrast/10 bg-contrast/[.03]
          px-3 py-1.5 text-left cursor-pointer hover:border-gold/35 transition-colors duration-100"
      >
        <Flag size={13} className="shrink-0 text-gold/80" />
        <span className="text-[0.625rem] font-bold tracking-[0.14em] uppercase text-content/40">{t('plan.yourGoal')}</span>
        <span className="text-sm font-semibold">{t(CURRICULUM[goalIndex].titleKey)}</span>
        <Pencil size={11} className="shrink-0 text-content/30 group-hover:text-gold transition-colors duration-100" />
      </button>
      <button
        onClick={() => setEditing(v => !v)}
        data-testid="plan-pace"
        aria-expanded={editing}
        className="group inline-flex items-center gap-2 rounded-lg border border-contrast/10 bg-contrast/[.03]
          px-3 py-1.5 text-left cursor-pointer hover:border-gold/35 transition-colors duration-100"
      >
        <Timer size={13} className="shrink-0 text-gold/80" />
        <span className="text-[0.625rem] font-bold tracking-[0.14em] uppercase text-content/40">{t('plan.time.label')}</span>
        <span className="text-sm font-semibold tabular-nums">
          {t('plan.time.value', { count: budget.daysPerWeek, minutes: budget.minutesPerDay })}
        </span>
        <Pencil size={11} className="shrink-0 text-content/30 group-hover:text-gold transition-colors duration-100" />
      </button>
    </div>
  )

  /** "5 of 7 stages complete · About 2 weeks to your goal" — one line. */
  const standingLine = (
    <p className="text-sm text-content/55">
      {t('plan.stagesComplete', { done: doneCount, count: totalCount })}
      {weeksLeft > 0 && (
        <span className="text-content/40" data-testid="plan-forecast"> · {t('plan.forecast', { count: weeksLeft })}</span>
      )}
    </p>
  )

  const takeTest = !placed && (
    <button
      onClick={retake}
      data-testid="plan-take-test"
      className="mt-5 w-full text-left rounded-2xl border border-gold/35 p-4 md:p-5
        bg-[linear-gradient(180deg,var(--color-warm-wash),var(--color-surface))]
        hover:border-gold/55 cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-3.5">
        <span className="grid place-items-center w-9 h-9 rounded-lg shrink-0 text-gold bg-gold/10 border border-gold/25">
          <ClipboardList size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{t('plan.findStart')}</div>
          <div className="mt-0.5 text-sm text-content/50 leading-snug">
            {t('plan.findStartSub')}
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-content/30" />
      </div>
    </button>
  )

  const settings = editing && (
    <PlanSettings
      profile={profile ?? FALLBACK_PROFILE}
      isPro={isPro}
      budget={budget}
      onBudget={updateBudget}
      onChange={updateProfile}
      onClose={() => setEditing(false)}
    />
  )

  /* Time passed. A plan notices; a to-do list does not. */
  const rhythmNotice = rhythmText && (
    <div
      className={`mt-5 rounded-2xl p-4 md:p-5 border ${
        rhythm.kind === 'rusty' ? 'border-gold/35 bg-gold/[.05]' : 'border-contrast/12'
      }`}
      data-testid="plan-rhythm"
    >
      <div className="flex items-start gap-3.5">
        <span className="grid place-items-center w-9 h-9 rounded-lg shrink-0 text-gold bg-gold/10 border border-gold/20">
          <CalendarClock size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-content/70 leading-relaxed max-w-[58ch] text-left">
            {rhythmText}
          </p>
          {refresh && !refresh.locked && refresh.stage.drill && (
            <button
              onClick={() => setMode(refresh.stage.drill!.mode)}
              data-testid="plan-warm-up"
              className="mt-3.5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold
                border border-gold/40 text-gold hover:bg-gold/10 cursor-pointer transition-colors"
            >
              <RotateCcw size={15} />
              {t('plan.warmUp', { stage: t(refresh.stage.titleKey) })}
            </button>
          )}
        </div>
      </div>
    </div>
  )

  /*
    Up next — the single most important thing on this screen.

    Two columns once the card is wide enough (a container query, so it answers
    to the card's own width on the home screen and on the plan page alike):
    the stage and its start button on the left, the day's blocks on the right.
    Narrow, the same order stacks — and the start button still comes before
    the list, so on a phone it is on the first screen.
  */
  const upNext = active ? (
    <div
      className="@container mt-5 rounded-2xl border border-gold/40 p-5 md:p-6
        bg-[linear-gradient(180deg,var(--color-warm-wash),var(--color-surface))]"
      data-testid="plan-up-next"
    >
      <div className="grid gap-x-8 gap-y-5 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
        <div className="min-w-0 flex flex-col items-start">
          <div className="text-xs font-bold tracking-[0.16em] uppercase text-gold">
            {t('plan.upNext')}
            <span className="text-content/35"> · {t('plan.path.stageOf', { n: stageNumber, total: CURRICULUM.length })}</span>
          </div>
          <h2 className="mt-2 text-xl md:text-2xl font-bold tracking-tight">{t(active.stage.titleKey)}</h2>
          <p className="mt-2 text-sm text-content/70 leading-relaxed max-w-[54ch]">{t(active.stage.goalKey)}</p>
          {/* The reason is read once; on the home screen, seen every day, the
              goal line is enough and the plan's own page keeps the why. */}
          {!embedded && (
            <p className="mt-2 text-sm text-content/50 leading-relaxed max-w-[54ch]">{t(active.stage.whyKey)}</p>
          )}

          <StageStanding effort={stageEffort(active)} target={active.target} />

          {day.lockedFocus && (
            <p className="mt-3.5 text-sm text-gold/90 max-w-[54ch]" data-testid="plan-locked-focus">
              {t('plan.today.lockedFocus', { stage: t(active.stage.titleKey) })}
            </p>
          )}

          <TodayStart day={day} onOpen={openBlock} className="mt-5" />

          {/* What the list of blocks cannot do: tick a reading stage, or
              open the paywall for a stage that is behind it. With a start
              button above, these are the second move and look it. */}
          {(active.readOnly || active.locked) && (
            <StageActions
              p={active}
              setMode={setMode}
              onRead={confirmRead}
              showUpgrade={showUpgrade}
              primary
              quiet={day.next != null}
              hideRead={day.next?.kind === 'read' && day.next.stage === active.stage.id}
            />
          )}
        </div>

        <TodayBlocks
          day={day}
          week={week}
          weekStreak={weekStreak}
          onOpen={openBlock}
          hideStart
          hideWeek={railMode}
          className={day.blocks.length <= 1 ? '@2xl:self-center' : ''}
        />
      </div>

      {(stageXP(active.stage.id) > 0 || active.stage.drill) && (
      <div className="mt-5 pt-4 border-t border-contrast/10 flex flex-wrap items-center justify-between gap-4">
        {/* A reading stage pays nothing; "worth 0 XP" is not worth saying. */}
        {stageXP(active.stage.id) > 0 ? (
          <span className="inline-flex items-center gap-2 text-sm">
            <Zap size={15} className="text-gold shrink-0" />
            <span className="text-content/55">
              <Trans
                i18nKey="plan.worthXp"
                values={{ xp: stageXP(active.stage.id) }}
                components={{ b: <b className="text-gold font-semibold tabular-nums" /> }}
              />
            </span>
          </span>
        ) : <span />}
        {trend && trend.points.length > 0
          ? <StageForm trend={trend} onOpenAnalytics={() => setMode('analytics')} />
          : active.stage.drill && <StageFormExample />}
      </div>
      )}
    </div>
  ) : (
    <div className="mt-5 surface rounded-2xl p-6 text-center" data-testid="plan-complete">
      <h2 className="text-xl font-bold text-gold-gradient">
        {harder ? t('plan.reachedGoal') : t('plan.walkedPath')}
      </h2>
      <p className="mt-2 text-sm text-content/60 max-w-[48ch] mx-auto">
        {harder
          ? t('plan.reachedGoalBody', { stage: t(CURRICULUM[stageIndex(goalStage(harder))].titleKey) })
          : t('plan.walkedPathBody')}
      </p>

      {/* Reaching the goal used to end in a compliment and nothing else.
          The one thing a finished learner needs is somewhere to go. */}
      <div className="text-left">
        <TodayBlocks day={day} week={week} weekStreak={weekStreak} onOpen={openBlock} hideWeek={railMode} />
      </div>

      {harder && (
        <button
          onClick={() => updateProfile({ goal: harder })}
          data-testid="plan-extend-goal"
          className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold
            bg-gradient-to-b from-gold-bright to-gold text-on-gold cursor-pointer"
        >
          <TrendingUp size={16} />
          {t('plan.aimFor', { stage: t(CURRICULUM[stageIndex(goalStage(harder))].titleKey) })}
        </button>
      )}
    </div>
  )

  /* A free learner can hit a Pro stage with a free one right behind it.
     Say so, rather than leaving the plan pointing at a locked door. */
  const openInsteadCard = openInstead && (
    <div
      className="mt-4 surface rounded-2xl p-4 md:p-5 border border-contrast/10"
      data-testid="plan-open-instead"
    >
      <div className="text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-content/40">
        {t('plan.openInstead')}
      </div>
      <h3 className="mt-1.5 font-semibold">{t(openInstead.stage.titleKey)}</h3>
      <p className="mt-1 text-sm text-content/55 leading-snug max-w-[52ch]">
        {t(openInstead.stage.goalKey)}
      </p>
      <StageActions
        p={openInstead}
        setMode={setMode}
        onRead={confirmRead}
        showUpgrade={showUpgrade}
      />
    </div>
  )

  const howItWorks = embedded && !plan.recommendationDone && sessions.length === 0 && (
    <HowItWorks
      className="mt-4"
      onDismiss={() => setRecommendationDone()}
      onTour={onTour && (() => { setRecommendationDone(); onTour() })}
    />
  )

  const pathProps = {
    progress,
    activeId: active?.stage.id ?? null,
    entryIndex: from,
    goalIndex,
    onOpen: () => setMode('plan'),
  }

  // ── Embedded: the home screen ──
  if (embedded) {
    const top = (
      <div className="min-w-0 xl:col-start-1 xl:row-start-1">
        {/* The page's greeting and where the learner stands on the road, in
            one row with the two answers that shape the plan. Before, these
            were a 190px card and a 140px header stacked above "up next". */}
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            {before}
            <div className={before ? 'mt-1' : ''}>{standingLine}</div>
          </div>
          {goalChips}
        </header>
        {takeTest}
        {settings}
        {rhythmNotice}
        {upNext}
        {howItWorks}
        {openInsteadCard}
        {!railMode && <PathStrip {...pathProps} />}
      </div>
    )

    return (
      <div className="w-full pt-5 md:pt-6" data-testid="training-plan">
        <div
          className={`w-full mx-auto grid gap-5 items-start ${
            railMode
              ? 'max-w-3xl lg:max-w-5xl xl:max-w-[96rem] xl:gap-x-8 xl:grid-cols-[minmax(0,1fr)_clamp(21rem,25vw,26rem)] xl:grid-rows-[auto_1fr]'
              : 'max-w-3xl'
          }`}
        >
          {top}
          {/* The rail: how the learner is doing, what can be earned, where the
              road goes. Beside the plan from 1280px; under "up next" (and
              above the modes) on anything narrower, two cards to a row on a
              tablet. */}
          {railMode && (
            <aside
              data-testid="home-rail"
              className="min-w-0 grid gap-4 content-start md:grid-cols-2 xl:grid-cols-1 xl:col-start-2 xl:row-start-1 xl:row-span-2"
            >
              {rail({
                week: <WeekSummary week={week} weekStreak={weekStreak} />,
                path: <PathStrip {...pathProps} layout="column" />,
              })}
            </aside>
          )}
          {after && <div className="min-w-0 xl:col-start-1 xl:row-start-2">{after}</div>}
        </div>
      </div>
    )
  }

  // ── The plan's own page ──
  return (
    <div className="app-canvas flex-1 overflow-y-auto px-4 pb-4 pt-3 md:px-6 md:pb-6 md:pt-4" data-testid="training-plan">
      <div className="max-w-3xl xl:max-w-[96rem] mx-auto">
        {/* One line and a bar. It used to be an icon, a centred title, two
            cards and a forecast — 450px before the first thing to do. */}
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
            <h1 className="flex items-center gap-2.5 text-xl md:text-2xl font-extrabold text-gold-gradient leading-tight pb-0.5">
              <Route size={20} className="shrink-0 text-gold" aria-hidden />
              {t('plan.title')}
            </h1>
            <p className="text-sm text-content/55">{t('plan.stagesComplete', { done: doneCount, count: totalCount })}</p>
          </div>
          {goalChips}
        </header>
        {/* The forecast sits at the end of the bar it forecasts, which keeps the
            header to one line on a laptop. */}
        <div className="mt-3 flex flex-col items-start gap-y-1.5 sm:flex-row sm:items-center sm:gap-x-4">
          <ProgressBar
            className="sm:flex-1"
            height={6}
            value={doneCount}
            max={Math.max(totalCount, 1)}
            label={t('plan.stagesComplete', { done: doneCount, count: totalCount })}
          />
          {weeksLeft > 0 && (
            <span className="shrink-0 text-xs text-content/45" data-testid="plan-forecast">
              {t('plan.forecast', { count: weeksLeft })}
            </span>
          )}
        </div>

        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(24rem,34rem)] xl:gap-x-8 xl:items-start">
          <div className="min-w-0">
            {takeTest}
            {settings}
            {rhythmNotice}
            {upNext}
            {openInsteadCard}

            {/* Today's challenge, chosen to fit this stage — the daily loop and
                the plan are the same journey, so the plan says so. (Not on the
                home screen: its rail carries the daily and weekly cards.) */}
            {active && (
              <button
                onClick={() => setMode(
                  (challenge.requiredMode && screenForMode(challenge.requiredMode))
                    || active.stage.drill?.mode
                    || 'learn',
                )}
                data-testid="plan-daily-challenge"
                className="mt-4 w-full text-left surface rounded-2xl p-4 md:p-5 hover:border-gold/35
                  border border-transparent transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <span className="text-xl shrink-0" aria-hidden>{challenge.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-content/40">
                      {t('plan.todaysChallenge')}
                    </div>
                    <div className="mt-0.5 font-semibold truncate">{t(challenge.titleKey)}</div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-gold tabular-nums">
                    +{CHALLENGE_XP[challenge.difficulty]} XP
                  </span>
                </div>
                <ProgressBar
                  className="mt-3"
                  height={6}
                  value={Math.min(challengeState.progress, challenge.target)}
                  max={Math.max(challenge.target, 1)}
                />
              </button>
            )}
          </div>

          {/* The full path — beside "up next" on a wide screen, under it otherwise. */}
          <section className="min-w-0">
            <h3 className="mt-8 xl:mt-5 mb-3 text-xs font-bold tracking-[0.16em] uppercase text-content/40">
              {t('plan.fullPath')}
            </h3>
            <ol className="flex flex-col gap-2.5">
              {progress.map((p, i) => {
                const behind = i < from
                const beyond = isBeyondGoal(p.stage.id, goal)
                const isActive = active?.stage.id === p.stage.id
                return (
                  <li
                    key={p.stage.id}
                    data-testid={`plan-stage-${p.stage.id}`}
                    data-done={p.done}
                    className={`surface rounded-2xl ${p.done ? 'px-4 py-3 md:px-5' : 'p-4 md:p-5'} ${isActive ? 'border border-gold/35' : ''} ${
                      (behind && !p.done) || beyond ? 'opacity-55' : ''
                    }`}
                  >
                    <div className={`flex gap-3.5 ${p.done ? 'items-center' : 'items-start'}`}>
                      <span
                        className={`grid place-items-center w-7 h-7 rounded-full shrink-0 text-xs font-bold border ${
                          p.done
                            ? 'bg-gold border-gold text-on-gold'
                            : isActive
                              ? 'border-gold text-gold'
                              : 'border-contrast/20 text-content/40'
                        }`}
                      >
                        {p.done ? <Check size={14} strokeWidth={3} /> : i + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold ${p.done ? 'text-content/55' : 'text-content'}`}>
                            {t(p.stage.titleKey)}
                          </span>
                          {p.locked && (
                            <span className="inline-flex items-center gap-1 text-[0.7rem] font-bold tracking-wider
                              text-gold border border-gold/40 bg-gold/10 rounded-full px-2 py-0.5">
                              <Lock size={11} /> PRO
                            </span>
                          )}
                          {placed && behind && !p.done && (
                            <span className="text-[0.7rem] text-content/40">{t('plan.skippedByPlacement')}</span>
                          )}
                          {beyond && (
                            <span className="text-[0.7rem] text-content/40">{t('plan.beyondGoal')}</span>
                          )}
                        </div>
                        {/* What it took, small, under the name. */}
                        {p.done && p.stage.drill && (
                          <div className="mt-0.5 text-[0.7rem] text-content/40 tabular-nums">
                            {p.current}/{p.target} · {t('plan.daysProgress', { days: p.days, target: p.targetDays })}
                          </div>
                        )}
                        {/* A finished stage is one line: its name, its tick and a way back
                            in. Its description and counts were five cards of reading
                            between the learner and the stage they are on. */}
                        {!p.done && <p className="mt-1 text-sm text-content/55 leading-snug">{t(p.stage.goalKey)}</p>}

                        {p.stage.drill && !p.done && (
                          <>
                            <div className="mt-2 flex items-center gap-2.5">
                              <div className="w-28 shrink-0"><ProgressBar height={6} value={p.current} max={Math.max(p.target, 1)} /></div>
                              <span className="text-xs text-content/45 tabular-nums">
                                {p.current}/{p.target} · {t('plan.daysProgress', { days: p.days, target: p.targetDays })} — {drillDescription(p.stage.drill, t)}
                              </span>
                            </div>
                            <EffortLine effort={stageEffort(p)} />
                          </>
                        )}
                      </div>
                      {p.done && !isActive && (
                        <StageActions
                          p={p}
                          setMode={setMode}
                          onRead={confirmRead}
                          showUpgrade={showUpgrade}
                          compact
                        />
                      )}
                    </div>

                    {!isActive && !p.done && (
                      <StageActions
                        p={p}
                        setMode={setMode}
                        onRead={confirmRead}
                        showUpgrade={showUpgrade}
                      />
                    )}
                  </li>
                )
              })}
            </ol>

            <button
              onClick={retake}
              data-testid="plan-retake"
              className="mt-6 inline-flex items-center gap-2 text-sm text-content/50 hover:text-content cursor-pointer"
            >
              {/* No longer a "test" — it is one question, and calling it a test
                  makes it sound like something worth avoiding. */}
              <RotateCcw size={15} /> {placed ? t('plan.changeStart') : t('plan.chooseStart')}
            </button>
          </section>
        </div>

        <div aria-hidden className="w-full h-16 shrink-0" />
      </div>
    </div>
  )
}

/**
 * Change the goal or the pace in place.
 *
 * Deliberately not behind the placement test. Those two answers are opinions
 * that change — a new job, a holiday, deciding you want more than curiosity —
 * and making someone re-sit a skill check to say so would guarantee the plan
 * silently stops matching reality.
 */
function PlanSettings({
  profile,
  isPro,
  budget,
  onBudget,
  onChange,
  onClose,
}: {
  profile: LearnerProfile
  isPro: boolean
  budget: TimeBudget
  onBudget: (next: TimeBudget) => void
  onChange: (patch: Partial<LearnerProfile>) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const row = (selected: boolean) =>
    `w-full text-left rounded-xl px-4 py-3 border cursor-pointer transition-colors ${
      selected
        ? 'border-gold/45 bg-gold/10'
        : 'border-contrast/12 hover:border-gold/30 hover:bg-contrast/5'
    }`

  return (
    <section className="mt-6 surface rounded-2xl p-5 md:p-6" data-testid="plan-settings">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">{t('plan.adjust')}</h2>
          <p className="mt-1 text-sm text-content/50 max-w-[52ch]">
            {t('plan.adjustBody')}
          </p>
        </div>
        <button
          onClick={onClose}
          data-testid="plan-settings-close"
          aria-label={t('plan.closeSettings')}
          className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-content/40
            hover:text-content hover:bg-contrast/8 cursor-pointer transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <h3 className="mt-6 text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-content/40">
        {t('plan.whereItEnds')}
      </h3>
      <div className="mt-2.5 flex flex-col gap-2">
        {GOAL_OPTIONS.map(o => {
          const locked = isPro ? [] : proStagesFor(o.value)
          return (
            <button
              key={o.value}
              onClick={() => onChange({ goal: o.value })}
              data-testid={`plan-set-goal-${o.value}`}
              className={row(profile.goal === o.value)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-[0.95rem]">{t(o.labelKey)}</span>
                {profile.goal === o.value && <Check size={16} className="text-gold shrink-0" />}
              </div>
              <div className="mt-0.5 text-sm text-content/45 leading-snug">
                {t(o.hintKey)}
                {locked.length > 0 && (
                  <span className="text-gold">{t('plan.stagesNeedPro', { count: locked.length })}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-7 pt-6 border-t border-contrast/10">
        <TimeBudgetPicker budget={budget} onChange={onBudget} />
      </div>
    </section>
  )
}

/**
 * Where the learner stands on the stage they are working on, in one sentence.
 *
 * The "up next" card told people what the stage was for and what the bar was,
 * but never where they stood against it. Someone ten near-misses in read the
 * same card as someone arriving fresh.
 */
function StageStanding({ effort, target }: { effort: StageEffort; target: number }) {
  const { t } = useTranslation()
  if (effort.kind === 'untouched' || effort.kind === 'locked') return null

  const [tone, text] =
    effort.kind === 'done'
      ? ['text-success', t('plan.standing.done')]
      : effort.kind === 'spacing'
        ? ['text-gold', t('plan.standing.spacing', { count: effort.left })]
      : effort.kind === 'partial'
        ? ['text-gold', t('plan.standing.partial', {
            cleared: effort.cleared, target: effort.target, left: effort.target - effort.cleared,
          })]
        : effort.gap <= 3
          ? ['text-gold', t('plan.standing.close', {
              count: effort.attempts, best: effort.best, gap: effort.gap, bar: effort.bar,
            })]
          : ['text-content/60', t('plan.standing.far', {
              count: effort.attempts, best: effort.best, bar: effort.bar, target,
            })]

  return (
    <p className={`mt-3.5 text-sm font-medium ${tone} max-w-[54ch]`} data-testid="plan-standing">
      {text}
    </p>
  )
}

/**
 * What the learner has actually done on a stage, when the count alone lies.
 *
 * `0/3` is the truth about the *bar*, not about the person: ten sessions at 89%
 * and ten at 50% produce the same figure, and only one of those people is one
 * good session from finishing. This line is what tells them apart.
 *
 * Renders nothing for an untouched stage — there is no effort to report, and an
 * empty encouragement is worse than silence.
 */
function EffortLine({ effort }: { effort: StageEffort }) {
  const { t } = useTranslation()
  if (effort.kind !== 'below') return null

  // Within a couple of points is genuinely close; further off gets the same
  // facts without the encouragement, because false cheer is a kind of lying.
  const close = effort.gap <= 3

  return (
    <p
      className={`mt-1.5 text-xs ${close ? 'text-gold' : 'text-content/45'}`}
      data-testid="stage-effort"
    >
      {t('plan.effort.attempts', { count: effort.attempts })}{' '}
      <b className="tabular-nums font-semibold">{effort.best}%</b>
      {close
        ? t('plan.effort.offBar', { gap: effort.gap })
        : t('plan.effort.barIs', { bar: effort.bar })}
    </p>
  )
}

/**
 * Recent form on the current stage's drill.
 *
 * "0 of 3" answers how far but not how well — three near misses and three
 * disasters read identically. The sparkline is the same component the analytics
 * page uses, drawn from the same sessions, so the two screens can never tell
 * different stories about the same work.
 */
function StageForm({ trend, onOpenAnalytics }: { trend: StageTrend | null; onOpenAnalytics: () => void }) {
  const { t } = useTranslation()
  if (!trend || trend.points.length === 0) return null
  const last = trend.points[trend.points.length - 1]

  return (
    <button
      onClick={onOpenAnalytics}
      data-testid="plan-stage-form"
      title={t('plan.seeBreakdown')}
      className="group inline-flex items-center gap-3 rounded-lg px-2 py-1 -mx-2
        hover:bg-contrast/5 cursor-pointer transition-colors"
    >
      <span className="text-right leading-tight">
        <span className="block text-[0.6875rem] text-content/40">{t('plan.lastN', { n: trend.points.length })}</span>
        <span className={`block text-sm font-semibold tabular-nums ${
          last >= trend.floor ? 'text-success' : 'text-content/70'
        }`}>
          {/* The second figure is the bar, and says so: "90% / 85%" left the
              reader to guess what the 85 was. */}
          {last}% <span className="text-content/40 font-normal">· {t('plan.formBar', { pct: trend.floor })}</span>
        </span>
      </span>
      <Sparkline data={trend.points} />
      <ChevronRight size={15} className="text-content/25 group-hover:text-gold transition-colors" />
    </button>
  )
}

/** Made-up runs for the example below: a learner closing in on the bar. */
const EXAMPLE_FORM = [64, 71, 69, 78, 84]

/**
 * What "recent form" will look like, before there is any.
 *
 * The space on the right of the card's foot stood empty for every stage not yet
 * drilled. A faint sparkline, plainly marked as an example, says what will
 * appear there — and that the first run is what puts it there.
 */
function StageFormExample() {
  const { t } = useTranslation()
  return (
    <div className="inline-flex items-center gap-3" data-testid="plan-stage-form-example">
      <span className="text-right leading-tight">
        <span className="flex items-center justify-end gap-1.5">
          <ExampleTag />
        </span>
        <span className="mt-1 block text-[0.6875rem] text-content/45 max-w-[22ch]">{t('plan.formPreview')}</span>
      </span>
      <span aria-hidden className="opacity-35 grayscale-[35%]">
        <Sparkline data={EXAMPLE_FORM} />
      </span>
    </div>
  )
}

/**
 * Read / drill / unlock buttons for one stage.
 *
 * Takes no `isPro`: `p.locked` already carries that decision from the
 * derivation, and re-deriving it here would let the two disagree.
 */
function StageActions({
  p,
  setMode,
  onRead,
  showUpgrade,
  primary = false,
  quiet = false,
  hideRead = false,
  compact = false,
}: {
  p: StageProgress
  setMode: (m: ReturnType<typeof useAppStore.getState>['currentMode']) => void
  onRead: (id: StageProgress['stage']['id']) => void
  showUpgrade: (headline?: string) => void
  primary?: boolean
  /**
   * Another button on the card is the one to press first (today's start), so
   * none of these is drawn gold: one primary action per card.
   */
  quiet?: boolean
  /** The card's start button already opens this stage's reading. */
  hideRead?: boolean
  /** Small buttons, no indent — beside a finished stage's name. */
  compact?: boolean
}) {
  const { t } = useTranslation()
  const { stage } = p
  const base = compact
    ? 'inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold cursor-pointer transition-colors duration-100'
    : 'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold cursor-pointer transition-colors'
  // Beside a finished stage the ways back in are quiet text: five rows of
  // outlined buttons read as five things to do, and none of them is.
  const ghost = compact
    ? `${base} text-content/55 hover:text-gold hover:bg-contrast/5`
    : `${base} border border-contrast/15 text-content hover:border-gold/45`
  const gold = quiet ? ghost : `${base} bg-gradient-to-b from-gold-bright to-gold text-on-gold`

  return (
    <div className={`flex flex-wrap ${compact ? 'gap-1.5 shrink-0 justify-end' : 'gap-2.5'} ${compact ? '' : primary ? (quiet ? 'mt-3' : 'mt-5') : 'mt-3.5 pl-[2.6rem]'}`}>
      {stage.read && !hideRead && (
        <button onClick={() => setMode(stage.read!.mode)} className={ghost}>
          <BookOpen size={15} /> {t(stage.read.labelKey)}
        </button>
      )}

      {p.readOnly && !p.done && (
        <button
          onClick={() => onRead(stage.id)}
          data-testid={`plan-mark-read-${stage.id}`}
          className={gold}
        >
          <Check size={15} /> {t('plan.markAsRead')}
        </button>
      )}

      {stage.drill && !p.locked && (
        <button
          onClick={() => setMode(stage.drill!.mode)}
          data-testid={`plan-drill-${stage.id}`}
          className={primary ? gold : ghost}
        >
          <Play size={15} /> {p.done ? t('plan.practiseAgain') : t('plan.startDrilling')}
        </button>
      )}

      {p.locked && (
        <button
          onClick={() => showUpgrade(t('plan.stageIsPro', { stage: t(stage.titleKey) }))}
          data-testid={`plan-unlock-${stage.id}`}
          className={ghost}
        >
          <Lock size={15} /> {t('plan.unlockPro')}
        </button>
      )}
    </div>
  )
}
