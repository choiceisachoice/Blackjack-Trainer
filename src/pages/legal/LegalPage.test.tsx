import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LegalPage } from './LegalPage'
import { PrivacyPage } from './PrivacyPage'
import { TermsPage } from './TermsPage'
import { setLocale } from '../../i18n'
import { LOCALES, LOCALE_STORAGE_KEY, type Locale } from '../../i18n/locales'
import { TRANSLATION_NOTICE, legalDoc, type LegalKind } from './legal-docs'
import { legalDate, type TranslatedLocale } from './legal-locale'

/**
 * The page a reader of each language actually gets.
 *
 * The content tests compare the documents as data. These check the thing the
 * data is for: that `/de/privacy` shows the German text and says, at the top
 * and in German, that it is a translation and the English version governs —
 * and that the English page says no such thing about itself.
 */
afterEach(async () => {
  cleanup()
  await setLocale('en')
  localStorage.clear()
})

const TRANSLATED = LOCALES.filter((l): l is TranslatedLocale => l !== 'en')
const KINDS: readonly LegalKind[] = ['privacy', 'terms']

async function renderIn(locale: Locale, kind: LegalKind) {
  await setLocale(locale)
  return render(
    <MemoryRouter>
      <LegalPage kind={kind} />
    </MemoryRouter>,
  )
}

describe.each(KINDS)('LegalPage — %s', kind => {
  it('shows the English original without a translation notice', async () => {
    await renderIn('en', kind)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(legalDoc(kind, 'en').title)
    expect(screen.queryByTestId('legal-translation-notice')).toBeNull()
  })

  it.each(TRANSLATED)('%s: shows the translated document, every section of it', async locale => {
    await renderIn(locale, kind)
    const doc = legalDoc(kind, locale)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(doc.title)
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(headings).toEqual(doc.sections.map(s => s.heading))
    // Not the English one underneath.
    expect(screen.queryByText(legalDoc(kind, 'en').sections[0].heading)).toBeNull()
  })

  it.each(TRANSLATED)('%s: says in that language that the English version applies, and links to it', async locale => {
    await renderIn(locale, kind)
    const notice = screen.getByTestId('legal-translation-notice')
    const n = TRANSLATION_NOTICE[locale]
    expect(notice).toHaveTextContent((n.before + n.link + n.after).trim())
    expect(notice).toHaveAttribute('lang', locale)

    // A plain link to the unprefixed URL: the router is rooted at `/de` and
    // a `<Link>` would point back at the translation.
    const link = within(notice).getByRole('link')
    expect(link).toHaveTextContent(n.link)
    expect(link).toHaveAttribute('href', `/${kind}`)
    expect(link).toHaveAttribute('hreflang', 'en')
  })

  it.each(TRANSLATED)('%s: puts the notice above the first section', async locale => {
    await renderIn(locale, kind)
    const notice = screen.getByTestId('legal-translation-notice')
    const firstSection = screen.getAllByRole('heading', { level: 2 })[0]
    expect(notice.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it.each(LOCALES)('%s: prints "last updated" in the page’s own date format', async locale => {
    const { container } = await renderIn(locale, kind)
    const footer = container.querySelector('footer')!
    expect(footer).toHaveTextContent(legalDate(locale))
    if (locale !== 'en') expect(footer).not.toHaveTextContent(legalDate('en'))
  })
})

describe('the link to the English version', () => {
  it('stores English as the language before the browser follows it', async () => {
    // `/privacy` is drawn in the stored language. Without this the link
    // would load the English page and the app would turn it German again.
    const { container } = await renderIn('de', 'privacy')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de')
    // jsdom does not navigate; stop it from trying.
    container.addEventListener('click', e => e.preventDefault())
    fireEvent.click(within(screen.getByTestId('legal-translation-notice')).getByRole('link'))
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })
})

describe('the routed pages', () => {
  it('PrivacyPage renders the privacy policy in the active language', async () => {
    await setLocale('fr')
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(legalDoc('privacy', 'fr').title)
    expect(document.title).not.toBe('')
  })

  it('TermsPage renders the terms in the active language', async () => {
    await setLocale('tr')
    render(<MemoryRouter><TermsPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(legalDoc('terms', 'tr').title)
  })
})
