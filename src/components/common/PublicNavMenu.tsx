import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

interface PublicNavMenuProps {
  /** Include "Sign in" — the bar hides its own sign-in link below `sm`. */
  signIn?: boolean
  /** Extra class on the wrapper; the caller decides where it shows (`sm:hidden`). */
  className?: string
}

/**
 * The phone half of a public header: the links that do not fit beside the
 * language menu and "Start free" on a 360px bar — Learn, the free strategy
 * chart and Sign in — behind one button.
 *
 * Until this existed the chart link was `hidden sm:` and a phone reader had
 * no way to it from the header at all, while the chart is the page most worth
 * finding from a search result.
 */
export function PublicNavMenu({ signIn = true, className = '' }: PublicNavMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item = 'flex items-center min-h-11 px-4 text-sm text-content/80 hover:text-content hover:bg-contrast/5'
  const close = () => setOpen(false)

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={t('landing.nav.menu')}
        data-testid="public-menu"
        className="grid place-items-center w-10 h-10 rounded-lg text-content/70 hover:text-content cursor-pointer"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 py-1.5 rounded-xl border border-contrast/10 bg-surface shadow-2xl z-50" data-testid="public-menu-panel">
          <Link to="/learn" onClick={close} className={item}>{t('landing.nav.learn')}</Link>
          <Link to="/strategy-chart" onClick={close} className={item}>{t('landing.footer.strategyChart')}</Link>
          {signIn && <Link to="/login" onClick={close} className={item}>{t('landing.nav.signIn')}</Link>}
        </div>
      )}
    </div>
  )
}
