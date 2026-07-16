import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  /** Seconds to delay the reveal — stagger siblings in ~0.06 steps. */
  delay?: number
  className?: string
}

/**
 * Lifts and fades its children into place the first time they scroll into view,
 * then leaves them alone (`once`), so nothing re-animates on the way back up.
 *
 * Renders as a plain element — no transform, no motion — when the visitor
 * prefers reduced motion. Landing-page decoration only: never wrap anything
 * whose visibility the reader depends on.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
