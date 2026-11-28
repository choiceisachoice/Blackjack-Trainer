import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../../i18n'
import { PublicNavMenu } from './PublicNavMenu'

afterEach(cleanup)

const hrefs = () => Array.from(screen.getByTestId('public-menu-panel').querySelectorAll('a')).map(a => a.getAttribute('href'))

describe('PublicNavMenu', () => {
  it('opens on a tap and offers Learn, the strategy chart and Sign in', () => {
    render(<MemoryRouter><PublicNavMenu /></MemoryRouter>)
    expect(screen.queryByTestId('public-menu-panel')).toBeNull()
    fireEvent.click(screen.getByTestId('public-menu'))
    expect(screen.getByTestId('public-menu')).toHaveAttribute('aria-expanded', 'true')
    expect(hrefs()).toEqual(['/learn', '/strategy-chart', '/login'])
  })

  it('leaves Sign in out when told to, and closes on Escape', () => {
    render(<MemoryRouter><PublicNavMenu signIn={false} /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('public-menu'))
    expect(hrefs()).toEqual(['/learn', '/strategy-chart'])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('public-menu-panel')).toBeNull()
  })
})
