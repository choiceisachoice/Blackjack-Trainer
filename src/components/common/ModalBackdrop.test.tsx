import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ModalBackdrop } from './ModalBackdrop'

afterEach(cleanup)

describe('ModalBackdrop', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<ModalBackdrop onClose={onClose} testId="bd"><p>Inhalt</p></ModalBackdrop>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores other keys', () => {
    const onClose = vi.fn()
    render(<ModalBackdrop onClose={onClose}><p>Inhalt</p></ModalBackdrop>)
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on a click that lands on the backdrop itself', () => {
    const onClose = vi.fn()
    render(<ModalBackdrop onClose={onClose} testId="bd"><p>Inhalt</p></ModalBackdrop>)
    fireEvent.click(screen.getByTestId('bd'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when the click is stopped inside the dialog', () => {
    // This is the contract the callers rely on: they wrap their panel in a div
    // with stopPropagation. If the backdrop ever closed on any click inside,
    // every button in every modal would dismiss it.
    const onClose = vi.fn()
    render(
      <ModalBackdrop onClose={onClose}>
        <div onClick={e => e.stopPropagation()}>
          <button>Bleiben</button>
        </div>
      </ModalBackdrop>,
    )
    fireEvent.click(screen.getByText('Bleiben'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('holds the page still while open and gives scrolling back on unmount', () => {
    const { unmount } = render(<ModalBackdrop onClose={() => {}}><p>Inhalt</p></ModalBackdrop>)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('removes its key listener on unmount', () => {
    const onClose = vi.fn()
    const { unmount } = render(<ModalBackdrop onClose={onClose}><p>Inhalt</p></ModalBackdrop>)
    unmount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('takes the z-index and scrolling from its caller', () => {
    render(<ModalBackdrop onClose={() => {}} z="z-[60]" scroll testId="bd"><p>Inhalt</p></ModalBackdrop>)
    const bd = screen.getByTestId('bd')
    expect(bd.className).toContain('z-[60]')
    expect(bd.className).toContain('overflow-y-auto')
  })
})
