import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { PasswordInput } from './PasswordInput'

/**
 * The reveal toggle, as a contract rather than an appearance.
 *
 * It existed on the reset-password page and nowhere else, so the screen where a
 * typo costs one retry could be checked and the two where it costs an account
 * could not. What is asserted here is what someone actually relies on: that the
 * characters really become visible, that the control says what it will do, and
 * that it never submits the form it sits inside.
 */
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  const [shown, setShown] = useState(false)
  return (
    <form onSubmit={e => e.preventDefault()} data-testid="form">
      <PasswordInput
        value={value}
        onChange={setValue}
        autoComplete="current-password"
        testId="pw"
        shown={shown}
        onToggle={() => setShown(v => !v)}
      />
    </form>
  )
}

afterEach(cleanup)

describe('PasswordInput', () => {
  it('hides the characters until asked', () => {
    render(<Harness initial="hunter2" />)
    expect(screen.getByTestId('pw')).toHaveAttribute('type', 'password')
  })

  it('actually reveals them, rather than only changing the icon', () => {
    render(<Harness initial="hunter2" />)
    fireEvent.click(screen.getByTestId('pw-reveal'))
    expect(screen.getByTestId('pw')).toHaveAttribute('type', 'text')
    expect(screen.getByTestId('pw')).toHaveValue('hunter2')
  })

  it('hides them again on a second press', () => {
    render(<Harness initial="hunter2" />)
    fireEvent.click(screen.getByTestId('pw-reveal'))
    fireEvent.click(screen.getByTestId('pw-reveal'))
    expect(screen.getByTestId('pw')).toHaveAttribute('type', 'password')
  })

  it('says what it will do, not what it is', () => {
    // "Eye" is not information. The label has to name the action, and it has to
    // change with the state — otherwise it is wrong half the time.
    render(<Harness />)
    const toggle = screen.getByTestId('pw-reveal')
    expect(toggle).toHaveAccessibleName(/show password/i)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(toggle)
    expect(toggle).toHaveAccessibleName(/hide password/i)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('never submits the form it sits in', () => {
    // A bare <button> inside a <form> defaults to type="submit". Without the
    // explicit type, pressing the eye on the sign-in screen would attempt a
    // sign-in with a half-typed password.
    render(<Harness />)
    expect(screen.getByTestId('pw-reveal')).toHaveAttribute('type', 'button')
  })

  it('stays out of the tab order between the field and the submit button', () => {
    // Reachable by click and by shift-tab, but not something a keyboard user
    // has to step past on every sign-in.
    render(<Harness />)
    expect(screen.getByTestId('pw-reveal')).toHaveAttribute('tabindex', '-1')
  })

  it('keeps typing working while revealed', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('pw-reveal'))
    fireEvent.change(screen.getByTestId('pw'), { target: { value: 'abc' } })
    expect(screen.getByTestId('pw')).toHaveValue('abc')
  })

  it('is still required, so revealing does not weaken validation', () => {
    render(<Harness />)
    expect(screen.getByTestId('pw')).toBeRequired()
    fireEvent.click(screen.getByTestId('pw-reveal'))
    expect(screen.getByTestId('pw')).toBeRequired()
  })
})

describe('where the password managers look', () => {
  it('passes autoComplete through, so a manager fills the right box', () => {
    // Getting this wrong makes a password manager offer the *current* password
    // on a form that is setting a new one.
    const onChange = vi.fn()
    render(
      <PasswordInput
        value=""
        onChange={onChange}
        autoComplete="new-password"
        testId="pw"
        shown={false}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByTestId('pw')).toHaveAttribute('autocomplete', 'new-password')
  })
})
