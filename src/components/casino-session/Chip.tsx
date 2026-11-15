import { memo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { chipBreakdown, chipColor, formatDollar } from './helpers'

/**
 * A casino chip, drawn: a coloured disc with eight edge inlays and an inner
 * ring, as seen from above.
 *
 * The bet on a seat used to be a 34px gold coin with a dashed border, the same
 * gold whatever was bet — gold being the colour this product otherwise keeps
 * for the one thing to press. A chip's colour is its value (red 5, green 25,
 * black 100, purple 500), which is how anybody who has stood at a table reads
 * a bet from across it.
 */
export const Chip = memo(function Chip({ value, size = 40, label }: {
  /** Denomination — decides the colour. */
  value: number
  /** Diameter in px. */
  size?: number
  /** Text on the face; nothing when omitted. */
  label?: string
}) {
  const c = chipColor(value)
  const long = (label?.length ?? 0) > 4
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="block" aria-hidden>
      <circle cx="50" cy="50" r="49" fill={c.edge} />
      <circle cx="50" cy="50" r="47" fill={c.fill} />
      {/* eight inlays on the rim */}
      <circle cx="50" cy="50" r="41" fill="none" stroke={c.inlay} strokeWidth="12" strokeDasharray="16.1 16.1" transform="rotate(-11 50 50)" />
      <circle cx="50" cy="50" r="33" fill={c.fill} />
      <circle cx="50" cy="50" r="33" fill="none" stroke={c.inlay} strokeOpacity="0.55" strokeWidth="1.6" />
      {label && (
        <text
          x="50" y="50" textAnchor="middle" dominantBaseline="central"
          fontFamily="Inter, system-ui, sans-serif" fontWeight="800"
          fontSize={long ? 19 : 23} fill={c.ink}
        >{label}</text>
      )}
    </svg>
  )
})

/** What became of a bet, for the chips' last move. */
export type ChipOutcome = 'win' | 'blackjack' | 'loss' | 'push' | null

/**
 * The chips on a betting spot: a stack that grows with the bet, the amount on
 * the top chip.
 *
 * The stack is the bet broken into denominations, largest first, so $175 is a
 * black chip and three greens rather than a number on a coin. At most six are
 * drawn; a taller stack tells nobody more.
 *
 * At settlement the chips do what chips do: a lost bet is taken up the table
 * to the dealer, a won one is paid — a second stack arrives beside it from the
 * dealer's side — and a push stays where it is.
 */
export function ChipStack({ amount, outcome = null, size = 46 }: {
  amount: number
  outcome?: ChipOutcome
  size?: number
}) {
  const reduced = useReducedMotion()
  const rise = Math.round(size * 0.13)
  const chips = chipBreakdown(amount).slice(0, 6)
  // Largest at the bottom, like a stack a dealer would cut.
  const height = size + rise * 5

  const stack = (label: string) => (
    <div className="relative" style={{ width: size, height: size + rise * (chips.length - 1) }}>
      {chips.map((v, i) => (
        <div
          key={i}
          className="absolute left-0 rounded-full"
          style={{ bottom: i * rise, boxShadow: '0 2px 0 rgba(0,0,0,.45), 0 3px 6px rgba(0,0,0,.35)' }}
        >
          <Chip value={v} size={size} label={i === chips.length - 1 ? label : undefined} />
        </div>
      ))}
    </div>
  )

  return (
    <div className="relative flex items-end justify-center" style={{ height, minWidth: size }} data-testid="bet-stack" data-outcome={outcome ?? undefined}>
      {amount > 0 ? (
        <>
          <motion.div
            key={`bet-${outcome === 'loss' ? 'lost' : 'on'}`}
            initial={reduced || outcome === 'loss' ? false : { y: 46, scale: 0.9 }}
            animate={outcome === 'loss' && !reduced ? { y: -150, opacity: 0, scale: 0.85 } : { y: 0, opacity: outcome === 'loss' ? 0 : 1, scale: 1 }}
            transition={outcome === 'loss' ? { duration: 0.55, ease: [0.4, 0, 0.9, 0.6], delay: 0.25 } : { duration: 0.28, ease: [0.2, 0.8, 0.25, 1] }}
          >
            {stack(formatDollar(amount))}
          </motion.div>
          {(outcome === 'win' || outcome === 'blackjack') && (
            <motion.div
              className="absolute bottom-0"
              style={{ left: '50%', marginLeft: size * 0.62 }}
              initial={reduced ? false : { y: -150, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.45, ease: [0.2, 0.8, 0.25, 1], delay: 0.2 }}
              data-testid="payout-stack"
            >
              {stack('')}
            </motion.div>
          )}
        </>
      ) : (
        // The empty spot: a ring on the felt where the bet goes.
        <div className="rounded-full border-2 border-white/20" style={{ width: size, height: size }} data-testid="bet-spot" />
      )}
    </div>
  )
}
