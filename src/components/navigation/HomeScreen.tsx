import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Zap, GraduationCap, Coins, Layers, Wallet, Club,
  ClipboardList, BarChart3, Grid3x3, Trophy, BookOpen, ArrowRight,
  Lock,
  type LucideIcon,
} from 'lucide-react'
import { useAppStore } from '../../store/app-store'
import { isProMode, isModeLocked } from '../../services/pro-features'
import { useIsPro } from '../../store/entitlement-store'
import { useTrialLeft } from '../../store/casino-trial-store'
import type { AppMode } from '../../store/app-store'
import { useAchievementStore } from '../../store/achievement-store'
import { useStatsStore } from '../../store/stats-store'
import { ALL_ACHIEVEMENTS } from '../../services/achievements/achievement-list'
import { TrainingPlan } from '../plan/TrainingPlan'
import { GuidedTour } from '../onboarding/GuidedTour'
import { DailyChallengeCard } from './DailyChallengeCard'
import { WeeklyChallengeCard } from './WeeklyChallengeCard'
import { DashboardHeader } from './DashboardHeader'
import { ResumeSessionCard } from '../casino-session/ResumeSessionCard'

interface FeatureCard {
  mode: AppMode
  icon: LucideIcon
  titleKey: string
  descKey: string
}

// The names come from the shared `modes` namespace, not from here: the home
// screen, the nav bar, the analytics header and the Learn guide all label the
// same screens, and they used to hold four separate copies of those words.
const TRAINING_CARDS: FeatureCard[] = [
  { mode: 'speedDrill', icon: Zap, titleKey: 'modes.speedDrill', descKey: 'home.desc.speedDrill' },
  { mode: 'deviationTraining', icon: GraduationCap, titleKey: 'modes.deviationFlashCards', descKey: 'home.desc.deviationTraining' },
  { mode: 'betSpread', icon: Coins, titleKey: 'modes.betSpread', descKey: 'home.desc.betSpread' },
  { mode: 'deckEstimation', icon: Layers, titleKey: 'modes.deckEstimation', descKey: 'home.desc.deckEstimation' },
]

// The two logs that belong to the table: real casino results and the
// training table's own sessions. They used to sit one among the drills and
// one under the table, and their names ("Bankroll Tracker", "Casino Session
// Tracker") then read as swapped. Beside the table they explain each other.
const RECORD_CARDS: FeatureCard[] = [
  { mode: 'bankrollSim', icon: Wallet, titleKey: 'modes.bankrollTracker', descKey: 'home.desc.bankrollSim' },
  { mode: 'casinoSessionTracker', icon: ClipboardList, titleKey: 'home.trackerTitle', descKey: 'home.desc.tracker' },
]

const TOOL_CARDS: FeatureCard[] = [
  { mode: 'learn', icon: BookOpen, titleKey: 'modes.learn', descKey: 'home.desc.learn' },
  { mode: 'analytics', icon: BarChart3, titleKey: 'modes.analytics', descKey: 'home.desc.analytics' },
  { mode: 'strategyChart', icon: Grid3x3, titleKey: 'modes.strategyChart', descKey: 'home.desc.strategyChart' },
  { mode: 'achievements', icon: Trophy, titleKey: 'modes.achievements', descKey: 'home.desc.achievements' },
]

const TOOL_TEST_ID: Partial<Record<AppMode, string>> = {
  learn: 'learn-button',
  analytics: 'analytics-button',
  strategyChart: 'strategy-chart-button',
  achievements: 'achievements-button',
}

/**
 * Home screen — the signed-in dashboard. It answers two questions on the first
 * screen: what do I do now, and how am I doing.
 *
 * From 1280px wide it is two columns. On the left, one greeting row, then the
 * plan's "up next" with today's start button, then everything to browse. On
 * the right, a rail: the level and the learner's figures with the week, the
 * day's and the week's challenges, and the road as a list of stages. Before
 * this the page was one 950px column, and on the owner's 2000x720 screen
 * today's start button sat at y≈1200, two scrolls down.
 *
 * Narrower, the same parts stack in the order that matters: greeting, up next
 * (start first), the rail's cards, then the modes. The marketing pitch lives
 * on the public landing page; a returning user gets their own numbers.
 */
