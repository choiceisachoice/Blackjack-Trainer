import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { AppLoader, LOADER_DELAY_MS } from './AppLoader'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('AppLoader', () => {
  it('shows nothing for a wait too short to be worth mentioning', () => {
    // A loader that flashes for 80ms reads as a stutter, not as polish.
    vi.useFakeTimers()
    render(<AppLoader />)
    expect(screen.queryByTestId('app-loader')).toBeNull()

    act(() => { vi.advanceTimersByTime(LOADER_DELAY_MS - 1) })
    expect(screen.queryByTestId('app-loader')).toBeNull()
  })

  it('appears once the wait is long enough to notice', () => {
    vi.useFakeTimers()
    render(<AppLoader />)

    act(() => { vi.advanceTimersByTime(LOADER_DELAY_MS) })
    expect(screen.getByTestId('app-loader')).toBeInTheDocument()
  })

  it('keeps the app background while hidden, so nothing flashes white', () => {
    vi.useFakeTimers()
    const { container } = render(<AppLoader />)
    expect(container.querySelector('.app-canvas')).toBeInTheDocument()
  })

  it('announces itself to a screen reader once visible', () => {
    render(<AppLoader delayMs={0} />)
    const loader = screen.getByTestId('app-loader')
    expect(loader).toHaveAttribute('role', 'status')
    expect(loader).toHaveAttribute('aria-live', 'polite')
  })

  it('says what is being waited for, in words a person would use', () => {
    render(<AppLoader delayMs={0} label="Signing you in" />)
    expect(screen.getByText('Signing you in')).toBeInTheDocument()
  })

  it('carries the product’s name rather than a bare spinner', () => {
    render(<AppLoader delayMs={0} />)
    expect(screen.getByText('Blackjack Trainer')).toBeInTheDocument()
  })

  it('has a default label, so a caller can never render a nameless wait', () => {
    render(<AppLoader delayMs={0} />)
    expect(screen.getByTestId('app-loader').textContent).toMatch(/loading/i)
  })

  it('cleans up its timer when the wait ends first', () => {
    // The common case: the app finished loading before the loader was due.
    // A leaked timer would set state on an unmounted component.
    vi.useFakeTimers()
    const clear = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = render(<AppLoader />)
    unmount()
    expect(clear).toHaveBeenCalled()
  })
})
