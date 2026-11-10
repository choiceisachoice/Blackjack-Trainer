import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('framer-motion', () => {
  const strip = (props: Record<string, unknown>) => {
    const { initial, animate, exit, transition, ...rest } = props
    return rest
  }
  const motion = new Proxy({}, {
    get: (_t, tag: string) =>
      ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement(tag, strip(props), children),
  })
  return { motion, useReducedMotion: () => true }
})

import { QrRewardWelcome, type QrRewardWelcomeProps } from './QrRewardWelcome'

const base: QrRewardWelcomeProps = {
  percent: 35, loading: false, yearlyPrice: 'CHF 69.00', monthlyTotal: 'CHF 106.80',
  signedIn: true, busy: false, error: null, onClaim: vi.fn(), onClose: vi.fn(),
}

beforeEach(() => cleanup())

describe('QrRewardWelcome', () => {
  it('names the reward with the live percentage and the prices behind it', () => {
    render(<QrRewardWelcome {...base} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByTestId('qr-reward-amount').textContent).toContain('35')
    expect(screen.getByText(/CHF 69\.00/)).toBeTruthy()
    expect(screen.getByText(/CHF 106\.80/)).toBeTruthy()
  })

  it('shows no number while the prices load, and none when they could not be confirmed', () => {
    const { rerender } = render(<QrRewardWelcome {...base} percent={null} loading yearlyPrice={null} monthlyTotal={null} />)
    expect(screen.getByTestId('qr-reward-amount').textContent).not.toMatch(/\d/)
    rerender(<QrRewardWelcome {...base} percent={null} loading={false} yearlyPrice={null} monthlyTotal={null} />)
    expect(screen.getByTestId('qr-reward-amount').textContent).not.toMatch(/\d/)
  })

  it('claims with the one button, and says sign-up comes first when signed out', () => {
    const onClaim = vi.fn()
    const { rerender } = render(<QrRewardWelcome {...base} onClaim={onClaim} />)
    fireEvent.click(screen.getByTestId('qr-reward-claim'))
    expect(onClaim).toHaveBeenCalledTimes(1)
    const signedInLabel = screen.getByTestId('qr-reward-claim').textContent
    rerender(<QrRewardWelcome {...base} onClaim={onClaim} signedIn={false} />)
    expect(screen.getByTestId('qr-reward-claim').textContent).not.toBe(signedInLabel)
  })

  it('is disabled while checkout starts, and shows the error sentence', () => {
    render(<QrRewardWelcome {...base} busy error="Checkout could not start." />)
    expect((screen.getByTestId('qr-reward-claim') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toBe('Checkout could not start.')
  })

  it('closes on Escape, on the backdrop and on the close button, not on the card', () => {
    const onClose = vi.fn()
    render(<QrRewardWelcome {...base} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('dialog'))
    fireEvent.click(screen.getByLabelText(/close/i))
    expect(onClose).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByText(/35/))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('puts the focus on the claim button', () => {
    render(<QrRewardWelcome {...base} />)
    expect(document.activeElement).toBe(screen.getByTestId('qr-reward-claim'))
  })

  it('drops the falling chips with reduced motion', () => {
    render(<QrRewardWelcome {...base} />)
    expect(screen.queryByTestId('qr-reward-rain')).toBeNull()
  })
})
