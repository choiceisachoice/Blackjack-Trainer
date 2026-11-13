import '../../i18n'
import enMessages from '../../i18n/messages/en.json'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AppSkeleton } from './AppSkeleton'

afterEach(cleanup)

describe('AppSkeleton', () => {
  it('announces a load to a screen reader, with a sentence and not a silence', () => {
    render(<AppSkeleton />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveAccessibleName(enMessages.common.loadingTraining)
  })

  it('says what is being waited for when the caller knows', () => {
    render(<AppSkeleton label="Signing you in" />)
    expect(screen.getByRole('status')).toHaveAccessibleName('Signing you in')
  })

  it('is there from the first render — an outline of the page does not wait to appear', () => {
    // Unlike the spinner, which holds back 220 ms so it cannot flash.
    render(<AppSkeleton />)
    expect(screen.getByTestId('app-skeleton')).toBeInTheDocument()
  })

  it('keeps the trainer’s geometry, so the real screen lands on it without a jump', () => {
    // The bar is `h-14` with the same border; the canvas is the same full
    // height. If the trainer's shell changes, this has to change with it.
    const { container } = render(<AppSkeleton />)
    const root = screen.getByTestId('app-skeleton')
    expect(root.className).toContain('h-dvh')
    expect(root.className).toContain('app-canvas')
    expect(container.querySelector('.h-14.border-b')).not.toBeNull()
  })

  it('hides the placeholder blocks from assistive technology', () => {
    render(<AppSkeleton />)
    const status = screen.getByRole('status')
    for (const child of Array.from(status.children)) expect(child).toHaveAttribute('aria-hidden')
  })
})
