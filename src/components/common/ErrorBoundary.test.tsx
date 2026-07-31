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

/**
 * A chunk that will not load is not a component that threw.
 *
 * Routes are code-split, so their `import()` happens at render time. When a
 * deploy replaces the hashed filenames while a tab is still open, that import
 * 404s — and "Try again" is exactly the wrong offer: re-rendering re-requests
 * the same dead URL and fails identically, forever. The only thing that
 * recovers is a full reload, which fetches the new `index.html` and with it the
 * new filenames.
 */
describe('a route whose chunk cannot be fetched', () => {
  const CHUNK_ERRORS = [
    'Failed to fetch dynamically imported module: /assets/LandingPage-BS9r7Ovo.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
  ]

  let reload: ReturnType<typeof vi.fn>
  let realLocation: Location

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    reload = vi.fn()
    realLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...realLocation, reload },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
    vi.restoreAllMocks()
  })

  it.each(CHUNK_ERRORS)('offers a reload rather than a retry for: %s', message => {
    function FailedImport(): never { throw new Error(message) }

    render(<ErrorBoundary><FailedImport /></ErrorBoundary>)

    expect(screen.getByTestId('error-boundary-reload')).toBeInTheDocument()
    // The retry must be absent, not merely secondary — offering it here sends
    // the user round a loop that cannot terminate.
    expect(screen.queryByTestId('error-boundary-reset')).toBeNull()
  })

  it('actually reloads when asked', () => {
    function FailedImport(): never {
      throw new Error('Failed to fetch dynamically imported module: /assets/x.js')
    }
    render(<ErrorBoundary><FailedImport /></ErrorBoundary>)

    fireEvent.click(screen.getByTestId('error-boundary-reload'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('still offers a retry for an ordinary render error', () => {
    // The two paths must not be confused: a component that threw is usually
    // recoverable in place, and forcing a reload there would throw away
    // unsaved in-memory state for no reason.
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByTestId('error-boundary-reset')).toBeInTheDocument()
    expect(screen.queryByTestId('error-boundary-reload')).toBeNull()
  })
})
