import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ContactPage } from './ContactPage'
import { setLocale } from '../../i18n'

/**
 * The contact page is where a data-protection request has to be able to start,
 * so the sentence pointing at the Privacy Policy is a legal obligation and not
 * decoration.
 *
 * It is assembled with `Trans`, because the link sits mid-sentence and lands in
 * a different place in every language. That is the fragile part: if the tag in
 * a translation stops matching the component key, react-i18next drops the link
 * and leaves the words behind — the page still looks right, and the route to
 * the policy is gone. Checked in a non-English locale for exactly that reason.
 */
afterEach(async () => {
  cleanup()
  await setLocale('en')
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <ContactPage />
    </MemoryRouter>,
  )

/**
 * Scoped to the paragraph: the footer carries a privacy link of its own, and a
 * page-wide query would pass on that one while the sentence had lost its link.
 */
const noteLink = () => within(screen.getByTestId('contact-privacy-note')).getByRole('link')

describe('ContactPage', () => {
  it('links to the privacy policy from inside the sentence', () => {
    renderPage()
    expect(noteLink()).toHaveAttribute('href', '/privacy')
    expect(screen.getByTestId('contact-privacy-note')).toHaveTextContent('data-protection requests')
  })

  it('keeps that link when the page is not in English', async () => {
    await setLocale('de')
    renderPage()
    const link = noteLink()
    expect(link).toHaveAttribute('href', '/privacy')
    expect(link).toHaveTextContent('Datenschutzerklärung')
    expect(screen.getByTestId('contact-privacy-note')).toHaveTextContent('Datenschutzanfragen')
  })
})
