import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router-dom'
import { PublicShell } from '../components/common/PublicShell'
import { TrialRound } from '../components/trial/TrialRound'
import { arrivalStageTop, TRY_WIDE_QUERY } from '../components/trial/stage-layout'
import { usePageMeta } from '../hooks/use-page-meta'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'

/** Router state that opens the round on its first hand (a link that already said "deal"). */
export interface TryLocationState {
  autoStart?: boolean
}

/**
 * `/try` — ten hands at the casino table without an account.
 *
 * ## Why this exists
 *
 * Some seven hundred visitors, one customer: the sign-up form was the first
 * thing the product asked of anyone, before they had touched it. Here a
 * visitor sits down at the table — the real felt, cards and deal, every
 * decision theirs — and after each hand sees what basic strategy plays. They
 * are asked for something once, at the end, when the ten hands have shown
 * what the product is.
 *
 * The round itself is `TrialRound`, the same component the landing's play
 * section renders; this page is its own address for it (indexed, linked from
 * the videos) and the frame around it.
 *
 * ## What it is careful about
 *
 * - **One ask, at the end.** The summary offers Pro and the free account.
 *   The shell's closing call to action is switched off so the page does not
 *   ask twice. Nothing interrupts the round.
 * - **Nothing is recorded**, so nothing is promised: the round belongs to no
 *   account (see `TrialRound`).
 * - **A signed-in visitor has no business here** and is sent to the app.
 *
 * Prerendered in every language like the other public pages: the heading,
 * the sentence and the empty table, which are the same for everyone.
 */
export function TryPage() {
  const { t } = useTranslation()
  usePageMeta('try', '/try')
  const status = useAuthStore(s => s.status)
  const { state } = useLocation()
  const autoStart = (state as TryLocationState | null)?.autoStart === true
  const stage = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLDivElement>(null)
  /*
    Two layouts, chosen by the window's shape in CSS, so the prerendered page
    already has the right one:

    - **Wide and low** (`try-wide`, `TRY_WIDE_QUERY`): the words in a column
      on the left, the stage on the right with the whole height between the
      header and the bottom edge (less the cookie bar while it is up). Above
      the stage, the words cost the table its height — at 2000×720 it was
      558×239 in the middle of a 2000px screen. `--stage-top` is the header
      and the row's top padding, set by a class; nothing to measure.
    - **Otherwise, stacked**: the words over the stage. From md up the stage is
      fitted to the first screen under them (`arrivalStageTop`), so the deal
      button is on screen on arrival; it used to be sized for the moment it is
      scrolled to, and at 720px tall that put the button under the fold. Not
      on a phone: there the heading takes a third of the screen, and the table
      is worth more played at full size after one scroll.

    The measuring runs before paint (`useLayoutEffect`), so the first frame the
    script draws already has the height; again when the heading reflows
    (language, width), the window changes size (the root font scales with the
    width) or the layout switches.
  */
  const [arrivalTop, setArrivalTop] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = stage.current
    if (!el || typeof window.matchMedia !== 'function') return
    const wide = window.matchMedia('(min-width: 768px)')
    const columns = window.matchMedia(TRY_WIDE_QUERY)
    const measure = () => {
      if (!wide.matches || columns.matches) { setArrivalTop(null); return }
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
      const top = el.getBoundingClientRect().top + window.scrollY
      setArrivalTop(arrivalStageTop(top, window.innerHeight, rem))
    }
    measure()
    const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    if (heading.current) resized?.observe(heading.current)
    window.addEventListener('resize', measure)
    wide.addEventListener?.('change', measure)
    columns.addEventListener?.('change', measure)
    return () => {
      resized?.disconnect()
      window.removeEventListener('resize', measure)
      wide.removeEventListener?.('change', measure)
      columns.removeEventListener?.('change', measure)
    }
  }, [])

  // The first hand belongs on screen whole: under the header, clear of the
  // cookie bar — the heading above it has been read. Where the stage already
  // is whole (fitted to the first screen, above), the page stays put: a jump
  // that hides the heading and leaves the table where it was is no help.
  const onStart = useCallback(() => {
    const el = stage.current
    if (!el || typeof el.scrollIntoView !== 'function') return
    const box = el.getBoundingClientRect()
    const margin = getComputedStyle(el)
    const clearTop = parseFloat(margin.scrollMarginTop) || 0
    const clearBottom = parseFloat(margin.scrollMarginBottom) || 0
    if (box.height > 0 && box.top >= clearTop && box.bottom <= window.innerHeight - clearBottom) return
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  }, [])

  if (isSupabaseConfigured && status === 'signedIn') return <Navigate to="/app" replace />

  return (
    <PublicShell cta={false} testId="try-page">
      {/* Stacked: one column, the words over the stage. A short window from md
          up (`try-short`, a laptop at 720–820px) gets a tighter heading — less
          air above it, a size smaller, closer to the stage — so the fitted
          stage keeps a table-sized height; the negative margin takes back part
          of the shell's `md:py-12`.

          `try-wide`: a grid row exactly as tall as the screen under the header
          (less the cookie bar), the shell's top padding taken back, the words
          in 28% on the left and centred, the stage in the rest. The stage's
          height runs from `--stage-top` (header + the row's 1rem padding) to
          1rem above the bottom edge — the row's padding again — so it fills the
          row, up to the stage's own cap, beyond which it is centred in it. */}
      <div
        data-testid="try-layout"
        className="max-w-5xl mx-auto px-4 sm:px-6 try-short:-mt-7
          try-wide:max-w-[120rem] try-wide:px-8 try-wide:-mt-12 try-wide:py-4
          try-wide:min-h-[calc(100dvh_-_4rem_-_1px_-_var(--cookie-bar,0px))]
          try-wide:grid try-wide:grid-cols-[minmax(16rem,28fr)_minmax(0,72fr)] try-wide:gap-x-10 try-wide:items-center"
      >
        <div ref={heading} className="max-w-[42em] try-wide:max-w-none">
          <div className="text-xs font-semibold tracking-[0.18em] uppercase text-gold">{t('try.eyebrow')}</div>
          <h1 id="try-title" className="mt-3 try-short:mt-2 text-3xl md:text-4xl try-short:text-3xl font-extrabold tracking-tight leading-tight text-balance">{t('try.title')}</h1>
          <p className="mt-3 try-short:mt-2 try-wide:mt-4 text-content/60 text-base">{t('try.intro')}</p>
        </div>
        {/* `--stage-top`: stacked, the header and some air — the room the
            stage leaves above itself once scrolled to — or, from md up, the
            stage's own place on the page (`arrivalTop`, inline, so it wins);
            beside the words, the header and the row's padding. */}
        <div
          ref={stage}
          role="group"
          aria-labelledby="try-title"
          data-testid="try-stage"
          className="mt-6 md:mt-8 try-short:mt-4 try-wide:mt-0 -mx-4 sm:mx-0 scroll-mt-[4.5rem]
            [--stage-top:4.5rem] try-wide:[--stage-top:calc(4rem_+_1px_+_1rem)]"
          style={{
            scrollMarginBottom: 'calc(var(--cookie-bar, 0px) + 12px)',
            ...(arrivalTop === null ? {} : { ['--stage-top' as string]: `${arrivalTop}px` }),
          }}
        >
          <TrialRound autoStart={autoStart} onStart={onStart} />
        </div>
      </div>
    </PublicShell>
  )
}
