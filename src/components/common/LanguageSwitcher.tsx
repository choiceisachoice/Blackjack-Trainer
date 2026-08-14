import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LOCALES, LOCALE_NAMES, resolveLocale, type Locale } from '../../i18n/locales'
import { setLocale } from '../../i18n'

/**
 * A suit per language, cycling the four.
 *
 * Not decoration for its own sake: it makes seven otherwise identical chips
 * read as a *hand* at a glance, and gives each language a fixed shape a
 * returning visitor can aim for without reading. Red on the red suits, because
 * a deck where every card is gold is not a deck.
 */
const SUIT: Record<Locale, { glyph: string; red: boolean }> = {
  en: { glyph: '♠', red: false },
  de: { glyph: '♥', red: true },
  fr: { glyph: '♦', red: true },
  it: { glyph: '♣', red: false },
  es: { glyph: '♠', red: false },
  pt: { glyph: '♥', red: true },
  tr: { glyph: '♦', red: true },
}

/**
 * The corner of a playing card: rank over pip.
 *
 * The trainer draws its real cards this way — a rank index in the corner and a
 * pip beneath it — so the switcher is built from the app's own vocabulary
 * rather than a borrowed globe. The language code takes the rank's place.
 */
function CardCorner({ locale, size = 'sm' }: { locale: Locale; size?: 'sm' | 'md' }) {
  const suit = SUIT[locale]
  return (
    <span
      aria-hidden
      className={`flex flex-col items-center justify-center leading-none rounded-[3px]
        ${size === 'md' ? 'w-7 h-9 gap-1' : 'w-6 h-6 gap-px'}`}
    >
      <span className={`font-bold tracking-tight text-gold ${size === 'md' ? 'text-[0.8rem]' : 'text-[0.68rem]'}`}>
        {locale.toUpperCase()}
      </span>
      <span className={`${suit.red ? 'text-chip-red' : 'text-content/45'} ${size === 'md' ? 'text-[0.7rem]' : 'text-[0.55rem]'}`}>
        {suit.glyph}
      </span>
    </span>
  )
}

interface LanguageSwitcherProps {
  className?: string
}

/**
 * Choosing the language — a hand of cards rather than a dropdown.
 *
 * ## Why this is not a native `<select>` any more
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
        // Lifts and tilts on hover — a card being picked up off the felt.
        // `h-8` to sit at the same size as the icon buttons beside it. Both
        // rows it lives in have a fixed height and centre their children, so
        // this is about looking of a piece, not about preventing a shift.
        className={`group grid place-items-center h-8 rounded-md border px-1.5 cursor-pointer
          transition-[transform,border-color,box-shadow] duration-200 will-change-transform
          motion-safe:hover:-translate-y-0.5 motion-safe:hover:-rotate-2
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60
          ${open
            ? 'border-gold/60 shadow-[0_6px_18px_-10px_var(--color-gold)]'
            : 'border-contrast/15 hover:border-gold/45 hover:shadow-[0_6px_18px_-12px_var(--color-gold)]'}`}
        style={{
          background: 'linear-gradient(160deg, color-mix(in srgb, var(--color-surface-2) 88%, transparent), var(--color-surface))',
        }}
      >
        <CardCorner locale={current} />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('common.language')}
          aria-activedescendant={`${listId}-${active}`}
          data-testid="language-list"
          className="absolute right-0 top-full mt-2 z-50 min-w-[11.5rem] p-1.5 rounded-xl
            border border-gold/25 bg-surface/95 backdrop-blur-sm
            shadow-[0_24px_60px_-28px_rgba(0,0,0,.9)]"
        >
          {LOCALES.map((locale, i) => {
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
                // Dealt out one after another. `motion-safe` only — a stagger
                // is charm, and charm is the first thing to drop when someone
                // has asked the system for less movement.
                className={`motion-safe:animate-[rise-in_.22s_ease-out_both] flex items-center gap-2.5
                  px-2 py-1.5 rounded-lg cursor-pointer transition-colors
                  ${locale === active ? 'bg-gold/12' : ''}
                  ${selected ? 'text-content' : 'text-content/70'}`}
                style={{ animationDelay: `${i * 28}ms` }}
              >
                <span
                  className={`grid place-items-center rounded-[4px] border shrink-0
                    ${selected ? 'border-gold/55' : 'border-contrast/12'}`}
                  style={{
                    background: 'linear-gradient(160deg, color-mix(in srgb, var(--color-surface-2) 92%, transparent), var(--color-surface))',
                  }}
                >
                  <CardCorner locale={locale} size="md" />
                </span>
                <span className="text-sm font-medium truncate">{LOCALE_NAMES[locale]}</span>
                {/* The card already dealt: a thin gold edge, no tick — the
                    raised card is the state, the same way it is at a table. */}
                {selected && <span aria-hidden className="ml-auto w-1 h-5 rounded-full bg-gold shrink-0" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
