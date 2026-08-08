import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Spade, Loader2, ArrowLeft, Eye, EyeOff } from 'lucide-react'
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
  // One toggle for both fields: revealing half of a pair you are asked to
  // match is no help at all.
  const [shown, setShown] = useState(false)

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

  /** Whichever problem to report: our own check first, then the server's. */
  const problem = localError ?? error

  return (
    <div className="app-canvas min-h-screen flex items-center justify-center p-4">
      <div className="surface w-full max-w-sm p-7" data-testid="reset-password">
        <div className="flex flex-col items-center text-center mb-6">
          <span className="grid place-items-center w-12 h-12 rounded-xl text-gold bg-gold/10 border border-gold/20 mb-3">
            <Spade size={22} className="fill-current" />
          </span>
          <h1 className="text-lg font-bold tracking-tight">Choose a new password</h1>
          {/* Said before it happens, not after. Someone resetting because
              another person got into their account needs to know the intruder
              is being removed — and someone who simply forgot needs to know why
              their tablet will ask them to sign in again. */}
          <p className="mt-1 text-sm text-content/55">
            You stay signed in here. Any other device gets signed out.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <Field
            id="new-password"
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            testId="reset-password-new"
            shown={shown}
            onToggle={() => setShown(v => !v)}
          />
          <Field
            id="confirm-password"
            label="Repeat it"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            testId="reset-password-confirm"
            shown={shown}
            onToggle={() => setShown(v => !v)}
          />

          {problem && (
            <p role="alert" className="text-sm text-error" data-testid="reset-password-error">
              {problem}
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

/**
 * A password field with a reveal toggle.
 *
 * The toggle matters more here than on a sign-in form. A typo when signing in
 * costs one retry; a typo when *setting* a password becomes the password, and
 * locks you out of the account you were in the middle of recovering. The repeat
 * field catches that too, but only by making you type it wrong twice — being
 * able to look is the version that actually helps.
 *
 * Both fields share one toggle on purpose: revealing only half of a pair you
 * are asked to match is no help at all.
 */
function Field({ id, label, value, onChange, autoComplete, testId, shown, onToggle }: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  testId: string
  shown: boolean
  onToggle: () => void
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[0.7rem] font-semibold tracking-wider uppercase text-content/45 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          required
          autoComplete={autoComplete}
          value={value}
          onChange={e => onChange(e.target.value)}
          data-testid={testId}
          className="w-full rounded-xl border border-contrast/12 bg-contrast/[.03] pl-3.5 pr-11 py-2.5
            text-content outline-none focus:border-gold/50"
        />
        <button
          type="button"
          onClick={onToggle}
          // Labelled for what it will do, not for what it is: a screen reader
          // announcing "eye" tells nobody anything.
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          title={shown ? 'Hide password' : 'Show password'}
          data-testid={`${testId}-reveal`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center w-8 h-8 rounded-lg
            text-content/40 hover:text-content hover:bg-contrast/8 cursor-pointer transition-colors"
        >
          {shown ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
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
