import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LOCALES, LOCALE_NAMES, resolveLocale, type Locale } from '../../i18n/locales'
import { setLocale } from '../../i18n'

interface LanguageSwitcherProps {
  /** Compact renders the globe plus the language code; full adds the name. */
  variant?: 'compact' | 'full'
  className?: string
}

/**
 * Choosing the language.
 *
 * A native `<select>` rather than a custom dropdown. It is the one control on
 * the page a visitor may need *before* they can read anything else, and the
 * native element is the version that already works with a screen reader, a
 * keyboard, and a phone's own picker — none of which a hand-built menu gets for
 * free. The invisible label is translated too, for the same reason.
 *
 * Each language is named in itself: someone looking for their own scans for the
 * word they would use, and a list written in English only helps the people who
 * least need it.
 */
export function LanguageSwitcher({ variant = 'compact', className = '' }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation()
  const current = resolveLocale(i18n.language)

  return (
    <label className={`relative inline-flex items-center gap-1.5 ${className}`}>
      <Globe size={16} className="text-content/50 pointer-events-none" aria-hidden />
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={current}
        onChange={e => { void setLocale(e.target.value as Locale) }}
        data-testid="language-switcher"
        className="appearance-none bg-transparent pr-4 text-sm text-content/70 hover:text-content
          cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 rounded"
      >
        {LOCALES.map(locale => (
          <option key={locale} value={locale} className="bg-surface text-content">
            {variant === 'full' ? LOCALE_NAMES[locale] : locale.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  )
}
