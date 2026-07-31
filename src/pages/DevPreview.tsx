import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import { useStatsStore } from '../store/stats-store'
import { useEntitlementStore } from '../store/entitlement-store'
import { TrainingPlan } from '../components/plan/TrainingPlan'
import { AppLoader } from '../components/common/AppLoader'
import { IntroGate } from '../components/common/IntroGate'
import { HomeScreen } from '../components/navigation/HomeScreen'
import { TrainerApp } from './TrainerApp'

/**
 * Dev-only harness for the first-run experience.
 *
 * The signed-in screens sit behind Supabase auth, which makes the one thing
 * that matters most — what a brand-new account sees — the hardest thing to
 * look at. Every check on it was otherwise indirect: unit tests and console
 * evaluation, neither of which can tell you a screen looks cheap.
 *
 * It sets up storage and entitlement and then renders the **real** component,
 * deliberately: an earlier version wired the screens together itself and drifted
 * from the app within an hour, reporting a broken step that only its own wiring
 * had. A harness that models the flow instead of driving it is worse than none.
 *
 * Mounted only when `import.meta.env.DEV` is true, so it cannot ship.
 */
interface Scene {
  id: string
  label: string
  hint: string
  isPro: boolean
  /** Storage the scene starts from. Everything else is wiped. */
  seed?: Record<string, string>
  /** Render the whole home screen rather than the plan on its own. */
  home?: boolean
  /**
   * Render the complete `/app` shell (NavBar + mode routing).
   *
   * The only way to see the NavBar/scroll-container interaction without an
   * account: `/app` redirects to `/login`, and every other scene renders a
   * screen in isolation, which cannot reproduce a layout bug that only exists
   * when the header and the content share a 100vh box.
   */
  shell?: boolean
}

const SCENES: Scene[] = [
  {
    id: 'welcome-free',
    label: 'New account — Free',
    hint: 'Exactly what a free signup sees first',
    isPro: false,
  },
  {
    id: 'welcome-pro',
    label: 'New account — Pro',
    hint: 'What a subscriber sees first',
    isPro: true,
  },
  {
    id: 'assessment',
    label: 'Placement test',
    hint: 'Skips the greeting, starts on the questionnaire',
    isPro: true,
    seed: { bjt_welcome_seen: 'true' },
  },
  {
    id: 'plan-free',
    label: 'Plan — Free, mid-path',
    hint: 'Placed at Hi-Lo on the free tier — includes the Pro wall',
    isPro: false,
    seed: { bjt_welcome_seen: 'true', bjt_placement: 'true-count' },
  },
  {
    id: 'home-placed',
    label: 'Home — placed',
    hint: 'The new home screen: plan on top, browsing underneath',
    isPro: true,
    seed: { bjt_welcome_seen: 'true', bjt_placement: 'hi-lo' },
    home: true,
  },
  {
    id: 'shell',
    label: 'Full shell (NavBar + home)',
    hint: 'The real /app layout — the only place the NavBar+overflow interaction is visible',
    isPro: true,
    seed: { bjt_welcome_seen: 'true', bjt_placement: 'hi-lo' },
    shell: true,
  },
  {
    id: 'shell-welcome',
    label: 'Full shell — new account',
    hint: 'The real /app layout for a brand-new account (welcome screen inside the shell)',
    isPro: false,
    shell: true,
  },
  {
    id: 'intro',
    label: 'App loading screen',
    hint: 'What every visit opens with — replay it, or hold it to inspect the waiting state',
    isPro: false,
  },
  {
    id: 'loader',
    label: 'Route spinner',
    hint: 'The small in-app loader shown while a route chunk resolves',
    isPro: true,
  },
  {
    id: 'plan-pro',
    label: 'Plan — Pro, mid-path',
    hint: 'Placed at Hi-Lo with everything unlocked',
    isPro: true,
    seed: { bjt_welcome_seen: 'true', bjt_placement: 'hi-lo' },
  },
]

