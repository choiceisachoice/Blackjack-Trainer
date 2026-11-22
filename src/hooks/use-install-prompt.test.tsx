import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, fireEvent, renderHook } from '@testing-library/react'
import { promptInstall, useInstallAvailable } from './use-install-prompt'
import { InstallAppButton } from '../components/common/InstallAppButton'

/** Chrome's offer, as a page receives it. */
function offerInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  })
  act(() => { window.dispatchEvent(event) })
  return event
}

afterEach(async () => {
  cleanup()
  // Spend any offer a test left behind.
  await act(async () => { await promptInstall() })
})

describe('the install offer', () => {
  it('is not available until the browser offers it — which iOS never does', () => {
    const { result } = renderHook(() => useInstallAvailable())
    expect(result.current).toBe(false)
  })

  it('becomes available on beforeinstallprompt, and keeps the browser banner away', () => {
    const { result } = renderHook(() => useInstallAvailable())
    const event = offerInstall()
    expect(result.current).toBe(true)
    expect(event.defaultPrevented).toBe(true)
  })

  it('is caught even when nothing is mounted yet', () => {
    // The event fires once, soon after load; the account page comes later.
    offerInstall()
    const { result } = renderHook(() => useInstallAvailable())
    expect(result.current).toBe(true)
  })

  it('opens the browser dialog once and reports the choice', async () => {
    const event = offerInstall('dismissed')
    await expect(promptInstall()).resolves.toBe('dismissed')
    expect(event.prompt).toHaveBeenCalledOnce()
    // A spent event cannot be prompted again.
    await expect(promptInstall()).resolves.toBe('unavailable')
    expect(event.prompt).toHaveBeenCalledOnce()
  })

  it('is withdrawn once the app is installed', () => {
    const { result } = renderHook(() => useInstallAvailable())
    offerInstall()
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    expect(result.current).toBe(false)
  })
})

describe('InstallAppButton', () => {
  it('renders nothing where the browser offers no install', () => {
    const { container } = render(<InstallAppButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows one button once the browser offers it, and says it still needs a connection', () => {
    render(<InstallAppButton />)
    offerInstall()
    expect(screen.getByTestId('install-app-button')).toHaveTextContent('Install app')
    expect(screen.getByTestId('install-app')).toHaveTextContent(/still needs a connection/i)
  })

  it('opens the dialog on click and then steps aside', async () => {
    render(<InstallAppButton />)
    const event = offerInstall()
    await act(async () => { fireEvent.click(screen.getByTestId('install-app-button')) })
    expect(event.prompt).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('install-app')).toBeNull()
  })
})
