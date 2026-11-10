import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { Gift, Loader2, X } from 'lucide-react'

/**
 * The welcome a visitor sees after scanning the QR code in the video.
 *
 * The video promises "35% off Pro". That is the saving of the yearly plan over
 * twelve months, which every yearly subscriber gets; nothing here changes a
 * price. What the code buys the visitor is the moment: a thank-you, the reward
 * named and counted up, and one button that takes them straight to it.
 *
 * The percentage comes from the live Stripe prices like everywhere else on the
 * page. While they load the number is a spinner, and if they fail the reward is
 * named without a number: a page that cannot confirm a figure shows none.
 *
 * Motion: the percentage counts up, chips fall behind the card and a ring
 * breathes behind the number. With reduced motion the number is simply there
 * and nothing falls.
 */
export interface QrRewardWelcomeProps {
  /** The yearly saving as a whole percent, or null while unknown. */
  percent: number | null
  /** Whether the prices are still loading (shows a spinner in place of the number). */
  loading: boolean
  /** The yearly price and the twelve-month total, formatted, for the honest small print. */
  yearlyPrice: string | null
  monthlyTotal: string | null
  /** Whether the visitor is signed in, which changes what the button says it will do. */
  signedIn: boolean
  /** Checkout in flight: the button is disabled and says so. */
  busy: boolean
  /** A sentence to show when checkout could not start. */
  error: string | null
  onClaim: () => void
  onClose: () => void
}

/** How long the percentage takes to count up. */
const COUNT_MS = 1200
/** Chips falling behind the card. */
const CHIP_COLORS = ['#d4a847', '#c41e3a', '#15803d', '#1e3a8a', '#1c1917', '#f2d27a']

/**
 * Counts from 0 to `to` once, eased; jumps straight there with reduced motion.
 *
 * Only the progress is state, and it is only set from the animation frame, so
 * the number itself is derived during render rather than copied into state.
 */
function useCountUp(to: number | null, still: boolean): number | null {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (to === null || still) return
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / COUNT_MS)
      setProgress(k)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, still])
  if (to === null) return null
  if (still) return to
  return Math.round(to * (1 - Math.pow(1 - progress, 3)))
}

/** Deterministic pseudo-random in [0, 1) per index, so the rain looks the same on every render. */
function rnd(i: number, k: number): number {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function ChipRain() {
  const chips = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    left: rnd(i, 1) * 100,
    size: 18 + rnd(i, 2) * 16,
    delay: rnd(i, 3) * 0.9,
    duration: 2.2 + rnd(i, 4) * 1.6,
    spin: (rnd(i, 5) - 0.5) * 720,
    color: CHIP_COLORS[i % CHIP_COLORS.length],
  })), [])
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden data-testid="qr-reward-rain">
      {chips.map((c, i) => (
        <motion.span
          key={i}
          className="absolute top-0 rounded-full"
          style={{
            left: `${c.left}%`, width: c.size, height: c.size,
            background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.55) 0 12%, ${c.color} 13% 62%, rgba(255,255,255,.85) 63% 70%, ${c.color} 71%)`,
            boxShadow: '0 4px 10px rgba(0,0,0,.45)',
          }}
          initial={{ y: -60, rotate: 0, opacity: 0 }}
          animate={{ y: '110vh', rotate: c.spin, opacity: [0, 1, 1, 0.9] }}
          transition={{ duration: c.duration, delay: c.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}

/** The QR reward dialog. Renders nothing on its own; the landing page decides when it is open. */
export function QrRewardWelcome({ percent, loading, yearlyPrice, monthlyTotal, signedIn, busy, error, onClaim, onClose }: QrRewardWelcomeProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false
  const shown = useCountUp(percent, reduced)
  const claimRef = useRef<HTMLButtonElement>(null)

  // The button that matters gets the focus; Escape closes, as everywhere else in the app.
  useEffect(() => { claimRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-reward-title"
      data-testid="qr-reward"
      className="fixed inset-0 z-[9999] grid place-items-center p-4 overflow-y-auto"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.82)' }}
      onClick={onClose}
    >
      {!reduced && <ChipRain />}
      <motion.div
        className="relative text-center w-full max-w-[460px] my-auto p-8 sm:p-10"
        onClick={e => e.stopPropagation()}
        initial={{ scale: 0.86, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        style={{
          borderRadius: '24px',
          backgroundColor: 'var(--color-surface-2)',
          border: '2px solid #d4a847',
          boxShadow: '0 0 60px rgba(212,168,71,.35), 0 0 140px rgba(212,168,71,.18)',
        }}
      >
        <button
          onClick={onClose}
          aria-label={t('qrReward.close')}
          className="absolute top-3 right-3 p-2 rounded-lg text-content/50 hover:text-content cursor-pointer"
        >
          <X size={18} />
        </button>

        <div className="mx-auto mb-4 w-12 h-12 rounded-xl grid place-items-center bg-gradient-to-b from-gold-bright to-gold text-on-gold">
          <Gift size={22} />
        </div>
        <div className="text-xs tracking-[0.22em] uppercase text-gold font-semibold">{t('qrReward.eyebrow')}</div>
        <h2 id="qr-reward-title" className="mt-2 text-2xl font-extrabold tracking-tight">{t('qrReward.title')}</h2>

        {/* The number, with a ring breathing behind it. */}
        <div className="relative mt-6 mb-2 grid place-items-center" data-testid="qr-reward-amount">
          {!reduced && (
            <motion.div
              aria-hidden
              className="absolute w-40 h-40 rounded-full"
              style={{ border: '2px solid rgba(212,168,71,.55)', boxShadow: '0 0 40px rgba(212,168,71,.35)' }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [0.4, 1.12, 1], opacity: [0, 1, 0.75] }}
              transition={{ duration: 1.1, ease: 'easeOut' }}
            />
          )}
          {loading ? (
            <Loader2 className="animate-spin text-gold" size={40} aria-label={t('qrReward.loading')} />
          ) : shown !== null ? (
            <div className="relative font-extrabold text-gold-gradient tabular-nums" style={{ fontSize: 'clamp(3.5rem, 12vw, 4.75rem)', lineHeight: 1 }}>
              {t('qrReward.percent', { percent: shown })}
            </div>
          ) : (
            <div className="relative text-3xl font-extrabold text-gold">{t('qrReward.noNumber')}</div>
          )}
        </div>
        <div className="text-lg font-bold">{t('qrReward.offPro')}</div>
        <p className="mt-2 text-sm text-content/60">
          {yearlyPrice && monthlyTotal
            ? t('qrReward.howMuch', { yearly: yearlyPrice, monthlyTotal })
            : t('qrReward.howMuchPlain')}
        </p>

        <button
          ref={claimRef}
          onClick={onClaim}
          disabled={busy}
          data-testid="qr-reward-claim"
          className="mt-7 w-full rounded-xl px-6 py-3.5 font-bold bg-gradient-to-b from-gold-bright to-gold text-on-gold cursor-pointer disabled:opacity-60 disabled:cursor-wait inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="animate-spin" size={18} />}
          {signedIn ? t('qrReward.claim') : t('qrReward.claimSignUp')}
        </button>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        <p className="mt-3 text-xs text-content/45">{t('qrReward.noCode')}</p>
        <button onClick={onClose} className="mt-4 text-sm text-content/60 hover:text-content underline underline-offset-4 cursor-pointer">
          {t('qrReward.later')}
        </button>
      </motion.div>
    </div>
  )
}