export function HomeScreen() {
  // The tour is owned here rather than by the card that launches it: it points
  // at things all over this screen, and it has to outlive the card — taking the
  // suggestion puts the card away, and a tour unmounted by its own trigger
  // would close on its first frame.
  const [touring, setTouring] = useState(false)

  // No `min-h-full` here: that asked for a second full viewport on top of the
  // 62px header and produced a scrollbar on every visit (see TrainerApp). The
  // shell now hands down the remaining height; this only has to fill it.
  return (
    <div className="relative w-full flex flex-col items-center px-4 pb-4">

      {touring && <GuidedTour onClose={() => setTouring(false)} />}

      {/* A casino table left open — by a closed tab, a reload, a dead phone —
          is offered here, once, above everything: continue it or cash it out.
          Renders nothing when there is none (the wrapper goes with it). */}
      <div className="w-full max-w-3xl lg:max-w-5xl xl:max-w-[96rem] pt-4 empty:hidden">
        <ResumeSessionCard />
      </div>

      {/*
        The plan is the home screen, and it owns what surrounds it.

        The `before`/`after`/`rail` parts render only once the plan itself is
        showing: a brand-new account gets the welcome and the questionnaire on
        a clean screen, with no mode grid underneath to shrug at. That decision
        lives inside TrainingPlan because that is where the state lives.
      */}
      <TrainingPlan
        embedded
        onTour={() => setTouring(true)}
        before={<Greeting />}
        rail={({ week, path }) => (
          <>
            <DashboardHeader week={week} />
            {/* Today's nudge and the week's, side by side on a tablet. Under
                the plan's start, never above it: they are not the destination. */}
            <section
              data-testid="home-challenges"
              className="grid gap-3 content-start md:order-last md:col-span-2 md:grid-cols-2
                xl:order-none xl:col-span-1 xl:grid-cols-1"
            >
              <DailyChallengeCard />
              <WeeklyChallengeCard />
            </section>
            <div className="surface rounded-2xl p-5">{path}</div>
          </>
        )}
        after={<HomeSections />}
      />
    </div>
  )
}

/**
 * The page's one heading: a greeting, slim. Who the learner is — level, title,
 * figures — is the rail's job, beside it; a 30px level title up here pushed
 * the day's training down the page.
 */
function Greeting() {
  const { t } = useTranslation()
  const played = useStatsStore(s => (s.lifetimeStats?.totalSessions ?? 0) > 0 || s.sessions.length > 0)
  return (
    <h1 className="text-2xl md:text-[1.75rem] font-bold tracking-tight leading-tight">
      {played ? t('common.welcomeBack') : t('common.welcome')}
    </h1>
  )
}

