import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const isAppAdmin = vi.fn<() => Promise<boolean>>()
vi.mock('../services/supabase/app-admin', () => ({ isAppAdmin: () => isAppAdmin() }))

import { AdminRoute } from './AdminRoute'

function renderAt() {
  return render(
    <MemoryRouter initialEntries={['/admin/analytics']}>
      <Routes>
        <Route path="/admin/analytics" element={<AdminRoute><div>secret numbers</div></AdminRoute>} />
        <Route path="/app" element={<div>the app</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => isAppAdmin.mockReset())

describe('AdminRoute', () => {
  it('shows the page to an admin', async () => {
    isAppAdmin.mockResolvedValue(true)
    renderAt()
    expect(await screen.findByText('secret numbers')).toBeInTheDocument()
  })

  it('sends a non-admin to the app without rendering the page', async () => {
    isAppAdmin.mockResolvedValue(false)
    renderAt()
    expect(await screen.findByText('the app')).toBeInTheDocument()
    expect(screen.queryByText('secret numbers')).not.toBeInTheDocument()
  })

  it('shows a loader, not the page, while the answer is pending', async () => {
    let resolve: (v: boolean) => void = () => {}
    isAppAdmin.mockReturnValue(new Promise<boolean>(r => { resolve = r }))
    renderAt()
    expect(screen.queryByText('secret numbers')).not.toBeInTheDocument()
    expect(screen.queryByText('the app')).not.toBeInTheDocument()
    resolve(true)
    await waitFor(() => expect(screen.getByText('secret numbers')).toBeInTheDocument())
  })
})
