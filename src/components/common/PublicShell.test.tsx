import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicShell } from './PublicShell'

afterEach(cleanup)

describe('PublicShell', () => {
  it('frames the page with a way home, a way in, and the other public pages', () => {
    render(<MemoryRouter><PublicShell><p>body</p></PublicShell></MemoryRouter>)
    expect(screen.getByText('body')).toBeInTheDocument()
    expect(screen.getByTestId('learn-home')).toHaveAttribute('href', '/')
    // "Start free" opens the register side, in the link itself so the
    // prerendered page already says so.
    expect(screen.getByTestId('learn-start')).toHaveAttribute('href', '/login?mode=signup')
    const hrefs = Array.from(document.querySelectorAll('a')).map(a => a.getAttribute('href'))
    expect(hrefs).toContain('/learn')
    expect(hrefs).toContain('/strategy-chart')
    expect(hrefs).toContain('/privacy')
  })

  it('offers the two things a visitor can use without an account in the footer', () => {
    render(<MemoryRouter><PublicShell><p>body</p></PublicShell></MemoryRouter>)
    const footer = within(screen.getByRole('contentinfo'))
    expect(footer.getByRole('link', { name: /strategy chart/i })).toHaveAttribute('href', '/strategy-chart')
    expect(screen.getByTestId('footer-try')).toHaveAttribute('href', '/try')
  })

  it('keeps the chart reachable on a phone, through the menu', () => {
    render(<MemoryRouter><PublicShell><p>body</p></PublicShell></MemoryRouter>)
    fireEvent.click(screen.getByTestId('public-menu'))
    expect(within(screen.getByTestId('public-menu-panel')).getByRole('link', { name: /strategy chart/i })).toHaveAttribute('href', '/strategy-chart')
  })

  it('carries the call to action unless told not to', () => {
    render(<MemoryRouter><PublicShell><p>a</p></PublicShell></MemoryRouter>)
    expect(document.querySelectorAll('h2').length).toBeGreaterThan(0)
    cleanup()
    render(<MemoryRouter><PublicShell cta={false}><p>a</p></PublicShell></MemoryRouter>)
    expect(document.querySelectorAll('h2').length).toBe(0)
  })
})
