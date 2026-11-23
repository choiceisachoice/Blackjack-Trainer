import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { ArrowRight, CircleHelp, Club, Diamond, Heart, Spade, UserRound, type LucideIcon } from 'lucide-react'
import { useLevelStore } from '../../store/level-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { hasSeenLevelIntro, markLevelIntroSeen } from '../../services/level-intro'
import { levelAvatarId } from '../../services/avatar-catalog'
import type { LevelDefinition, LevelTier } from '../../services/level-system'
import { Avatar } from '../common/Avatar'
import {
  EASE, ink, levelUpTimeline, picturesFor, sparks, tierChanged, tint, xpRows,
  type Beat, type LevelUpTimeline,
} from './level-up-moment'

/**
 * The tiers climb the suits in bridge order — clubs, diamonds, hearts, spades —
 * so the mark itself says "higher" to anyone who plays cards. Drawn as icons,
 * not emoji: an emoji is a different picture on every platform.
 */
const TIER_ICON: Record<LevelTier, LucideIcon> = {
  beginner: Club,
  mid: Diamond,
  advanced: Heart,
  elite: Spade,
}

/**
 * One named keyframe run: which shape, when, on which curve — and its fill.
 * `both` by default, so a part waiting for its turn already shows its first
 * frame; `forwards` for the pulse, whose first frame is visible and must not
 * sit on the ring before the number lands.
 */
type Run = [name: string, beat: Beat, ease: string, fill?: 'both' | 'forwards']

/**
 * The inline `animation` for a set of runs, or nothing under reduced motion.
 *
 * Nothing, rather than shortened: every keyframe here is `from`-only, so an
 * element without its animation is already in its settled place. The global
 * reduced-motion reset would only shorten the runs, and their delays would
 * still hold parts of the card invisible for half a second.
 */
function play(reduced: boolean, ...runs: Run[]): CSSProperties {
  if (reduced) return {}
  return {
    animation: runs.map(([name, b, ease, fill = 'both']) => `${name} ${b.duration}ms ${ease} ${b.delay}ms ${fill}`).join(', '),
  }
}

const SPARKS = sparks(12)

/**
 * The medal: a ring that fills while the number rolls from the old level to
 * the new one, then one pulse and a handful of sparks as it lands.
 */