/** Everything below the plan: the browsable modes, the table, the tools. */
function HomeSections() {
  const { t } = useTranslation()
  const setMode = useAppStore(s => s.setMode)
  const isPro = useIsPro()
  // The casino table's free trial: while hands remain the card says so in
  // place of its lock, and the click leads to the table instead of the paywall.
  const trialLeft = useTrialLeft()
  const tableLocked = isModeLocked('casinoSession', isPro, trialLeft > 0)
  const totalUnlocked = useAchievementStore(s => s.totalUnlocked)

  return (
    <div className="relative z-10 w-full flex flex-col mt-4 xl:mt-3">
      {/* The drills — four to a row on a wide screen, a list on a phone. Every
          grid on this page has the same four columns, so the rows line up. */}
      <section className="relative z-10 w-full mb-8">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-3 px-1">{t('home.trainingModes')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TRAINING_CARDS.map(({ mode, icon: Icon, titleKey, descKey }) => (
            <button
              key={mode}
              onClick={() => setMode(mode)}
              data-testid={`mode-card-${mode}`}
              className="surface lift-glow group relative flex items-start gap-3.5 p-4 text-left cursor-pointer overflow-hidden
                lg:flex-col lg:gap-0"
            >
              {/* The lock the nav bar has always drawn, and this grid did not.
                  Same modes, same app, two different answers to "can I open
                  this" — and the grid's answer was found out by clicking it and
                  landing on the paywall. The training plan states the rule
                  outright a few lines further up: say so, rather than pointing
                  at a locked door. */}
              {!isPro && isProMode(mode) && (
                <span
                  className="absolute top-4 right-4 flex items-center gap-1 text-[0.625rem]
                    font-bold tracking-[0.12em] uppercase text-gold/80"
                  aria-label={t('nav.proFeature')}
                >
                  <Lock size={10} />
                  {t('pricing.pro')}
                </span>
              )}
              <span className="grid place-items-center w-10 h-10 rounded-xl shrink-0 text-gold
                bg-gold/10 border border-gold/20 transition-colors duration-150
                group-hover:bg-gold/15 group-hover:border-gold/40 lg:mb-3.5">
                <Icon size={20} />
              </span>
              <div className="min-w-0 pr-8 lg:pr-0">
                <h3 className="text-[0.9375rem] font-semibold text-content leading-snug">{t(titleKey)}</h3>
                <p className="mt-1 text-[0.8125rem] text-content/50 leading-snug">{t(descKey)}</p>
              </div>
              <ArrowRight
                size={16}
                className="absolute top-4 right-4 text-content/20 -translate-x-1 opacity-0
                  transition-[opacity,transform,color] duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-gold"
              />
            </button>
          ))}
        </div>
      </section>

      {/* Casino Session — the thing the product is for — with its two logs
          beside it, under a heading of their own: under "Training modes" the
          two logs read as drills. */}
      <section className="relative z-10 w-full mb-8">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-3 px-1">{t('plan.today.kind.table')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          onClick={() => setMode('casinoSession')}
          data-testid="mode-card-casinoSession"
          className="lift-glow group relative flex items-center gap-4 w-full p-5 rounded-2xl text-left cursor-pointer
            border border-gold/30 overflow-hidden sm:col-span-2
            bg-[linear-gradient(110deg,color-mix(in_srgb,var(--color-gold)_12%,var(--color-surface)),var(--color-surface))]"
        >
          <span className="grid place-items-center w-12 h-12 rounded-xl text-gold bg-gold/15 border border-gold/30 shrink-0">
            <Club size={24} className="fill-current" />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gold flex flex-wrap items-center gap-x-2 gap-y-1">
              {t('modes.casinoSession')}
              {/* Without Pro and with trial hands left: the offer, where the
                  lock would be. One label, on the one card that leads there. */}
              {!isPro && !tableLocked && (
                <span
                  className="text-[0.6875rem] font-semibold text-gold border border-gold/35 rounded-full px-2 py-0.5 leading-none"
                  data-testid="casino-trial-offer"
                >
                  {t('casino.trial.entry', { count: trialLeft })}
                </span>
              )}
              {/* The most prominent card on the screen, presented as the thing
                  the product is for, with nothing to say it is gated. */}
              {tableLocked && (
                <span
                  className="flex items-center gap-1 text-[0.625rem] font-bold
                    tracking-[0.12em] uppercase text-gold/80"
                  aria-label={t('nav.proFeature')}
                >
                  <Lock size={10} />
                  {t('pricing.pro')}
                </span>
              )}
            </h3>
            <p className="text-sm text-content/55">{t('home.desc.casinoSession')}</p>
          </div>
          <ArrowRight size={18} className="ml-auto shrink-0 text-gold/60 group-hover:translate-x-1 transition-transform duration-150 ease-out" />
        </button>

        {RECORD_CARDS.map(card => (
          <SmallCard
            key={card.mode}
            card={card}
            testId={`mode-card-${card.mode}`}
            locked={!isPro && isProMode(card.mode)}
            onOpen={() => setMode(card.mode)}
          />
        ))}
        </div>
      </section>

      {/* Tools */}
      <section className="relative z-10 w-full mb-10">
        <h2 className="text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-3 px-1">{t('home.toolsProgress')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TOOL_CARDS.map(card => (
            <SmallCard
              key={card.mode}
              card={card}
              testId={TOOL_TEST_ID[card.mode]}
              onOpen={() => setMode(card.mode)}
              suffix={card.mode === 'achievements' ? `(${totalUnlocked}/${ALL_ACHIEVEMENTS.length})` : undefined}
            />
          ))}
        </div>
      </section>

      {/* Scroll-end breathing room. A real box is used (not padding/margin),
          because browsers exclude a scroll container's trailing padding and the
          last child's bottom margin from the scrollable overflow area. */}
      <div aria-hidden className="w-full h-12 md:h-16 shrink-0" />
    </div>
  )
}

/** A compact way into one screen: icon, name, one line — the tools and the table's logs. */
function SmallCard({ card, testId, onOpen, locked = false, suffix }: {
  card: FeatureCard
  testId?: string
  onOpen: () => void
  /** A Pro screen, for an account without Pro: say so on the card. */
  locked?: boolean
  /** A small figure after the name, e.g. awards unlocked. */
  suffix?: string
}) {
  const { t } = useTranslation()
  const { icon: Icon, titleKey, descKey } = card
  return (
    <button
      onClick={onOpen}
      data-testid={testId}
      className="surface lift-glow group relative flex items-start gap-3 p-4 text-left cursor-pointer"
    >
      <span className="grid place-items-center w-10 h-10 rounded-lg text-gold bg-gold/10 border border-gold/20 shrink-0
        transition-colors duration-150 group-hover:bg-gold/15">
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-content">
          {t(titleKey)}
          {suffix && <span className="ml-1.5 text-xs font-normal text-content/45">{suffix}</span>}
          {/* Inline after the name: a corner badge took a column of the
              card's width and broke its name in two. */}
          {locked && (
            <span
              className="ml-2 inline-flex items-center gap-1 align-[1px] text-[0.625rem]
                font-bold tracking-[0.12em] uppercase text-gold/80"
              aria-label={t('nav.proFeature')}
            >
              <Lock size={10} />
              {t('pricing.pro')}
            </span>
          )}
        </h3>
        <p className="text-xs text-content/50 mt-0.5 leading-snug">{t(descKey)}</p>
      </div>
    </button>
  )
}
