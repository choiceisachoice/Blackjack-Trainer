import { useMemo, useState } from 'react'
import { Check, X, ArrowRight, Spade, Layers, Flag, Lock } from 'lucide-react'
import {
  ENTRY_OPTIONS,
  CHECKED_STAGES,
  buildChecks,
  startProbe,
  nextCheck,
  recordAnswer,
  resolvePlacement,
  type CheckQuestion,
  type EntryOption,
  type Placement,
  type ProbeState,
} from '../../services/skill-assessment'
import { CURRICULUM, stageIndex } from '../../services/curriculum'
import {
  GOAL_OPTIONS,
  COMMITMENT_OPTIONS,
  CASINO_OPTIONS,
  MATHS_OPTIONS,
  SOURCE_OPTIONS,
  goalStage,
  estimateToGoal,
  playsForRealMoney,
  proStagesFor,
  type Goal,
  type Commitment,
  type CasinoExperience,
  type MathsComfort,
  type Source,
  type LearnerProfile,
} from '../../services/learner-profile'
import { TeachingCard, HandFigure } from '../learn/TeachingVisuals'

/**
 * Staggered entrance in CSS. See WelcomeScreen for why this is not a JS
 * animation: a JS entrance that starts at opacity 0 leaves the whole screen
 * invisible whenever requestAnimationFrame does not run.
 */
const rise = (delay: number, className = '') => ({
  className: `rise-in ${className}`,
  style: { animationDelay: `${delay}s` },
})

/**
 * The placement test — one self-placement question, then an adaptive probe.
 *
 * The number of questions is deliberately not shown up front: the test asks
 * only what it needs, so a counter answers three and a beginner answers three
 * different ones. Showing "3 of 6" would be a promise the search cannot keep.
 */
