import { motion, useReducedMotion } from 'framer-motion'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { isPrerenderedBoot } from '../../boot/prerendered-boot'

interface RevealProps {
  children: ReactNode
  /** Seconds to delay the reveal — stagger siblings in ~0.06 steps. */
  delay?: number
  className?: string
}

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * Lifts and fades its children into place the first time they scroll into view,
 * then leaves them alone (`once`), so nothing re-animates on the way back up.
 *
 * Renders as a plain element — no transform, no motion — when the visitor
 * prefers reduced motion, and when there is no window at all: the public
 * pages are prerendered at build time, and a `motion.div` rendered on the
 * server writes its `initial` state inline, so every section of the landing
 * would sit in the HTML at `opacity: 0`. Text a crawler has to read through
 * a zero opacity is text it may well discount. Landing-page decoration
 * only: never wrap anything whose visibility the reader depends on.
 *
 * A third case, since 13 Nov 2026: the mount that *replaces* the prerendered
 * page (see `boot/prerendered-boot.ts`). The visitor is already looking at
 * these sections, so a section on screen must not go to nothing and fade back
 * in — that was half of "the page loads twice". Those mount as painted. A
 * section still below the fold has not been seen and keeps its entrance.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const reduced = useReducedMotion()
  const server = typeof window === 'undefined'
  // Decided once, at mount: the answer is only true during the first commit,
  // and the element type must not change under a mounted section afterwards.
  const [overPainted] = useState(() => !server && isPrerenderedBoot())
  if (reduced || server) return <div className={className}>{children}</div>
  if (overPainted) return <PaintedReveal delay={delay} className={className}>{children}</PaintedReveal>

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

/**
 * A section mounted over its own prerendered copy.
 *
 * The markup is the server's, to the attribute: a plain `div`. What happens
 * next is decided from where the section sits when it mounts. On screen, it
 * is left exactly as painted. Below the fold, it is hidden and given the same
 * lift-and-fade the ordinary path has, the first time it scrolls in.
 *
 * Done on the element rather than through state, and before paint: a state
 * change would render the visible sections a second time for nothing, and
 * hiding after paint would let a section just under the fold show, vanish and
 * return.
 */
function PaintedReveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight) return

    el.style.opacity = '0'
    el.style.transform = 'translateY(18px)'
    const show = () => {
      el.style.transition = `opacity 500ms ${EASE} ${delay}s, transform 500ms ${EASE} ${delay}s`
      el.style.opacity = ''
      el.style.transform = ''
    }
    // A quarter of the section, as the ordinary path asks — unless the
    // section is taller than four viewports' worth of that, in which case a
    // quarter of it can never be on screen at once and it would stay hidden.
    const threshold = Math.min(0.25, (window.innerHeight * 0.5) / Math.max(rect.height, 1))
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return
      observer.disconnect()
      show()
    }, { threshold })
    observer.observe(el)
    return () => {
      observer.disconnect()
      // Never leave a section invisible behind a dead observer.
      el.style.opacity = ''
      el.style.transform = ''
    }
  }, [delay])

  return <div ref={ref} className={className}>{children}</div>
}
