import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Languages } from 'lucide-react'
import { LOCALES, LOCALE_NAMES, resolveLocale, type Locale } from '../../i18n/locales'
import { setLocale } from '../../i18n'

interface LanguageSwitcherProps {
  className?: string
}

/**
 * Choosing the language.
 *
 * ## Why it looks like a language menu and not a hand of cards
 *
 * An earlier version drew each language as a playing-card corner — the code
 * where the rank goes, a suit beneath it. Seven languages over four suits meant
 * three pairs shared a card, which made the one control that must be legible
 * before anything else can be read into a puzzle. This is the plain form:
 * the current code on the trigger, every language named in itself in the list,
 * the code beside it, a tick on the chosen one.
 *
 * ## Why this is not a native `<select>`
 *
 * The native element used to be the whole argument: keyboard, screen reader and
 * a phone's own picker, all for free. Giving that up means re-earning it by
 * hand, which is what the listbox semantics and key handling below are for —
 * `role="listbox"`, a roving `aria-activedescendant`, arrows, Home/End, Enter,
 * Escape, click-outside, and focus returned to the trigger on close. None of
 * that is optional: this is the one control a visitor may need *before* they
 * can read anything else on the page.
 *
 * Each language is named in itself. Someone looking for their own scans for the
 * word they would use, and a list written in English only helps the people who
 * least need it.
 */
export function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation()
  const current = resolveLocale(i18n.language)

  const [open, setOpen] = useState(false)
  // Which option the keyboard is on. Kept separate from the chosen language:
  // arrowing through the list must not change the page's language until Enter.
  const [active, setActive] = useState<Locale>(current)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listId = useId()

  // Pointer down outside, not click: a click that starts inside and ends
  // outside would otherwise close the panel out from under its own selection.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const choose = (locale: Locale) => {
    void setLocale(locale)
    setActive(locale)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const openWith = (locale: Locale) => {
    setActive(locale)
    setOpen(true)
  }

  const step = (delta: number) => {
    const i = LOCALES.indexOf(active)
    const next = LOCALES[(i + delta + LOCALES.length) % LOCALES.length]
    setActive(next)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault()
        if (!open) openWith(current)
        else step(e.key === 'ArrowDown' ? 1 : -1)
        break
      }
      case 'Home':
        if (open) { e.preventDefault(); setActive(LOCALES[0]) }
        break
      case 'End':
        if (open) { e.preventDefault(); setActive(LOCALES[LOCALES.length - 1]) }
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (open) choose(active)
        else openWith(current)
        break
      case 'Escape':
        if (open) { e.preventDefault(); setOpen(false); triggerRef.current?.focus() }
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openWith(current))}
        data-testid="language-switcher"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${t('common.language')}: ${LOCALE_NAMES[current]}`}
        // `h-8` to sit at the same size as the icon buttons beside it in the
        // nav bar; the same height reads as one row of controls, not two.
        className={`inline-flex items-center gap-1.5 h-8 rounded-lg border px-2.5 cursor-pointer
          text-sm font-semibold text-content/80 transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60
          ${open
            ? 'border-gold/60 text-content bg-contrast/5'
            : 'border-contrast/15 hover:border-gold/45 hover:text-content'}`}
      >
        <Languages size={15} className="text-content/50" aria-hidden />
        <span className="tracking-wide">{current.toUpperCase()}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`text-content/40 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('common.language')}
          aria-activedescendant={`${listId}-${active}`}
          data-testid="language-list"
          className="absolute right-0 top-full mt-2 z-50 min-w-[12.5rem] p-1.5 rounded-xl
            border border-contrast/12 bg-surface/95 backdrop-blur-sm
            shadow-[0_24px_60px_-28px_rgba(0,0,0,.9)]"
        >
          {LOCALES.map(locale => {
            const selected = locale === current
            return (
              <li
                key={locale}
                id={`${listId}-${locale}`}
                role="option"
                aria-selected={selected}
                data-testid={`language-option-${locale}`}
                onClick={() => choose(locale)}
                onPointerEnter={() => setActive(locale)}
                className={`flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer transition-colors
                  ${locale === active ? 'bg-contrast/8' : ''}
                  ${selected ? 'text-content' : 'text-content/70'}`}
              >
                <span
                  aria-hidden
                  className={`w-7 shrink-0 text-[0.65rem] font-bold tracking-wider text-center
                    ${selected ? 'text-gold' : 'text-content/40'}`}
                >
                  {locale.toUpperCase()}
                </span>
                <span className="text-sm font-medium truncate">{LOCALE_NAMES[locale]}</span>
                {selected && <Check size={15} aria-hidden className="ml-auto text-gold shrink-0" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