function Medal({ from, to, color, timeline, reduced }: {
  from: number
  to: number
  color: string
  timeline: LevelUpTimeline
  reduced: boolean
}) {
  // The old level and every level passed on the way, so a jump of two rolls
  // through the one in between — the jump is seen, not only stated.
  const numbers = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const steps = numbers.length - 1
  // Struck, not printed: the level's colour lit from above and shaded below,
  // so grey reads as silver and gold as gold. `color` stays underneath as the
  // fallback where text clipping is not supported.
  const metal: CSSProperties = {
    backgroundImage: `linear-gradient(180deg, color-mix(in oklab, ${color} 45%, white) 30%, ${color} 56%, color-mix(in oklab, ${color} 72%, black) 76%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  }
  return (
    <div className="relative grid place-items-center size-[7.5rem] md:size-[10.75rem] short:size-[5.5rem] compact:size-[6.5rem]">
      <span
        aria-hidden
        className="absolute -inset-[22%] rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${tint(color, 0.2)}, transparent 64%)` }}
      />
      <svg viewBox="0 0 120 120" aria-hidden className="absolute inset-0 size-full -rotate-90">
        {/* A bezel of fine ticks, every fifth a little longer. */}
        <g stroke="var(--color-gold)" strokeLinecap="round">
          {Array.from({ length: 60 }, (_, i) => (
            <line
              key={i}
              x1="60" y1={i % 5 === 0 ? 1.5 : 2.5} x2="60" y2="5"
              strokeWidth={i % 5 === 0 ? 1 : 0.6}
              strokeOpacity={i % 5 === 0 ? 0.5 : 0.2}
              transform={`rotate(${i * 6} 60 60)`}
            />
          ))}
        </g>
        <circle cx="60" cy="60" r="51" fill="none" stroke="var(--color-content)" strokeOpacity="0.08" strokeWidth="2.5" />
        <circle
          className="lu-anim"
          cx="60" cy="60" r="51" fill="none"
          stroke={color} strokeWidth="2.5" strokeLinecap="round"
          pathLength={100} strokeDasharray="100" strokeDashoffset="0"
          style={{ filter: `drop-shadow(0 0 3px ${tint(color, 0.55)})`, ...play(reduced, ['lu-arc', timeline.roll, EASE.standard]) }}
        />
      </svg>
      <span
        aria-hidden
        className="absolute inset-[14.5%] rounded-full border border-contrast/8"
        style={{ background: 'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.06), rgba(0,0,0,0.28) 75%)' }}
      />
      {!reduced && (
        <>
          <span
            aria-hidden
            className="lu-fx lu-anim absolute inset-[7.5%] rounded-full border-2 pointer-events-none"
            style={{ borderColor: color, opacity: 0, ...play(false, ['lu-pulse', timeline.pulse, EASE.decelerate, 'forwards']) }}
          />
          <span aria-hidden className="lu-fx absolute inset-0 pointer-events-none">
            {SPARKS.map((s, i) => (
              // The wrapper reaches from the centre to the ring and is turned to
              // the spark's angle; the spark only travels outwards along it.
              <span
                key={i}
                className="absolute left-1/2 top-1/2 h-0 w-[42.5%] origin-left"
                style={{ transform: `rotate(${s.angle}deg)` }}
              >
                <span
                  className="lu-anim absolute right-0 rounded-full"
                  style={{
                    width: s.size, height: s.size, top: -s.size / 2,
                    background: s.gold ? 'var(--color-gold-bright)' : color,
                    boxShadow: `0 0 6px ${s.gold ? 'rgba(240,205,130,0.8)' : tint(color, 0.8)}`,
                    opacity: 0,
                    ['--lu-from' as string]: '0px',
                    ['--lu-to' as string]: `${s.distance}px`,
                    ...play(false, ['lu-spark', { delay: timeline.burst.delay + s.delay, duration: timeline.burst.duration }, EASE.entrance]),
                  }}
                />
              </span>
            ))}
          </span>
        </>
      )}
      {/* The number, on a strip that rolls from the old level up to the new.
          The mask softens the window's edges so the passing numbers fade in
          and out like an odometer rather than being cut. */}
      <div
        aria-hidden
        className="relative overflow-hidden font-display font-bold tabular-nums leading-none text-[3.25rem] md:text-[5.25rem] short:text-[2.625rem] compact:text-[2.75rem]"
        style={{
          height: '1.25em',
          maskImage: 'linear-gradient(transparent, #000 24%, #000 76%, transparent)',
          WebkitMaskImage: 'linear-gradient(transparent, #000 24%, #000 76%, transparent)',
        }}
      >
        <div
          data-testid="level-up-roll"
          className="lu-anim flex flex-col items-center"
          style={{
            transform: `translateY(${-1.25 * steps}em)`,
            ...play(reduced, ['lu-roll', timeline.roll, EASE.standard]),
          }}
        >
          {numbers.map(n => (
            <span key={n} className="flex items-center justify-center h-[1.25em] px-2" style={{ color, ...metal }}>
              {n}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The tier: a quiet pill, or — when the climb crossed into a new one — a moment of its own. */
function Tier({ from, to, timeline, reduced }: {
  from: LevelDefinition
  to: LevelDefinition
  timeline: LevelUpTimeline
  reduced: boolean
}) {
  const { t } = useTranslation()
  const Icon = TIER_ICON[to.tier]
  const color = to.color

  if (!timeline.tier) {
    return (
      <div
        data-testid="level-up-tier"
        className="lu-anim mt-4 md:mt-5 short:mt-3 compact:mt-2.5 compact:col-start-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em]"
        style={{ color: ink(color), backgroundColor: tint(color, 0.12), ...play(reduced, ['lu-rise-in', timeline.heroLines[1], EASE.entrance]) }}
      >
        <Icon aria-hidden className="size-3" fill="currentColor" strokeWidth={0} />
        {t(`levels.tier.${to.tier}`)}
      </div>
    )
  }

  return (
    <div
      data-testid="level-up-tier-change"
      className="lu-anim relative mt-4 md:mt-5 short:mt-2 compact:mt-2.5 compact:col-start-2 compact:justify-self-stretch compact:px-3 compact:py-2 overflow-hidden rounded-2xl border px-4 py-3 short:py-1.5 text-center"
      style={{
        borderColor: tint(color, 0.45),
        background: `linear-gradient(180deg, ${tint(color, 0.16)}, ${tint(color, 0.05)})`,
        ...play(reduced, ['lu-pop-in', timeline.tier.pop, EASE.entrance]),
      }}
    >
      <div className="text-[0.625rem] font-semibold uppercase tracking-[0.24em]" style={{ color: ink(color) }}>
        {t('levels.newTier')}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5">
        <span aria-hidden className="text-xs text-content/55">{t(`levels.tier.${from.tier}`)}</span>
        <ArrowRight aria-hidden className="size-3.5 text-content/45" />
        <span className="inline-flex items-center gap-1.5 font-display font-bold text-[1.0625rem] short:text-base" style={{ color: ink(color) }}>
          <Icon aria-hidden className="size-4" fill="currentColor" strokeWidth={0} />
          {t(`levels.tier.${to.tier}`)}
        </span>
      </div>
      {!reduced && (
        <span
          aria-hidden
          className="lu-fx lu-anim absolute inset-y-0 left-0 w-2/5 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
            transform: 'translateX(360%) skewX(-18deg)',
            ...play(false, ['lu-sweep', timeline.tier.sweep, EASE.standard]),
          }}
        />
      )}
    </div>
  )
}

/** A small label over a group in the reward column. */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-content/60">
      {children}
    </div>
  )
}

