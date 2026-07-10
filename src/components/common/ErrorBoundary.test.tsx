import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('kaboom')
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // The boundary logs the caught error; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><div>safe content</div></ErrorBoundary>)
    expect(screen.getByText('safe content')).toBeInTheDocument()
  })

  it('shows the recoverable fallback when a child throws', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByTestId('error-boundary-reset')).toBeInTheDocument()
  })

  it('calls onReset and clears the error when the user retries', () => {
    const onReset = vi.fn()

    function Harness() {
      const [broken, setBroken] = useState(true)
      return (
        <ErrorBoundary onReset={() => { setBroken(false); onReset() }}>
          {broken ? <Boom /> : <div>recovered</div>}
        </ErrorBoundary>
      )
    }

    render(<Harness />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('error-boundary-reset'))

    expect(onReset).toHaveBeenCalledTimes(1)
    expect(screen.getByText('recovered')).toBeInTheDocument()
  })
})