/**
 * The entrance, playable on demand.
 *
 * In the product it runs once per browser and then never again, which makes the
 * single most important three seconds in the app the hardest thing to look at.
 */
function IntroScene() {
  const [round, setRound] = useState(0)
  const [hold, setHold] = useState(false)
  /**
   * Which timeline to play, chosen rather than inherited.
   *
   * The product decides this from `sessionStorage`, which is precisely what
   * makes it awkward to inspect: once you have looked at the welcome, every
   * reload gives you the short one until you clear the session. Overriding it
   * here means both branches are one click apart.
   */
  const [brief, setBrief] = useState(false)

  return (
    <div className="relative flex-1 min-h-0">
      {/* Keyed, so "Replay" is a fresh mount rather than a reset of live state
          — the same thing a reload does in the product. */}
      <IntroPlayback key={`${round}-${brief}`} hold={hold} brief={brief} />
      <div className="absolute bottom-4 right-4 z-[10001] flex gap-2">
        <button
          onClick={() => setBrief(b => !b)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors
            ${brief
              ? 'border-gold/40 text-gold bg-gold/10'
              : 'border-contrast/20 text-content/60 bg-casino-bg/80 hover:bg-contrast/5'}`}
        >
          {brief ? 'Repeat visit — short' : 'First visit — full'}
        </button>
        {/* Holding keeps `appReady` false, which is the only way to look at the
            waiting state for longer than a slow connection lasts — and the only
            way to photograph it at all. */}
        <button
          onClick={() => setHold(h => !h)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors
            ${hold
              ? 'border-error/50 text-error bg-error/10'
              : 'border-contrast/20 text-content/60 bg-casino-bg/80 hover:bg-contrast/5'}`}
        >
          {hold ? 'Holding — app never ready' : 'Hold'}
        </button>
        <button
          onClick={() => setRound(r => r + 1)}
          className="px-3 py-1.5 rounded-md text-xs font-semibold
            border border-gold/40 text-gold bg-casino-bg/80 hover:bg-gold/10 transition-colors"
        >
          Replay
        </button>
      </div>
    </div>
  )
}

function IntroPlayback({ hold, brief }: { hold: boolean; brief: boolean }) {
  // Held false for a beat longer than the sequence runs, so the waiting state —
  // the stalled progress bar and the "Almost there" line a slow connection
  // produces — is visible here too, not only on a bad network.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (hold) return
    const t = setTimeout(() => setReady(true), 1500)
    return () => clearTimeout(t)
  }, [hold])

  return (
    <IntroGate appReady={ready && !hold} brief={brief}>
      {/*
        Carries `intro-enter` because the real page does. Without it the harness
        showed a handover that cannot happen: the placeholder was visible the
        whole time, so the ~700ms hole between the curtain leaving and the hero
        arriving was invisible here and only showed up on the live landing page.
        A harness that is easier than the thing it models is worse than none.
      */}
      <div className="app-canvas intro-enter absolute inset-0 grid place-items-center text-content/30 text-sm">
        the app, revealed underneath
      </div>
    </IntroGate>
  )
}

/**
 * Device preferences, kept across a reset — they belong to the machine, not to
 * the account being simulated.
 */
const DEVICE_KEYS = new Set([
  'bjt_theme',
  'bjt_sound_settings',
  'bjt_ambient_volume',
  'bjt_dealing_speed',
])

/**
 * Wipe everything this app stores for an account.
 *
 * Enumerated from storage rather than hand-listed, because the hand-written
 * list was already wrong: it missed `bjt_placement_skipped` and
 * `bjt_learner_profile` entirely and misspelled the weekly-challenge key, so
 * "reset" quietly left state behind — a harness that misreports the state you
 * are looking at is worse than no harness. A key added next month is now wiped
 * automatically instead of being silently forgotten.
 */