/**
 * The pictures this level-up unlocked, and the way to the page that sets one.
 *
 * The button is rendered only inside a router: the popup is also rendered
 * in the dev gallery and in tests without one, and a `useNavigate` outside
 * a router throws. The pictures themselves need no router and always show.
 */
function NewPictures({ from, to, color, onLeave }: { from: number; to: number; color: string; onLeave: () => void }) {
  const { t } = useTranslation()
  const inRouter = useInRouterContext()
  const { shown, more } = picturesFor(from, to)
  const count = shown.length + more
  if (count === 0) return null
  return (
    <div data-testid="level-up-pictures">
      <Eyebrow>{count === 1 ? t('levels.newPicture') : t('levels.newPictures', { n: count })}</Eyebrow>
      <div className="mt-3 short:mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-end gap-2.5">
          {more > 0 && (
            <span
              className="grid place-items-center size-12 short:size-10 mb-[1.375rem] rounded-xl border border-dashed border-contrast/20 text-sm font-semibold tabular-nums text-content/60"
            >
              +{more}
            </span>
          )}
          {shown.map(level => (
            <figure key={level} className="flex flex-col items-center gap-1.5">
              <span
                className="block rounded-[16px] p-[3px]"
                style={{ boxShadow: level === to ? `0 0 0 1.5px ${color}, 0 8px 24px -10px ${tint(color, 0.7)}` : '0 0 0 1px rgba(255,255,255,0.1)' }}
              >
                <Avatar
                  id={levelAvatarId(level)}
                  initial=""
                  size={64}
                  className={level === to ? 'size-14 md:size-[4.5rem] short:size-11' : 'size-12 md:size-16 short:size-10'}
                />
              </span>
              <figcaption className="text-[0.6875rem] font-medium tabular-nums text-content/60">
                {t('levels.short', { n: level })}
              </figcaption>
            </figure>
          ))}
        </div>
        {inRouter && <ChoosePictureButton many={count > 1} onLeave={onLeave} />}
      </div>
    </div>
  )
}

