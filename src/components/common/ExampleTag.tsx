import { useTranslation } from 'react-i18next'

/**
 * The label on a preview: what sits next to it is a sample, not the reader's
 * own data.
 *
 * Empty states show what *will* appear — a faint sparkline, a set of figures —
 * because an empty box explains nothing. A sample that is not marked as one is
 * a lie about the learner, so every preview carries this. Dashed and grey on
 * purpose: gold is this app's colour for things that happened.
 */
export function ExampleTag({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      data-testid="example-tag"
      className={`inline-flex items-center rounded-full border border-dashed border-contrast/25 px-1.5 py-px
        text-[0.5625rem] font-bold tracking-[0.14em] uppercase leading-[1.4] text-content/50 ${className}`}
    >
      {t('common.example')}
    </span>
  )
}