function wipeAccountStorage() {
  const doomed: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('bjt_') && !DEVICE_KEYS.has(key)) doomed.push(key)
  }
  for (const key of doomed) localStorage.removeItem(key)
  return doomed.length
}

/**
 * Live readout of what actually drives the interface scale.
 *
 * Exists because "it looks smaller in my other browser" is impossible to act on
 * without numbers, and asking someone to open a console in two browsers to get
 * them is friction that stops the conversation. Open this page in both windows
 * and read the line.
 */
function ScaleReadout() {
  const [scale, setScale] = useState(readScale)

  useEffect(() => {
    const update = () => setScale(readScale())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <span
      className="text-xs tabular-nums text-content/55 font-mono select-all"
      data-testid="scale-readout"
      title="Copy this and send it over"
    >
      {scale.width}px wide · base {scale.root} · dpr {scale.dpr} · screen {scale.screen}px
    </span>
  )
}

function readScale() {
  return {
    width: window.innerWidth,
    root: getComputedStyle(document.documentElement).fontSize,
    dpr: window.devicePixelRatio,
    // The physical screen, so a narrow window on a big monitor is
    // distinguishable from a small monitor.
    screen: window.screen.width,
  }
}

export function DevPreview() {
  const [scene, setScene] = useState<Scene>(SCENES[0])
  const [nonce, setNonce] = useState(0)
  const [applied, setApplied] = useState(false)
  const setMode = useAppStore(s => s.setMode)

  const load = (next: Scene) => {
    wipeAccountStorage()
    for (const [key, value] of Object.entries(next.seed ?? {})) localStorage.setItem(key, value)

    useEntitlementStore.setState({
      status: next.isPro ? 'active' : 'none',
      currentPeriodEnd: null,
    })
    useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
    setMode(next.shell ? 'home' : 'plan')
    setScene(next)
    setApplied(true)
    setNonce(n => n + 1) // remount, so component state starts fresh too
  }

  // Apply the first scene on mount. Without this the toolbar highlights
  // "New account — Free" while the screen shows whatever the last visit left in
  // storage — a harness that misreports which state you are looking at is worse
  // than no harness, because you trust it.
  useEffect(() => {
    load(SCENES[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!applied) return null

  return (
    <div className="min-h-screen flex flex-col">
      <div className="shrink-0 border-b border-contrast/12 bg-surface-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.6875rem] font-bold tracking-[0.2em] uppercase text-warning mr-2">
            Dev preview
          </span>
          {SCENES.map(s => (
            <button
              key={s.id}
              onClick={() => load(s)}
              data-testid={`scene-${s.id}`}
              className={`text-sm px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                scene.id === s.id
                  ? 'border-gold/45 bg-gold/10 text-gold'
                  : 'border-contrast/12 text-content/60 hover:text-content'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-xs text-content/40">{scene.hint}</span>
          <ScaleReadout />
          <button
            onClick={() => {
              const n = wipeAccountStorage()
              alert(`${n} Einträge gelöscht. Die App startet jetzt wie ein brandneuer Account.`)
              window.location.href = '/app'
            }}
            data-testid="wipe-and-open-app"
            className="ml-auto text-sm px-3.5 py-1.5 rounded-lg font-semibold cursor-pointer
              border border-error/50 text-error hover:bg-error/10 transition-colors"
          >
            Alles löschen → /app öffnen
          </button>
        </div>
      </div>

      {/* The real screen, not a re-creation of it. */}
      <div className="flex-1 min-h-0 flex flex-col" key={`${scene.id}-${nonce}`}>
        {scene.id === 'intro'
          ? <IntroScene />
          : scene.id === 'loader'
          ? <AppLoader delayMs={0} label="Signing you in" />
          : scene.shell
            ? <TrainerApp />
            : scene.home
              ? <div className="app-canvas flex-1 overflow-y-auto"><HomeScreen /></div>
              : <TrainingPlan />}
      </div>
    </div>
  )
}
