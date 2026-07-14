import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { AccountPage } from './AccountPage'

describe('AccountPage', () => {
  it('renders the plan and sign-out (no backend → treated as Pro)', () => {
    render(<MemoryRouter><AccountPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument()
    expect(screen.getByText(/Sign out/i)).toBeInTheDocument()
    // With Supabase unconfigured everything is unlocked, so the Pro manage CTA shows.
    expect(screen.getByText(/Manage subscription/i)).toBeInTheDocument()
  })
})
