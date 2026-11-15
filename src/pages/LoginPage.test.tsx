import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { LoginPage } from './LoginPage'

/**
 * Where signing in leads. In the test environment Supabase is not configured,
 * so the page behaves as for a signed-in visitor and redirects at once — which
 * is exactly the decision under test.
 */
function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

function arrive(state: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app/*" element={<Where />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
  return screen.getByTestId('where').textContent
}

afterEach(cleanup)

describe('after signing in', () => {
  it('lands on the screen that was asked for', () => {
    // A link from a video to the casino, opened signed out.
    expect(arrive({ from: '/app/casino' })).toBe('/app/casino')
  })

  it('lands on the app when nothing was asked for', () => {
    expect(arrive(null)).toBe('/app')
  })

  it('never follows a target outside the app', () => {
    for (const from of ['https://evil.example/', '//evil.example', '/account', '/app/../admin', 42]) {
      cleanup()
      expect(arrive({ from }), String(from)).toBe('/app')
    }
  })
})
