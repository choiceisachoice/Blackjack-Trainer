import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The way to `/admin/analytics` is shown to admins and to nobody else. The
 * answer comes from `app_admins`, whose only policy returns the caller's own
 * row; a normal user gets an empty answer and sees nothing.
 */

const isAppAdmin = vi.fn<() => Promise<boolean>>()
vi.mock('../services/supabase/app-admin', () => ({ isAppAdmin: () => isAppAdmin() }))
vi.mock('../services/supabase/cloud-sync', () => ({ signOutAndClearLocal: vi.fn() }))
vi.mock('../services/supabase/billing', () => ({ openBillingPortal: vi.fn(), startCheckout: vi.fn() }))

import { AccountPage } from './AccountPage'
import { useEntitlementStore } from '../store/entitlement-store'

beforeEach(() => {
  cleanup()
  isAppAdmin.mockReset()
  useEntitlementStore.setState({ status: 'free', currentPeriodEnd: null, cancelAtPeriodEnd: false, loaded: true })
})

describe('AccountPage — operator link', () => {
  it('shows the analytics link to an admin', async () => {
    isAppAdmin.mockResolvedValue(true)
    render(<MemoryRouter><AccountPage /></MemoryRouter>)
    const link = await screen.findByTestId('account-admin-analytics')
    expect(link).toHaveAttribute('href', '/admin/analytics')
    expect(link).toHaveTextContent('Website analytics')
  })

  it('shows nothing to everyone else', async () => {
    isAppAdmin.mockResolvedValue(false)
    render(<MemoryRouter><AccountPage /></MemoryRouter>)
    await waitFor(() => expect(isAppAdmin).toHaveBeenCalled())
    expect(screen.queryByTestId('account-admin-analytics')).not.toBeInTheDocument()
  })
})
