import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Spade, Loader2, ArrowLeft } from 'lucide-react'
import { useAuthStore, isSupabaseConfigured } from '../store/auth-store'

/** Supabase rejects anything shorter; checked here so the message arrives sooner. */
const MIN_LENGTH = 6

/**
 * Where the emailed reset link lands: set a new password.
 *
 * ## How someone gets here
 *
 * `resetPasswordForEmail` mails a link back to this route carrying a recovery
 * token. The Supabase client is configured with `detectSessionInUrl`, so by the
 * time this renders the token has been exchanged for a short-lived session and
 * `updateUser({ password })` will apply to the right account. Nothing on this
 * page has to parse the URL.
 *
 * ## Why it checks for a session first
 *
 * Someone can arrive here by typing the address, by following an expired link,
 * or from a second click on a link already used. All three look identical if
 * the form is shown regardless — they would fill it in and be told "Auth
 * session missing", which reads as a bug in the product rather than an expired
 * link. So the state is checked up front and the honest answer given: this link
 * no longer works, here is how to get another.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const status = useAuthStore(s => s.status)
  const updatePassword = useAuthStore(s => s.updatePassword)
  const error = useAuthStore(s => s.error)
  const clearError = useAuthStore(s => s.clearError)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => clearError, [clearError])

  if (!isSupabaseConfigured) {
    return <Fallback title="Password reset is unavailable here" body="This build has no backend configured." />
  }

  // The session resolves asynchronously while the token in the URL is
  // exchanged. Showing "link expired" during that window would be wrong.
  if (status === 'loading') {
    return (
      <Fallback title="Checking your link…" body="One moment.">
        <Loader2 size={18} className="animate-spin text-gold" />
      </Fallback>
    )
  }

  if (status !== 'signedIn') {
    return (
      <Fallback
        title="That link has expired"
        body="Reset links can only be used once, and they do not last long. Request a new one and it will arrive in a minute."
        action={{ to: '/login', label: 'Back to sign in' }}
      />
    )
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return

    setLocalError(null)
    if (password.length < MIN_LENGTH) {
      setLocalError(`Use at least ${MIN_LENGTH} characters.`)
      return
    }
    // Checked because a typo here locks someone out of the account they were
    // in the middle of recovering — the one moment where that is least
    // forgivable.
    if (password !== confirm) {
      setLocalError('The two passwords do not match.')
      return
    }

    setBusy(true)
    try {
      const err = await updatePassword(password)
      // Already signed in on the recovery session, so there is nothing left to
      // do but let them into the app.
      if (!err) navigate('/app', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  const shown = localError ?? error

  return (
    <div className="app-canvas min-h-screen flex items-center justify-center p-4">
      <div className="surface w-full max-w-sm p-7" data-testid="reset-password">
        <div className="flex flex-col items-center text-center mb-6">
          <span className="grid place-items-center w-12 h-12 rounded-xl text-gold bg-gold/10 border border-gold/20 mb-3">
            <Spade size={22} className="fill-current" />
          </span>
          <h1 className="text-lg font-bold tracking-tight">Choose a new password</h1>
          <p className="mt-1 text-sm text-content/55">You will be signed in straight after.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <Field
            id="new-password"
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            testId="reset-password-new"
          />
          <Field
            id="confirm-password"
            label="Repeat it"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            testId="reset-password-confirm"
          />

          {shown && (
            <p role="alert" className="text-sm text-error" data-testid="reset-password-error">
              {shown}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            data-testid="reset-password-submit"
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold
              bg-gradient-to-br from-gold-bright to-gold text-casino-bg cursor-pointer
              disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? 'Saving…' : 'Save and continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({ id, label, value, onChange, autoComplete, testId }: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  testId: string
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[0.7rem] font-semibold tracking-wider uppercase text-content/45 mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type="password"
        required
        autoComplete={autoComplete}
        value={value}
        onChange={e => onChange(e.target.value)}
        data-testid={testId}
        className="w-full rounded-xl border border-contrast/12 bg-contrast/[.03] px-3.5 py-2.5
          text-content outline-none focus:border-gold/50"
      />
    </div>
  )
}

/** Any state where there is no form to show — with a way onward, never a dead end. */
function Fallback({ title, body, action, children }: {
  title: string
  body: string
  action?: { to: string; label: string }
  children?: React.ReactNode
}) {
  return (
    <div className="app-canvas min-h-screen flex items-center justify-center p-4">
      <div className="surface w-full max-w-sm p-7 text-center" data-testid="reset-password-unavailable">
        <span className="grid place-items-center w-12 h-12 mx-auto rounded-xl text-gold bg-gold/10 border border-gold/20 mb-3">
          {children ?? <Spade size={22} className="fill-current" />}
        </span>
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-content/55 leading-relaxed">{body}</p>
        {action && (
          <Link
            to={action.to}
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold hover:underline"
          >
            <ArrowLeft size={15} /> {action.label}
          </Link>
        )}
      </div>
    </div>
  )
}
