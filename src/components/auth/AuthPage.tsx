import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Spade, Loader2 } from 'lucide-react'
import { useAuthStore } from '../../store/auth-store'

/**
 * `reset` is a third mode rather than a separate route.
 *
 * Someone who has just failed to sign in is already looking at this card; a
 * route change would throw away the email they have typed and the place they
 * are in. The mode toggle stays a two-way switch — reset is reached from a link
 * under the form, because it is a recovery path, not a way to use the product.
 */
type Mode = 'signin' | 'signup' | 'reset'

/**
 * Login / registration screen shown when Supabase is configured and no user is
 * signed in. Dark-luxury styling to match the app shell.
 */
export function AuthPage({ notice: initialNotice }: { notice?: string } = {}) {
  const { t } = useTranslation()
  const signIn = useAuthStore(s => s.signIn)
  const signUp = useAuthStore(s => s.signUp)
  const requestPasswordReset = useAuthStore(s => s.requestPasswordReset)
  const error = useAuthStore(s => s.error)
  const clearError = useAuthStore(s => s.clearError)

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  // Seeded from the caller so an arrival can explain itself — e.g. landing
  // here straight after a password change, which would otherwise look like
  // an unexplained logout.
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null)

  const switchMode = (m: Mode) => {
    setMode(m)
    clearError()
    setNotice(null)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setNotice(null)
    try {
      if (mode === 'reset') {
        const err = await requestPasswordReset(email.trim())
        /*
          The same message whether or not that address has an account.

          Anything else turns this form into an account checker: type addresses,
          read the replies, learn who is registered. The store already declines
          to report an unknown address; this is the other half of it, and the
          two have to agree or the wording gives away what the code refused to.
        */
        if (!err) setNotice(t('auth.resetSent'))
      } else if (mode === 'signup') {
        const { error, needsConfirmation } = await signUp(email.trim(), password, username.trim() || undefined)
        // Only mention email when an email is actually coming. With email
        // confirmation off — which is how the project is configured — the
        // account is live immediately and the auth listener takes the learner
        // into the app, so a t('auth.checkInbox') notice would send them looking
        // for a message that will never arrive.
        if (!error && needsConfirmation) {
          setNotice(t('auth.accountCreated'))
        }
      } else {
        await signIn(email.trim(), password)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden">
      {/* ambient glow */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{ background: 'radial-gradient(50% 40% at 50% 0%, color-mix(in srgb, var(--color-gold) 14%, transparent), transparent 70%)' }}
      />

      <div className="surface w-full max-w-sm p-7">
        {/* brand */}
        <div className="flex flex-col items-center text-center mb-6">
          <span className="grid place-items-center w-12 h-12 rounded-xl text-gold bg-gold/10 border border-gold/20 mb-3">
            <Spade size={22} className="fill-current" />
          </span>
          <h1 className="text-2xl font-extrabold text-gold-gradient leading-[1.15] pb-0.5">Blackjack Trainer</h1>
          <p className="text-sm text-content/50 mt-1">
            {mode === 'reset' ? t('auth.subReset')
              : mode === 'signin' ? t('auth.subSignIn')
              : t('auth.subSignUp')}
          </p>
        </div>

        {/* mode toggle */}
        <div className="inline-flex w-full p-0.5 rounded-lg bg-contrast/5 border border-contrast/10 mb-5" role="group" aria-label={t('auth.authMode')}>
          {(['signin', 'signup'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              aria-pressed={mode === m}
              className={`flex-1 px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer transition-colors
                ${(mode === 'reset' ? 'signin' : mode) === m ? 'bg-gold text-black' : 'text-content/60 hover:text-content'}`}
            >
              {m === 'signin' ? t('auth.signIn') : t('auth.register')}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === 'signup' && (
            <Field label={t('auth.username')}>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className={inputClass}
                placeholder={t('auth.usernamePlaceholder')}
              />
            </Field>
          )}

          <Field label={t('auth.email')}>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
              data-testid="auth-email"
            />
          </Field>

          {/* No password field when asking for a link — there is nothing to
              type yet, and a required field they cannot fill would block the
              form. */}
          {mode !== 'reset' && (
            <Field label={t('auth.password')}>
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
                data-testid="auth-password"
              />
            </Field>
          )}

          {error && (
            <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2" data-testid="auth-error">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-sm text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2" data-testid="auth-notice">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            data-testid="auth-submit"
            className="w-full py-2.5 rounded-xl font-semibold text-black bg-gradient-to-b from-gold-bright to-gold
              border border-gold/50 cursor-pointer flex items-center justify-center gap-2
              shadow-[0_10px_30px_-12px_var(--color-gold)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === 'reset' ? t('auth.sendResetLink') : mode === 'signin' ? t('auth.signIn') : t('auth.createAccount')}
          </button>

          {/* Recovery lives under the form, not in the mode toggle: it is a way
              back in when something has gone wrong, not a way to use the app. */}
          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => switchMode('reset')}
              data-testid="auth-forgot"
              className="w-full text-center text-sm text-content/45 hover:text-content
                cursor-pointer transition-colors"
            >
              {t('auth.forgot')}
            </button>
          )}
          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              data-testid="auth-back-to-signin"
              className="w-full text-center text-sm text-content/45 hover:text-content
                cursor-pointer transition-colors"
            >
              {t('auth.backToSignIn')}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

const inputClass =
  'w-full bg-surface-2 border border-contrast/15 rounded-lg px-3 py-2 text-sm text-content ' +
  'placeholder:text-content/30 hover:border-gold/40 focus:border-gold/60 focus:outline-none transition-colors'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold tracking-wide uppercase text-content/40 mb-1.5">{label}</span>
      {children}
    </label>
  )
}