/** Goes to the account page, through the live-session guard like the nav bar does. */
function ChoosePictureButton({ many, onLeave }: { many: boolean; onLeave: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const requestLeaveApp = useLiveSessionStore(s => s.requestLeaveApp)
  const go = () => {
    onLeave()
    if (requestLeaveApp({ kind: 'route', path: '/account' })) void navigate('/account')
  }
  return (
    <button
      onClick={go}
      data-testid="level-up-choose-picture"
      className="inline-flex items-center gap-2 h-10 short:h-9 px-4 rounded-xl border border-gold/45 text-gold text-sm font-semibold
        hover:bg-gold/10 hover:border-gold/70 cursor-pointer transition-colors"
    >
      <UserRound aria-hidden className="size-4" />
      {many ? t('levels.choosePictures') : t('levels.choosePicture')}
    </button>
  )
}

/** Where the XP came from — one line per source, and the total. */
function XpBreakdown({ rows, total }: { rows: { label: string; amount: number }[]; total: string }) {
  const { t, i18n } = useTranslation()
  if (rows.length === 0) return null
  return (
    <div>
      <Eyebrow>{t('levels.xpEarned')}</Eyebrow>
      <dl data-testid="level-up-breakdown" className="mt-2 short:mt-1 text-sm">
        {rows.length > 1 && rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 py-1 md:py-1.5 short:py-1 border-b border-contrast/6">
            <dt className="min-w-0 text-content/75">{r.label}</dt>
            <dd className="tabular-nums font-semibold text-gold">+{r.amount.toLocaleString(i18n.language)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 pt-2 short:pt-1">
          <dt className={rows.length > 1
            ? 'text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-content/60'
            : 'min-w-0 text-content/75'}
          >
            {rows.length > 1 ? t('levels.total') : rows[0].label}
          </dt>
          <dd className="tabular-nums font-bold text-lg short:text-base text-content">{total}</dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * The level-up moment.
 *
 * A landscape card on a wide screen — the new level on the left as the hero,
 * what it brought on the right — and a vertical sheet on a phone. The number
 * rolls from the old level to the new one inside a ring that fills as it goes,
 * lands with one pulse and a few sparks, and everything is still within 1.2 s
 * (`level-up-moment.ts` holds the timing). Under reduced motion it simply
 * appears, settled.
 *
 * A dialog in the full sense: focus goes to Continue when it opens and back to
 * where it was when it closes, Tab stays inside, Escape and a click on the
 * backdrop close it. Opened by the level store; mounted once in `TrainerApp`
 * and in the dev gallery.
 */
export function LevelUpPopup() {
  const { t, i18n } = useTranslation()
  const showLevelUp = useLevelStore(s => s.showLevelUp)
  const levelUpData = useLevelStore(s => s.levelUpData)
  const dismissLevelUp = useLevelStore(s => s.dismissLevelUp)
  const reduced = useReducedMotion() ?? false
  const dialogRef = useRef<HTMLDivElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)

  // Whether to show the explainer.
  //
  // It shows on every level-up **until the reader says they have got it**, and
  // that is the whole point of the button below. The earlier version hid it
  // after one showing, decided by the app — which assumes the text was read.
  // Somebody whose eye went straight to "Lv.3 Card Player" never saw it again.
  //
  // Answered when the popup *opens*, then held for as long as it is open:
  //
  // - Held, because pressing the button marks it hidden. Re-reading on every
  //   render would make the text vanish underneath somebody mid-sentence.
  // - Re-read per opening, because this component is mounted once in
  //   `TrainerApp` and stays there for the whole session, rendering null in
  //   between. A `useState` initialiser answers at app start and never again,
  //   so the text came back on a second level-up even after being switched off.
  //
  // Adjusted during render rather than in an effect: an effect would paint one
  // frame with the wrong answer first. This is React's documented pattern for
  // "reset state when something changes", and both pieces of state are declared
  // BEFORE any conditional return so hook order stays fixed (a hook after the
  // early `return null` once caused "rendered fewer hooks than expected").
  const [showIntro, setShowIntro] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)
  if (showLevelUp !== wasOpen) {
    setWasOpen(showLevelUp)
    if (showLevelUp) setShowIntro(!hasSeenLevelIntro())
  }

  // Escape closes from anywhere. Enter closes too, unless it is pressing one of
  // the card's other buttons — "Use it as your picture" and "Got it" must do
  // their own thing, not close the card underneath the press.
  useEffect(() => {
    if (!showLevelUp) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissLevelUp()
      else if (e.key === 'Enter') {
        const onControl = e.target instanceof Element && e.target.closest('button, a, input, select, textarea')
        if (!onControl) dismissLevelUp()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showLevelUp, dismissLevelUp])

  // Focus to Continue on opening and back where it was on closing; the page
  // underneath held still meanwhile, or it scrolls under the pointer and reads
  // as the card sliding away.
  useEffect(() => {
    if (!showLevelUp) return
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    continueRef.current?.focus({ preventScroll: true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      if (before && before.isConnected && before !== document.body) before.focus({ preventScroll: true })
    }
  }, [showLevelUp])

  if (!showLevelUp || !levelUpData) return null

  const { oldLevel, newLevel, breakdown } = levelUpData
  const steps = Math.max(0, newLevel.level - oldLevel.level)
  const timeline = levelUpTimeline(steps, tierChanged(oldLevel, newLevel))
  const color = newLevel.color
  const rows = xpRows(breakdown).map(r => ({ label: t(r.labelKey, r.labelParams), amount: r.amount }))
  const totalXP = rows.reduce((sum, r) => sum + r.amount, 0)

  // Closing is NOT the same as "I have understood this". It used to be, which
  // made the explainer a one-shot nobody could keep. Only the button below
  // records that.
  const dismiss = () => dismissLevelUp()

  const hideIntroForGood = () => {
    markLevelIntroSeen()
    // Hidden immediately rather than only from the next level-up: the popup
    // stays open afterwards, and a control that appears to do nothing reads as
    // broken.
    setShowIntro(false)
  }

  // Tab stays inside the card while it is open.
  const keepFocusInside = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
    if (!items || items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // The overlay scrolls and the card sits `my-auto`, so a card taller than a
  // short window scrolls to its button instead of trapping it off-screen; a
  // click on the backdrop closes. The old version was `flex items-center`
  // with no scroll — on a small viewport "Continue" was unreachable and the
  // modal locked the app.
  return (
    <div
      data-testid="level-up-popup"
      className="lu-anim fixed inset-0 z-[9999] grid place-items-center p-3 sm:p-6 short:p-2 overflow-y-auto overscroll-contain"
      style={{
        background: 'radial-gradient(120% 90% at 50% 45%, rgba(3,4,5,0.82), rgba(0,0,0,0.94))',
        ...play(reduced, ['lu-fade-in', timeline.backdrop, EASE.entrance]),
      }}
      onClick={dismiss}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('levels.upTo', { n: newLevel.level, name: t(newLevel.titleKey) })}
        data-testid="level-up-card"
        onClick={e => e.stopPropagation()}
        onKeyDown={keepFocusInside}
        className="lu-anim relative my-auto w-full max-w-[26.25rem] md:max-w-[50rem] short:max-w-[44.5rem]
          grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] short:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]
          overflow-clip rounded-[28px] short:rounded-[22px] border border-contrast/10"
        style={{
          background: 'linear-gradient(180deg, #171a21 0%, #0f1115 100%)',
          boxShadow: `0 40px 120px -40px ${newLevel.glowColor}, 0 24px 60px -20px rgba(0,0,0,0.8)`,
          ...play(reduced, ['lu-fade-in', timeline.cardFade, EASE.effects], ['lu-card-rise', timeline.cardRise, EASE.spatial]),
        }}
      >
        <span
          aria-hidden
          className="absolute inset-x-12 top-0 h-px pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, var(--color-gold) 50%, transparent)', opacity: 0.55 }}
        />

        {/* The hero: what you are now. */}
        <section
          className="relative flex flex-col items-center justify-center text-center
            px-6 pt-5 pb-4 md:px-10 md:py-10 short:px-5 short:py-3
            compact:grid compact:grid-cols-[auto_minmax(0,1fr)] compact:justify-items-start compact:gap-x-4 compact:text-left compact:px-5 compact:py-5
            border-b border-contrast/8 md:border-b-0 md:border-r short:border-b-0 short:border-r"
          style={{ background: `radial-gradient(90% 70% at 50% 34%, ${tint(color, 0.1)}, transparent 72%)` }}
        >
          <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.32em] text-gold compact:col-start-2 compact:row-start-1">
            {t('levels.levelUp')}
          </div>
          <div className="mt-4 short:mt-2 compact:mt-0 compact:col-start-1 compact:row-start-1 compact:row-span-4 compact:self-center">
            <Medal from={oldLevel.level} to={newLevel.level} color={color} timeline={timeline} reduced={reduced} />
          </div>
          <h2
            className="lu-anim mt-3 md:mt-4 short:mt-2 compact:mt-1.5 compact:col-start-2 font-display font-bold leading-[1.08] text-balance
              text-[1.625rem] md:text-[2rem] short:text-[1.25rem] compact:text-[1.375rem]"
            style={{ color, ...play(reduced, ['lu-rise-in', timeline.title, EASE.entrance]) }}
          >
            {t(newLevel.titleKey)}
          </h2>
          <p
            className="lu-anim mt-2 short:mt-1 compact:mt-1.5 compact:col-start-2 compact:justify-start flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[0.8125rem] text-content/60"
            style={play(reduced, ['lu-rise-in', timeline.heroLines[0], EASE.entrance])}
          >
            <span>
              <span className="font-semibold" style={{ color: ink(oldLevel.color) }}>{t('levels.short', { n: oldLevel.level })}</span>
              {' '}{t(oldLevel.titleKey)}
            </span>
            <ArrowRight aria-hidden className="size-3.5 text-content/45" />
            <span className="font-semibold" style={{ color: ink(color) }}>{t('levels.short', { n: newLevel.level })}</span>
            {/* A multi-level jump is otherwise only two distant numbers. */}
            {steps > 1 && (
              <span
                data-testid="level-up-jump"
                className="rounded-full bg-contrast/6 px-2 py-0.5 text-[0.6875rem] font-semibold text-content/75"
              >
                {t('levels.jumped', { n: steps })}
              </span>
            )}
          </p>
          <Tier from={oldLevel} to={newLevel} timeline={timeline} reduced={reduced} />
        </section>

        {/* What it brought, and the way on. */}
        <section className="flex flex-col justify-center gap-4 px-6 pt-5 pb-5 md:gap-7 md:px-9 md:py-9 short:px-5 short:py-3 short:gap-3">
          {/*
            The one thing a level does unlock: its picture. Levels change nothing
            in the training — that is what Pro does — but every level-up hands
            out a profile picture, and a reward nobody is told about is a reward
            that does not exist.
          */}
          {steps > 0 && (
            <div className="lu-anim" style={play(reduced, ['lu-rise-in', timeline.column[0], EASE.entrance])}>
              <NewPictures from={oldLevel.level} to={newLevel.level} color={color} onLeave={dismiss} />
            </div>
          )}

          {/* Where the XP came from: "Challenge +100, Achievements +225" is
              something a beginner can connect to what they just did. */}
          {rows.length > 0 && (
            <div className="lu-anim" style={play(reduced, ['lu-rise-in', timeline.column[1], EASE.entrance])}>
              <XpBreakdown rows={rows} total={`+${totalXP.toLocaleString(i18n.language)} XP`} />
            </div>
          )}
        </section>

        {/* The way on, across the whole card. Sticky: on a phone too short for
            all of it (an iPhone SE with the explainer showing) the rest scrolls
            under it and "Continue" never leaves the screen. On every other
            screen the card fits and it simply sits at the bottom. */}
        <footer
          className="lu-anim sticky bottom-0 md:col-span-2 short:col-span-2 flex flex-col gap-4 border-t border-contrast/8
            px-6 pt-4 pb-5 md:flex-row md:items-center md:justify-between md:gap-8 md:px-9 md:py-5
            short:flex-row short:items-center short:justify-between short:gap-4 short:px-5 short:py-2.5"
          style={{ background: '#0c0e11', boxShadow: '0 -16px 32px -20px rgba(0,0,0,0.9)', ...play(reduced, ['lu-rise-in', timeline.column[2], EASE.entrance]) }}
        >
          {/*
            What this is, in one line, for the first few times — and quiet,
            so it never outweighs the reward. It stays until the reader says
            they have got it; closing the card does not count as that.
          */}
          {showIntro ? (
            <div className="min-w-0 flex-1 flex gap-2 text-[0.8125rem] short:text-xs leading-snug">
              <CircleHelp aria-hidden className="mt-px size-4 shrink-0 text-gold/80" />
              <p className="min-w-0">
                <span data-testid="level-up-explainer" className="text-content/65">{t('levels.explainer')}</span>{' '}
                <button
                  onClick={hideIntroForGood}
                  data-testid="level-up-intro-hide"
                  className="inline text-left text-content/55 hover:text-content/80 underline underline-offset-4
                    decoration-content/25 cursor-pointer transition-colors"
                >
                  {t('levels.hideExplainer')}
                </button>
              </p>
            </div>
          ) : (
            <span aria-hidden className="hidden md:block short:block" />
          )}
          <button
            ref={continueRef}
            onClick={dismiss}
            data-testid="level-up-dismiss"
            className="h-12 short:h-10 w-full md:w-auto short:w-auto md:min-w-[10rem] short:min-w-[8rem] shrink-0 px-7 rounded-xl
              text-[0.9375rem] font-semibold text-on-gold cursor-pointer
              transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98]"
            style={{
              background: 'linear-gradient(180deg, var(--color-gold-bright), var(--color-gold))',
              boxShadow: '0 10px 28px -12px rgba(212,168,71,0.7), inset 0 1px 0 rgba(255,255,255,0.35)',
            }}
          >
            {t('common.continue')}
          </button>
        </footer>
      </div>
    </div>
  )
}
