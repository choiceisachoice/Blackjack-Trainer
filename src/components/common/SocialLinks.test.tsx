import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { SocialLinks } from './SocialLinks'
import { SOCIAL_LINKS } from './social-links'
import { setLocale } from '../../i18n'

/**
 * The footer's way to the channels. What matters is that each icon leads to the
 * right account and leaves the trainer open behind it: a wrong handle sends a
 * visitor to a stranger, and a missing `noopener` hands that stranger's page a
 * handle on ours.
 */
afterEach(async () => {
  cleanup()
  await setLocale('en')
})

const links = () => within(screen.getByTestId('social-links')).getAllByRole('link')

describe('SocialLinks', () => {
  it('links every channel to its own account', () => {
    render(<SocialLinks />)
    expect(links().map((a) => a.getAttribute('href'))).toEqual([
      'https://www.youtube.com/@BJ_Training',
      'https://x.com/BJ_Training',
      'https://www.instagram.com/blackjacktrainer_official/',
      'https://www.facebook.com/profile.php?id=61594609505224',
    ])
  })

  it('opens each one in a new tab without handing over the opener', () => {
    render(<SocialLinks />)
    for (const a of links()) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
      expect(a.getAttribute('rel')).toContain('noreferrer')
    }
  })

  it('names each icon for a screen reader, in the page language', async () => {
    render(<SocialLinks />)
    expect(screen.getByRole('link', { name: 'Blackjack Trainer on YouTube (opens in a new tab)' })).toBeInTheDocument()
    cleanup()
    await setLocale('de')
    render(<SocialLinks />)
    expect(screen.getByRole('link', { name: 'Blackjack Trainer auf Instagram (öffnet in einem neuen Tab)' })).toBeInTheDocument()
  })

  it('draws one icon per channel', () => {
    render(<SocialLinks />)
    expect(links()).toHaveLength(SOCIAL_LINKS.length)
    for (const a of links()) expect(a.querySelector('svg')).not.toBeNull()
  })
})
