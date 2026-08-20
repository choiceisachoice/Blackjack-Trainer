import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'

/**
 * A password box with a reveal toggle.
 *
 * Extracted from the reset-password page, which had it and the sign-in form did
 * not — so the one screen where a typo costs a single retry could be checked,
 * and the two where it costs an account could not. Sharing it means the eye is
 * in the same place on every screen that asks for a password, which is most of
 * what makes a control like this useful.
 *
 * The button is labelled for what it will *do* rather than what it is: a screen
 * reader announcing "eye" tells nobody anything, and `aria-pressed` is what
 * carries the current state.
 *
 * `shown` is owned by the caller on purpose. The reset page shows two fields
 * that have to match and reveals both at once, because revealing half of a pair
 * you are asked to compare is no help at all.
 */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  testId,
  shown,
  onToggle,
  minLength,
  placeholder,
  autoFocus,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  testId: string
  shown: boolean
  onToggle: () => void
  minLength?: number
  placeholder?: string
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  const label = shown ? t('auth.hidePassword') : t('auth.showPassword')

  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        data-testid={testId}
        // Right padding leaves room for the button, so a long password scrolls
        // under the eye instead of behind it.
        className="w-full rounded-xl border border-contrast/12 bg-contrast/[.03] pl-3.5 pr-11 py-2.5
          text-content outline-none focus:border-gold/50 placeholder:text-content/25"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        aria-pressed={shown}
        title={label}
        data-testid={`${testId}-reveal`}
        // `tabIndex={-1}`, deliberately: tabbing from the password field should
        // reach the submit button, not a decoration in between. The toggle is
        // still reachable — by click, and by shift-tabbing back — and a
        // keyboard-only user who never wants it is not made to pass it on every
        // single sign-in.
        tabIndex={-1}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center w-8 h-8 rounded-lg
          text-content/40 hover:text-content hover:bg-contrast/8 cursor-pointer transition-colors"
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
