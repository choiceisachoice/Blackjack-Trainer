import { useEffect, useState, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Check, Lock, BookOpen, Play, Route, RotateCcw, Zap, ChevronRight, Flag, CalendarCheck, CalendarClock, Pencil, X, TrendingUp, ClipboardList } from 'lucide-react'
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
  getPlacement,
  setPlacement,
  getReadStages,
  markStageRead,
  hasSkippedPlacement,
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
  derivePace,
  nextGoalUp,
  proStagesFor,
  GOAL_OPTIONS,
  COMMITMENT_OPTIONS,
  type LearnerProfile,
} from '../../services/learner-profile'
import { weekStartKey } from '../../services/date-utils'
import { deriveRhythm, rhythmMessage } from '../../services/training-rhythm'
import { WelcomeScreen } from '../onboarding/WelcomeScreen'
import { hasSeenWelcome, setWelcomeSeen } from '../../services/onboarding'
import { setRecommendation } from '../../services/recommendation'

/**
 * Used only when the profile is somehow missing while a placement exists —
 * storage cleared between the two writes, say. The full path and a middling
 * pace are the assumptions that hide the least from the learner.
 */
const FALLBACK_PROFILE: LearnerProfile = profileForLevel()

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

  const [placement, setPlacementState] = useState(() => getPlacement())
  const [profile, setProfileState] = useState<LearnerProfile | null>(() => getProfile())
  const [readStages, setReadStages] = useState(() => getReadStages())
  // Only ever shown to an account that has neither been greeted nor placed —
  // a retake must not drop the learner back onto a welcome screen.
  const [editing, setEditing] = useState(false)
  const [greeted, setGreeted] = useState(() => hasSeenWelcome() || getPlacement() !== null)
  // Declining the test is a decision, not a deferral to re-ask every visit.
  const [skipped, setSkipped] = useState(() => hasSkippedPlacement())

  // The plan is entirely derived from session history, so it has to be loaded.
  useEffect(() => {
    if (lifetimeStats == null) loadStats()
  }, [lifetimeStats, loadStats])

  // ── 0. Brand-new account → say hello before asking anything ──
  if (!greeted) {
    return (
      <WelcomeScreen
        isPro={isPro}
        onStart={() => {
          setWelcomeSeen()
          setGreeted(true)
        }}
      />
    )
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
          setPlacementSkipped()
          setSkipped(true)
        }}
        onPick={option => {
          const derived = profileForLevel()
          setPlacement(option.stage)
          setProfile(derived)
          setProfileState(derived)
          // Remembered so the home screen can open with a first move that
          // matches the answer, rather than the same greeting for everyone.
          setRecommendation(option.value)
          setPlacementState(option.stage)
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
  const progress = deriveCurriculum(sessions, readStages, isPro)
  const goal = profile?.goal ?? 'serious'
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
  const pace = derivePace(profile?.commitment ?? 'casual', sessions, weekStartKey())
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
  const doneCount = inGoal.filter(p => p.done).length
  const totalCount = inGoal.length

  const confirmRead = (id: StageProgress['stage']['id']) => {
    markStageRead(id)
    setReadStages(getReadStages())
  }

  const retake = () => {
    clearPlacementSkip()
    setSkipped(false)
    setPlacementState(null)
  }

  /**
   * Change one answer without re-running the placement test.
   *
   * Goal and pace are opinions, not measurements — they can change on a
   * Tuesday. Making someone re-prove their skill to say "I have more time now"
   * is the kind of friction that ends with the plan being ignored.
   */
  const updateProfile = (patch: Partial<LearnerProfile>) => {
    const next = { ...(profile ?? FALLBACK_PROFILE), ...patch }
    setProfile(next)
    setProfileState(next)
  }

  return (
    <div
      className={
        embedded
          // Centring lives here rather than in the slot content. The slots are
          // handed `max-w-*` blocks, and a max-width inside a plain full-width
          // parent is left-aligned, not centred — so the title and the
          // recommendation sat hard left while the plan below them (which has
          // its own `mx-auto`) was centred. Making the wrapper a centring
          // column fixes every slot at once instead of one component at a time.
          ? 'w-full flex flex-col items-center'
          : 'app-canvas flex-1 overflow-y-auto p-4 md:p-6'
      }
      data-testid="training-plan"
    >
      {before}
      <div className={embedded ? 'w-full max-w-3xl mx-auto' : 'max-w-3xl mx-auto py-6'}>
        <header className="text-center">
          {/* Embedded, the page already carries the product name and a greeting —
              a second big title stacked on the first is the clutter this move
              was supposed to remove. */}
          {!embedded && (
            <>
              <span className="grid place-items-center w-12 h-12 mx-auto rounded-xl text-gold bg-gold/10 border border-gold/20 mb-4">
                <Route size={22} />
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-gold-gradient leading-[1.15] pb-0.5">
                Your training plan
              </h1>
            </>
          )}
          <p className={`text-sm text-content/55 ${embedded ? '' : 'mt-2'}`}>
            {doneCount} of {totalCount} stage{totalCount === 1 ? '' : 's'} complete
          </p>

          {/* The destination, stated every time rather than once on the result
              screen. A plan whose end you have to remember is a to-do list. */}
          <div className="mt-5 flex flex-wrap items-stretch justify-center gap-2.5">
            <button
              onClick={() => setEditing(v => !v)}
              data-testid="plan-goal"
              className="group surface rounded-xl px-4 py-3 text-left cursor-pointer
                border border-transparent hover:border-gold/35 transition-colors"
            >
              <div className="flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.14em] uppercase text-content/40">
                <Flag size={12} /> {t('plan.yourGoal')}
                <Pencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="mt-1 text-sm font-semibold">{t(CURRICULUM[goalIndex].titleKey)}</div>
            </button>

            <button
              onClick={() => setEditing(v => !v)}
              data-testid="plan-pace"
              className="group surface rounded-xl px-4 py-3 text-left cursor-pointer
                border border-transparent hover:border-gold/35 transition-colors"
            >
              <div className="flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.14em] uppercase text-content/40">
                <CalendarCheck size={12} /> {t('plan.thisWeek')}
                <Pencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums">
                <span className={pace.met ? 'text-success' : undefined}>{pace.done}</span>
                <span className="text-content/40"> {t('plan.ofNSessions', { n: pace.target })}</span>
              </div>
            </button>
          </div>
        </header>

        {!placed && (
          <button
            onClick={retake}
            data-testid="plan-take-test"
            className="mt-6 w-full text-left rounded-2xl border border-gold/35 p-4 md:p-5
              bg-[linear-gradient(180deg,rgba(24,20,10,.5),var(--color-surface))]
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
        )}

        {editing && (
          <PlanSettings
            profile={profile ?? FALLBACK_PROFILE}
            isPro={isPro}
            onChange={updateProfile}
            onClose={() => setEditing(false)}
          />
        )}

        {/* Time passed. A plan notices; a to-do list does not. */}
        {rhythmText && (
          <div
            className={`mt-7 rounded-2xl p-4 md:p-5 border ${
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
        )}

        {/* Up next — the single most important thing on this screen */}
        {active ? (
          <div
            className="mt-8 rounded-2xl border border-gold/40 p-5 md:p-6
              bg-[linear-gradient(180deg,rgba(24,20,10,.6),var(--color-surface))]"
            data-testid="plan-up-next"
          >
            <div className="text-xs font-bold tracking-[0.16em] uppercase text-gold">{t('plan.upNext')}</div>
            <h2 className="mt-2 text-xl md:text-2xl font-bold tracking-tight">{t(active.stage.titleKey)}</h2>
            <p className="mt-2 text-sm text-content/70 leading-relaxed max-w-[54ch]">{t(active.stage.goalKey)}</p>
            <p className="mt-2 text-sm text-content/50 leading-relaxed max-w-[54ch]">{t(active.stage.whyKey)}</p>

            <StageStanding effort={stageEffort(active)} target={active.target} />

            <StageActions
              p={active}
              setMode={setMode}
              onRead={confirmRead}
              showUpgrade={showUpgrade}
              primary
            />

            <div className="mt-5 pt-4 border-t border-contrast/10 flex flex-wrap items-center justify-between gap-4">
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
              <StageForm trend={trend} onOpenAnalytics={() => setMode('analytics')} />
            </div>
          </div>
        ) : (
          <div className="mt-8 surface rounded-2xl p-6 text-center" data-testid="plan-complete">
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
            {harder && (
              <button
                onClick={() => updateProfile({ goal: harder })}
                data-testid="plan-extend-goal"
                className="mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold
                  bg-gradient-to-br from-gold-bright to-gold text-casino-bg cursor-pointer"
              >
                <TrendingUp size={16} />
                {t('plan.aimFor', { stage: t(CURRICULUM[stageIndex(goalStage(harder))].titleKey) })}
              </button>
            )}
          </div>
        )}

        {/* A free learner can hit a Pro stage with a free one right behind it.
            Say so, rather than leaving the plan pointing at a locked door. */}
        {openInstead && (
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
        )}

        {/* Today's challenge, chosen to fit this stage — the daily loop and the
            plan are the same journey, so the plan says so. */}
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
                <div className="mt-0.5 font-semibold truncate">{challenge.title}</div>
              </div>
              <span className="shrink-0 text-sm font-semibold text-gold tabular-nums">
                +{CHALLENGE_XP[challenge.difficulty]} XP
              </span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-contrast/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gold transition-[width] duration-300"
                style={{ width: `${Math.min(challengeState.progress / Math.max(challenge.target, 1), 1) * 100}%` }}
              />
            </div>
          </button>
        )}

        {/* The full path */}
        <h3 className="mt-10 mb-3 text-xs font-bold tracking-[0.16em] uppercase text-content/40">
          {t('plan.fullPath')}
        </h3>
        <ol className="flex flex-col gap-2.5">
          {progress.map((p, i) => {
            const before = i < from
            const beyond = isBeyondGoal(p.stage.id, goal)
            const isActive = active?.stage.id === p.stage.id
            return (
              <li
                key={p.stage.id}
                data-testid={`plan-stage-${p.stage.id}`}
                className={`surface rounded-2xl p-4 md:p-5 ${isActive ? 'border border-gold/35' : ''} ${
                  (before && !p.done) || beyond ? 'opacity-55' : ''
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <span
                    className={`grid place-items-center w-7 h-7 rounded-full shrink-0 text-xs font-bold border ${
                      p.done
                        ? 'bg-gold border-gold text-casino-bg'
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
                      {placed && before && !p.done && (
                        <span className="text-[0.7rem] text-content/40">{t('plan.skippedByPlacement')}</span>
                      )}
                      {beyond && (
                        <span className="text-[0.7rem] text-content/40">{t('plan.beyondGoal')}</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-content/55 leading-snug">{t(p.stage.goalKey)}</p>

                    {p.stage.drill && (
                      <>
                        <div className="mt-2 flex items-center gap-2.5">
                          <div className="h-1.5 w-28 rounded-full bg-contrast/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gold transition-[width] duration-300"
                              style={{ width: `${(p.current / Math.max(p.target, 1)) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-content/45 tabular-nums">
                            {p.current}/{p.target} — {drillDescription(p.stage.drill, t)}
                          </span>
                        </div>
                        <EffortLine effort={stageEffort(p)} />
                      </>
                    )}
                  </div>
                </div>

                {!isActive && (
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
          className="mt-8 inline-flex items-center gap-2 text-sm text-content/50 hover:text-content cursor-pointer"
        >
          {/* No longer a "test" — it is one question, and calling it a test
              makes it sound like something worth avoiding. */}
          <RotateCcw size={15} /> {placed ? t('plan.changeStart') : t('plan.chooseStart')}
        </button>

        {!embedded && <div aria-hidden className="w-full h-16 shrink-0" />}
      </div>
      {after}
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
  onChange,
  onClose,
}: {
  profile: LearnerProfile
  isPro: boolean
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

      <h3 className="mt-6 text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-content/40">
        {t('plan.weeklyPace')}
      </h3>
      <div className="mt-2.5 flex flex-col gap-2">
        {COMMITMENT_OPTIONS.map(o => (
          <button
            key={o.value}
            onClick={() => onChange({ commitment: o.value })}
            data-testid={`plan-set-pace-${o.value}`}
            className={row(profile.commitment === o.value)}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-[0.95rem]">{t(o.labelKey)}</span>
              {profile.commitment === o.value && <Check size={16} className="text-gold shrink-0" />}
            </div>
            <div className="mt-0.5 text-sm text-content/45">{t('profile.pace.hint', { n: o.sessionsPerWeek })}</div>
          </button>
        ))}
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
          {last}% <span className="text-content/35 font-normal">/ {trend.floor}%</span>
        </span>
      </span>
      <Sparkline data={trend.points} />
      <ChevronRight size={15} className="text-content/25 group-hover:text-gold transition-colors" />
    </button>
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
}: {
  p: StageProgress
  setMode: (m: ReturnType<typeof useAppStore.getState>['currentMode']) => void
  onRead: (id: StageProgress['stage']['id']) => void
  showUpgrade: (headline?: string) => void
  primary?: boolean
}) {
  const { t } = useTranslation()
  const { stage } = p
  const base = 'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold cursor-pointer transition-colors'
  const gold = `${base} bg-gradient-to-br from-gold-bright to-gold text-casino-bg`
  const ghost = `${base} border border-contrast/15 text-content hover:border-gold/45`

  return (
    <div className={`flex flex-wrap gap-2.5 ${primary ? 'mt-5' : 'mt-3.5 pl-[2.6rem]'}`}>
      {stage.read && (
        <button onClick={() => setMode(stage.read!.mode)} className={primary ? ghost : ghost}>
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
