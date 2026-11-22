import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CloudOff, CloudCheck } from 'lucide-react'
import { useAuthStore, isSupabaseConfigured } from '../../store/auth-store'
import { useOnline } from '../../hooks/use-online'
import { getPendingSnapshot, subscribePendingSessions } from '../../services/storage/pending-sessions'
import { isAppPath } from '../../routes/pages'
import { unprefixedPath } from '../../i18n/locales'

/** How long "Back online — everything is saved" stays before it leaves by itself. */
export const RESTORED_VISIBLE_MS = 4000

type Phase = 'hidden' | 'offline' | 'restored'

/**
 * Where the strip goes.
 *
 * - `bar`: across the very top, and the app shell is moved down by the strip's
 *   height (`--offline-bar`), so it sits above the navigation and not on it.
 * - `table`: a live casino table is on screen. The table sizes itself to the
 *   height that is left, so taking height away would re-lay the felt and move
 *   every card mid-hand. Here the strip is laid over the table's top rim,
 *   directly under the session bar, and nothing is moved.
 */
type Placement = { kind: 'bar' } | { kind: 'table'; top: number }

/** The live table's top bar, if one is on screen (it stays mounted, hidden, while paused elsewhere). */
function visibleSessionHud(): HTMLElement | null {
  const hud = document.querySelector<HTMLElement>('[data-testid="session-hud"]')
  return hud && hud.getClientRects().length > 0 ? hud : null
}

function readPlacement(): Placement {
  const hud = visibleSessionHud()
  return hud ? { kind: 'table', top: Math.round(hud.getBoundingClientRect().bottom) } : { kind: 'bar' }
}

function samePlacement(a: Placement, b: Placement): boolean {
  return a.kind === b.kind && (a.kind !== 'table' || b.kind !== 'table' || a.top === b.top)
}

/**
 * The offline notice: a slim strip, never a dialog.
 *
 * It says the one thing a learner without a connection needs to know — the
 * training is kept on this device and goes up later — and, when the connection
 * is back and everything has arrived, says so once and leaves.
 *
 * Shown while the browser reports no network, or while a finished session
 * could not be handed to the cloud (the browser can claim to be online while
 * our server does not answer). Only in the signed-in app, and never in a build
 * without Supabase: there, the device is the only place the training lives and
 * there is nothing to upload to.
 */
export function OfflineNotice() {
  // A build-time constant, so this is not a conditional hook call in practice.
  if (!isSupabaseConfigured) return null
  return <ConfiguredOfflineNotice />
}

function ConfiguredOfflineNotice() {
  const { t } = useTranslation()
  const online = useOnline()
  const pending = useSyncExternalStore(subscribePendingSessions, getPendingSnapshot, getPendingSnapshot)
  const signedIn = useAuthStore(s => s.status === 'signedIn')
  const { pathname } = useLocation()
  const inApp = isAppPath(unprefixedPath(pathname))

  const trouble = !online || pending.failed
  const [phase, setPhase] = useState<Phase>('hidden')

  // Derived while rendering rather than in an effect, so the strip is never
  // one frame behind the connection.
  let next = phase
  if (trouble) next = 'offline'
  // "Everything is saved" is only said once it is true: the connection is
  // back *and* nothing is still waiting to be uploaded.
  else if (phase === 'offline' && pending.count === 0) next = 'restored'
  if (next !== phase) setPhase(next)

  useEffect(() => {
    if (phase !== 'restored') return
    const id = setTimeout(() => setPhase(p => (p === 'restored' ? 'hidden' : p)), RESTORED_VISIBLE_MS)
    return () => clearTimeout(id)
  }, [phase])

  const showing = next !== 'hidden' && signedIn && inApp
  const strip = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<Placement>({ kind: 'bar' })

  // Follow the screen while the strip is up: the table can start, end or
  // resize under it. Nothing is observed while it is hidden.
  useLayoutEffect(() => {
    if (!showing) return
    let frame = 0
    const update = () => {
      frame = 0
      const now = readPlacement()
      setPlacement(prev => (samePlacement(prev, now) ? prev : now))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule)
    observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    window.addEventListener('resize', schedule)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [showing])

  // In `bar` placement the strip publishes its height and the shell makes
  // room for it (see the style element below).
  const inBar = showing && placement.kind === 'bar'
  useLayoutEffect(() => {
    const el = strip.current
    if (!inBar || !el) return
    const root = document.documentElement
    const publish = () => root.style.setProperty('--offline-bar', `${Math.ceil(el.getBoundingClientRect().height)}px`)
    publish()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(el)
    return () => { observer?.disconnect(); root.style.removeProperty('--offline-bar') }
  }, [inBar, next])

  if (!showing) return null

  const restored = next === 'restored'
  const Icon = restored ? CloudCheck : CloudOff

  return (
    <>
      {/* Only the outermost shell moves; the screens inside it that carry the
          same class for their background stay where they are. */}
      <style>{'.app-canvas:not(.app-canvas .app-canvas){padding-top:var(--offline-bar,0px)}'}</style>
      <div
        ref={strip}
        role="status"
        aria-live="polite"
        data-testid="offline-notice"
        data-state={restored ? 'restored' : 'offline'}
        data-placement={placement.kind}
        style={{ top: placement.kind === 'table' ? placement.top : 0 }}
        className={`fixed inset-x-0 z-30 pointer-events-none flex items-center justify-center gap-2
          px-3 py-1 text-[11px] leading-snug sm:text-xs text-center
          border-b backdrop-blur-sm
          ${restored
            ? 'border-success/25 bg-[color-mix(in_srgb,var(--color-success)_14%,var(--color-surface))]/95 text-content/90'
            : 'border-contrast/10 bg-[var(--color-surface-2)]/95 text-content/75'}`}
      >
        <Icon size={14} aria-hidden className={`shrink-0 ${restored ? 'text-success' : 'text-warning'}`} />
        <span>{restored ? t('offline.restored') : t('offline.notice')}</span>
      </div>
    </>
  )
}