export function SkillAssessment({
  onDone,
  onSkip,
  isPro = true,
}: {
  onDone: (p: Placement, profile: LearnerProfile) => void
  /**
   * Leave without answering. Offered because the plan is the app's front door:
   * a front door you cannot walk past is a gate, and someone who just wants to
   * try a drill should not have to pass an exam first.
   */
  onSkip?: () => void
  /** Used only to warn, before choosing, which goals contain Pro stages. */
  isPro?: boolean
}) {
  const checks = useMemo(() => buildChecks(), [])
  const [goal, setGoal] = useState<Goal | null>(null)
  const [commitment, setCommitment] = useState<Commitment | null>(null)
  const [casino, setCasino] = useState<CasinoExperience | null>(null)
  const [maths, setMaths] = useState<MathsComfort | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [entry, setEntry] = useState<EntryOption | null>(null)
  const [state, setState] = useState<ProbeState | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)

  const check = state ? nextCheck(state, checks) : null

  const finish = (placement: Placement) => {
    // Both intent answers are collected before any of this can run, so the
    // fallbacks below are unreachable in practice — they exist so the type is
    // honest rather than asserted away.
    onDone(placement, {
      goal: goal ?? 'curious',
      commitment: commitment ?? 'casual',
      casino: casino ?? 'never',
      maths: maths ?? 'okay',
      source: source ?? 'other',
    })
  }

  const pickEntry = (option: EntryOption) => {
    const probe = startProbe(option.stage)
    setEntry(option)
    setState(probe)
    // "I've never played" claims nothing, so the probe converges with no
    // questions to ask. Without this the screen renders neither the ladder nor
    // a question and the flow simply stops — found by clicking, not by a test.
    if (!nextCheck(probe, checks)) finish(resolvePlacement(probe))
  }

  const answer = (value: string) => setChosen(value)

  const advance = () => {
    if (!state || !check || chosen === null) return
    const next = recordAnswer(state, check, chosen)
    setChosen(null)
    setState(next)
    if (!nextCheck(next, checks)) finish(resolvePlacement(next))
  }

  // How much of the search is resolved — honest progress for a test whose
  // length isn't known in advance.
  const resolved = state
    ? 1 - (state.high - state.low) / CHECKED_STAGES.length
    : 0

  // Everything before 'ladder' is answerable by anyone, which is why it comes
  // first: a beginner should have said five useful things about themselves
  // before meeting a word like "count".
  const phase: Phase =
    goal === null ? 'goal'
    : commitment === null ? 'time'
    : casino === null ? 'casino'
    : maths === null ? 'maths'
    : source === null ? 'source'
    : entry === null ? 'ladder'
    : 'checks'

  return (
    <div className="app-canvas flex-1 overflow-y-auto" data-testid="skill-assessment">
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-10 md:py-14">
        <Header phase={phase} progress={resolved} />

        {phase === 'goal' && (
          <Choices
            options={GOAL_OPTIONS.map(o => {
              const locked = isPro ? [] : proStagesFor(o.value)
              return {
                key: o.value,
                label: o.label,
                hint: o.hint,
                // Said here rather than after the plan is built. A goal that
                // cannot be finished on this account is not a surprise worth
                // saving for later.
                note: locked.length
                  ? `${locked.length} of these stage${locked.length > 1 ? 's' : ''} need Pro`
                  : undefined,
              }
            })}
            testIdPrefix="goal"
            onPick={key => setGoal(key as Goal)}
          />
        )}

        {phase === 'time' && (
          <Choices
            options={COMMITMENT_OPTIONS.map(o => ({ key: o.value, label: o.label, hint: o.hint }))}
            testIdPrefix="time"
            onPick={key => setCommitment(key as Commitment)}
          />
        )}

        {phase === 'casino' && (
          <Choices
            options={CASINO_OPTIONS.map(o => ({ key: o.value, label: o.label, hint: o.hint }))}
            testIdPrefix="casino"
            onPick={key => setCasino(key as CasinoExperience)}
          />
        )}

        {phase === 'maths' && (
          <Choices
            options={MATHS_OPTIONS.map(o => ({ key: o.value, label: o.label, hint: o.hint }))}
            testIdPrefix="maths"
            onPick={key => setMaths(key as MathsComfort)}
          />
        )}

        {phase === 'source' && (
          <Choices
            options={SOURCE_OPTIONS.map(o => ({ key: o.value, label: o.label, hint: o.hint }))}
            testIdPrefix="source"
            onPick={key => setSource(key as Source)}
          />
        )}

        {phase === 'ladder' && (
          <Choices
            options={ENTRY_OPTIONS.map(o => ({ key: o.value, label: o.label, hint: o.hint }))}
            testIdPrefix="entry"
            onPick={key => {
              const option = ENTRY_OPTIONS.find(o => o.value === key)
              if (option) pickEntry(option)
            }}
          />
        )}

        {check && (
            <div key={check.stage} {...rise(0, 'mt-8')}>
              <CheckStep
                check={check}
                chosen={chosen}
                onAnswer={answer}
                onNext={advance}
              />
            </div>
          )}

        {/* Only on the first question. Once someone has started answering,
            offering an exit is a distraction rather than a kindness. */}
        {onSkip && phase === 'goal' && (
          <button
            onClick={onSkip}
            data-testid="assessment-skip"
            className="mt-8 mx-auto block text-sm text-content/40 hover:text-content/70
              cursor-pointer transition-colors"
          >
            Skip for now — let me look around first
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Which of the four phases the learner is in.
 *
 * Intent comes before ability on purpose. Everyone can answer what they want
 * and how much time they have; the experience ladder needs words like "count"
 * and "true count" to mean something, and opening with vocabulary a beginner
 * cannot read is its own kind of unfair.
 */
type Phase = 'goal' | 'time' | 'casino' | 'maths' | 'source' | 'ladder' | 'checks'

const COPY: Record<Phase, { title: string; body: string }> = {
  goal: {
    title: 'What do you want out of this?',
    body: 'There is no wrong answer, and it decides where your plan ends — no point drilling bet sizing if you never intend to bet.',
  },
  time: {
    title: 'How much time can you give it?',
    body: 'Be realistic rather than ambitious. This becomes your weekly target and sets the pace of your plan — it is not a promise you have to keep.',
  },
  casino: {
    title: 'Have you played at a real table?',
    body: 'It changes what this app should be telling you. There is nothing wrong with never having set foot in one.',
  },
  maths: {
    title: 'How are you with quick mental arithmetic?',
    body: 'One stage asks you to divide in your head while a dealer waits. Answering honestly buys you more practice there, not a worse plan.',
  },
  source: {
    title: 'How did you find us?',
    body: 'This one is for us rather than for you — it tells us where to keep putting the work. Pick whatever is closest.',
  },
  ladder: {
    title: 'How much blackjack do you already know?',
    body: 'Pick the highest one that is true. If none of them are, the first option is the honest answer and costs you nothing.',
  },
  checks: {
    title: 'Let’s check that',
    body: 'A few real questions. Answer honestly — a wrong one just tells us where to begin, and you’ll get the reasoning either way.',
  },
}

function Header({ phase, progress }: { phase: Phase; progress: number }) {
  const copy = COPY[phase]
  return (
    <header>
      <span className="grid place-items-center w-11 h-11 rounded-xl text-gold bg-gold/10 border border-gold/20 mb-5">
        <Spade size={20} className="fill-current" />
      </span>
      <h1 className="text-[1.75rem] md:text-4xl font-extrabold text-gold-gradient leading-[1.1] pb-1 tracking-tight">
        {copy.title}
      </h1>
      <p className="mt-3 text-[0.95rem] text-content/55 leading-relaxed max-w-[52ch]">
        {copy.body}
      </p>

      {phase === 'checks' && (
        <div className="mt-7 h-[3px] w-full rounded-full bg-contrast/8 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold-bright to-gold
              transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${Math.max(progress, 0.08) * 100}%` }}
          />
        </div>
      )}
    </header>
  )
}

/**
 * A list of pickable answers, used by every question that isn't a card
 * situation. One component so the goal, time and experience steps cannot drift
 * apart visually — three near-identical hand-rolled lists is how that happens.
 */
function Choices({
  options,
  testIdPrefix,
  onPick,
}: {
  options: { key: string; label: string; hint: string; note?: string }[]
  testIdPrefix: string
  onPick: (key: string) => void
}) {
  return (
    <div className="mt-8 flex flex-col gap-2.5">
      {options.map((o, i) => (
        <button
          key={o.key}
          onClick={() => onPick(o.key)}
          data-testid={`${testIdPrefix}-${o.key}`}
          {...rise(0.04 + i * 0.05, `group w-full text-left rounded-2xl border border-contrast/12 bg-contrast/[.03] p-4 md:p-5
            hover:border-gold/45 hover:bg-gold/[.06] cursor-pointer transition-colors`)}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="font-semibold text-[1.05rem]">{o.label}</div>
              <div className="mt-1 text-sm text-content/50 leading-snug">{o.hint}</div>
              {o.note && (
                <div
                  className="mt-2 inline-flex items-center gap-1.5 text-[0.7rem] font-bold tracking-wider
                    text-gold border border-gold/35 bg-gold/10 rounded-full px-2 py-0.5"
                  data-testid={`${testIdPrefix}-${o.key}-note`}
                >
                  <Lock size={10} /> {o.note}
                </div>
              )}
            </div>
            <ArrowRight
              size={18}
              className="shrink-0 text-content/25 group-hover:text-gold transition-colors"
            />
          </div>
        </button>
      ))}
    </div>
  )
}

/** One check: the situation as cards, the choices, then the reasoning. */
function CheckStep({
  check,
  chosen,
  onAnswer,
  onNext,
}: {
  check: CheckQuestion
  chosen: string | null
  onAnswer: (value: string) => void
  onNext: () => void
}) {
  const revealed = chosen !== null
  const correct = chosen === check.correct

  return (
    <div className="surface rounded-2xl p-5 md:p-7">
      <div className="text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-gold/70">
        {CURRICULUM[stageIndex(check.stage)].title}
      </div>
      <h2 className="mt-2.5 text-lg md:text-[1.35rem] font-bold tracking-tight leading-snug">
        {check.prompt}
      </h2>
      <p className="mt-1.5 text-sm text-content/55">{check.context}</p>

      <Situation check={check} />

      <div className="mt-6 flex flex-col gap-2.5">
        {check.options.map(o => {
          const isChosen = chosen === o
          const isAnswer = o === check.correct
          // After answering, always show which one was right — being told only
          // "wrong" teaches nothing.
          const tone = !revealed
            ? 'border-contrast/12 bg-contrast/[.03] hover:border-gold/45 hover:bg-gold/[.06]'
            : isAnswer
              ? 'border-success/60 bg-success/10'
              : isChosen
                ? 'border-error/50 bg-error/10'
                : 'border-contrast/10 opacity-45'

          return (
            <button
              key={o}
              disabled={revealed}
              onClick={() => onAnswer(o)}
              data-testid={`check-${check.stage}-${o}`}
              className={`w-full text-left px-4 py-3.5 rounded-xl border flex items-center justify-between gap-3
                text-[0.95rem] font-medium transition-colors ${tone} ${revealed ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <span>{o}</span>
              {revealed && isAnswer && <Check size={17} className="text-success shrink-0" />}
              {revealed && isChosen && !isAnswer && <X size={17} className="text-error shrink-0" />}
            </button>
          )
        })}
      </div>

      {revealed && (
          <div {...rise(0, 'overflow-hidden')} data-testid="check-explanation">
            <div className="mt-6 pt-5 border-t border-contrast/10">
              <div className={`text-sm font-bold ${correct ? 'text-success' : 'text-warning'}`}>
                {correct ? 'Correct.' : 'Not quite.'}
              </div>
              <p className="mt-2 text-[0.95rem] text-content/70 leading-relaxed max-w-[58ch]">
                {check.explanation}
              </p>
              <button
                onClick={onNext}
                data-testid="check-next"
                className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold
                  bg-gradient-to-br from-gold-bright to-gold text-casino-bg cursor-pointer"
              >
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
    </div>
  )
}

/**
 * The situation, drawn rather than described — a hand, a run of cards, or the
 * count state. Reading "you hold A♥ 7♠" is work; seeing the hand is not.
 */
function Situation({ check }: { check: CheckQuestion }) {
  if (!check.hand && !check.sequence && !check.count) return null

  return (
    <div
      className="mt-5 rounded-xl border border-contrast/10 bg-[rgba(0,0,0,.22)] p-4 md:p-5"
      data-testid="check-situation"
    >
      {check.hand && (
        <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
          <HandFigure cards={check.hand.player} label="You" />
          <HandFigure cards={[check.hand.dealer]} label="Dealer shows" />
        </div>
      )}

      {check.sequence && (
        <div className="flex flex-wrap items-center gap-2">
          {check.sequence.cards.map((c, i) => (
            <TeachingCard key={`${c.rank}${c.suit}${i}`} card={c} />
          ))}
        </div>
      )}

      {check.count && (
        <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 ${check.hand || check.sequence ? 'mt-5 pt-4 border-t border-contrast/10' : ''}`}>
          <span className="inline-flex items-center gap-2 text-sm">
            <span className="text-content/40">Running count</span>
            <span className="font-bold tabular-nums text-gold">
              {check.count.running > 0 ? `+${check.count.running}` : check.count.running}
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-sm">
            <Layers size={14} className="text-content/30" />
            <span className="text-content/40">Decks left</span>
            <span className="font-bold tabular-nums text-content/80">{check.count.decksLeft}</span>
          </span>
        </div>
      )}
    </div>
  )
}

/** Shown after the test: where you landed and why. */
export function PlacementResult({
  placement,
  profile,
  onStart,
}: {
  placement: Placement
  profile: LearnerProfile
  onStart: () => void
}) {
  const stage = CURRICULUM[stageIndex(placement.stage)]
  const skipped = stageIndex(placement.stage)
  const target = CURRICULUM[stageIndex(goalStage(profile.goal))]
  const estimate = estimateToGoal(placement.stage, profile.goal, profile.commitment, profile.maths)

  return (
    <div {...rise(0, 'surface rounded-2xl p-6 md:p-8')} data-testid="placement-result">
      <div className="text-[0.6875rem] font-bold tracking-[0.16em] uppercase text-gold">
        Your starting point
      </div>
      <h2 className="mt-2.5 text-2xl md:text-3xl font-bold tracking-tight leading-tight">
        {stage.title}
      </h2>
      <p className="mt-3 text-[0.95rem] text-content/65 leading-relaxed max-w-[52ch]">
        {placement.reason}
      </p>

      <div className="mt-6 flex flex-wrap gap-x-7 gap-y-2.5 text-sm text-content/55">
        {placement.asked > 0 && (
          <span>
            <b className="text-content font-semibold tabular-nums">
              {placement.correct}/{placement.asked}
            </b>{' '}
            checks correct
          </span>
        )}
        {skipped > 0 && (
          <span>
            <b className="text-content font-semibold tabular-nums">{skipped}</b>{' '}
            stage{skipped > 1 ? 's' : ''} skipped
          </span>
        )}
      </div>

      {/* Where this ends and roughly when — the answer to the question the goal
          and time questions were actually asked for. */}
      {estimate.stages > 0 && (
        <div
          className="mt-6 pt-5 border-t border-contrast/10 flex items-start gap-3"
          data-testid="placement-estimate"
        >
          <Flag size={16} className="text-gold shrink-0 mt-0.5" />
          <p className="text-sm text-content/60 leading-relaxed max-w-[52ch]">
            Your plan ends at <b className="text-content font-semibold">{target.title}</b> —{' '}
            <b className="text-content font-semibold tabular-nums">{estimate.stages}</b>{' '}
            stage{estimate.stages > 1 ? 's' : ''} and{' '}
            <b className="text-content font-semibold tabular-nums">{estimate.sessions}</b>{' '}
            drills away. At the pace you picked that is roughly{' '}
            <b className="text-gold font-semibold tabular-nums">
              {estimate.weeks} week{estimate.weeks > 1 ? 's' : ''}
            </b>
            , assuming
            you clear each drill’s bar. You can go further later; nothing is closed off.
          </p>
        </div>
      )}

      {/* Said only to the learner who told us they already play for money. It
          is the one group for whom a training plan is not a hobby, and the
          honest thing is to say what counting does and does not do. */}
      {playsForRealMoney(profile.casino) && (
        <p
          className="mt-5 text-sm text-content/45 leading-relaxed max-w-[54ch]"
          data-testid="placement-money-note"
        >
          You said you play in a real casino. Counting done properly turns a small
          house edge into a small player edge — it does not remove losing nights,
          and it only pays over a lot of hands. Until the stages below are solid,
          the maths is not on your side.
        </p>
      )}

      <button
        onClick={onStart}
        data-testid="placement-start"
        className="mt-7 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold
          bg-gradient-to-br from-gold-bright to-gold text-casino-bg cursor-pointer"
      >
        Start training <ArrowRight size={16} />
      </button>
    </div>
  )
}
