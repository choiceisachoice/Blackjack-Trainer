import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UnsavedSignOutDialog } from './UnsavedSignOutDialog'

function renderDialog(props: Partial<Parameters<typeof UnsavedSignOutDialog>[0]> = {}) {
  const onStay = vi.fn()
  const onSignOut = vi.fn()
  render(<UnsavedSignOutDialog count={3} onStay={onStay} onSignOut={onSignOut} {...props} />)
  return { onStay, onSignOut }
}

describe('UnsavedSignOutDialog', () => {
  it('says how many sessions are at stake and what signing out does to them', () => {
    renderDialog({ count: 3 })
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('3 training sessions have not been uploaded yet')
    expect(dialog).toHaveTextContent('deletes them from this device')
  })

  it('speaks of one session in the singular', () => {
    renderDialog({ count: 1 })
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '1 training session has not been uploaded yet. Signing out now deletes it from this device.',
    )
  })

  it('puts the focus on staying, so a stray Enter deletes nothing', () => {
    renderDialog()
    expect(screen.getByTestId('unsaved-sign-out-stay')).toHaveFocus()
    expect(screen.getByTestId('unsaved-sign-out-stay')).toHaveTextContent('Stay signed in')
  })

  it('treats Escape and a click beside the dialog as "stay"', () => {
    const { onStay, onSignOut } = renderDialog()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('unsaved-sign-out-backdrop'))
    expect(onStay).toHaveBeenCalledTimes(2)
    expect(onSignOut).not.toHaveBeenCalled()
  })

  it('does not read a click inside the dialog as an answer', () => {
    const { onStay, onSignOut } = renderDialog()
    fireEvent.click(screen.getByTestId('unsaved-sign-out-dialog'))
    expect(onStay).not.toHaveBeenCalled()
    expect(onSignOut).not.toHaveBeenCalled()
  })

  it('signs out only on the button that says so', () => {
    const { onStay, onSignOut } = renderDialog()
    fireEvent.click(screen.getByTestId('unsaved-sign-out-anyway'))
    expect(onSignOut).toHaveBeenCalledOnce()
    expect(onStay).not.toHaveBeenCalled()
  })

  it('locks both answers while the sign-out runs', () => {
    const { onStay } = renderDialog({ busy: true })
    expect(screen.getByTestId('unsaved-sign-out-stay')).toBeDisabled()
    expect(screen.getByTestId('unsaved-sign-out-anyway')).toBeDisabled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onStay).not.toHaveBeenCalled()
  })
})
