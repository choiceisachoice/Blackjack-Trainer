import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublicShell } from './PublicShell'

afterEach(cleanup)

describe('PublicShell', () => {
  it('frames the page with a way home, a way in, and the other public pages', () => {
    render(<MemoryRouter><PublicShell><p>body</p></PublicShell></MemoryRouter>)
    expect(screen.getByText('body')).toBeInTheDocument()
    expect(screen.getByTestId('learn-home')).toHaveAttribute('href', '/')
    expect(screen.getByTestId('learn-start')).toHaveAttribute('href', '/login')
    const hrefs = Array.from(document.querySelectorAll('a')).map(a => a.getAttribute('href'))
    expect(hrefs).toContain('/learn')
    expect(hrefs).toContain('/strategy-chart')
    expect(hrefs).toContain('/privacy')
  })

  it('carries the call to action unless told not to', () => {
    render(<MemoryRouter><PublicShell><p>a</p></PublicShell></MemoryRouter>)
    expect(document.querySelectorAll('h2').length).toBeGreaterThan(0)
    cleanup()
    render(<MemoryRouter><PublicShell cta={false}><p>a</p></PublicShell></MemoryRouter>)
    expect(document.querySelectorAll('h2').length).toBe(0)
  })
})
