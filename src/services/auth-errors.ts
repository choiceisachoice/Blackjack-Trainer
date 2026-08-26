/**
 * Supabase auth failures, turned into something a person can read.
 *
 * The store used to put `error.message` straight on the screen. From
 * `supabase-js` that is English and written for a developer — "Invalid login
 * credentials", "User already registered", "Email rate limit exceeded" — shown
 * on a German sign-in form to someone who has just mistyped a password.
 *
 * This is the same defect the checkout and portal paths were cleared of in
 * August 2026, and the same fix: the thrown thing goes to the console via
 * `logFailure`, and the screen gets a sentence written for the reader. It is
 * a **key**, not a sentence, so the component owns the wording and the store
 * stays free of display strings — the arrangement that stopped the level-up
 * popup from freezing one language at app start.
 *
 * Matching prefers `code`, which newer `supabase-js` sets and which is stable.
 * The message regexes are the fallback for older releases and for errors that
 * carry no code; a message that matches nothing lands on the generic key
 * rather than being shown verbatim, because an unrecognised string is exactly
 * the one most likely to be developer-facing.
 */

/** The shape this needs from a Supabase auth error. */
export interface AuthErrorLike {
  message: string
  code?: string
  status?: number
}

interface Rule {
  key: string
  codes: readonly string[]
  match?: RegExp
}

const RULES: readonly Rule[] = [
  {
    key: 'errors.auth.invalidCredentials',
    codes: ['invalid_credentials', 'invalid_grant'],
    match: /invalid login credentials|invalid email or password/i,
  },
  {
    key: 'errors.auth.emailTaken',
    codes: ['user_already_exists', 'email_exists'],
    match: /already registered|already been registered|user already exists/i,
  },
  {
    key: 'errors.auth.emailNotConfirmed',
    codes: ['email_not_confirmed'],
    match: /email not confirmed|confirm your email/i,
  },
  {
    key: 'errors.auth.rateLimit',
    codes: ['over_email_send_rate_limit', 'over_request_rate_limit'],
    match: /rate limit|too many requests/i,
  },
  {
    key: 'errors.auth.weakPassword',
    codes: ['weak_password'],
    match: /password should be at least|password is too weak/i,
  },
  {
    key: 'errors.auth.samePassword',
    codes: ['same_password'],
    match: /should be different from the old password/i,
  },
  {
    key: 'errors.auth.invalidEmail',
    codes: ['validation_failed', 'email_address_invalid'],
    match: /unable to validate email|invalid email/i,
  },
  {
    key: 'errors.auth.expiredLink',
    codes: ['otp_expired', 'flow_state_expired'],
    match: /token has expired|link is invalid or has expired/i,
  },
]

/** Shown when nothing matched — deliberately the default, not a fallthrough. */
export const GENERIC_AUTH_ERROR = 'errors.auth.generic'

/** Shown when Supabase is not configured at all (a deployment fault, not a user one). */
export const AUTH_UNAVAILABLE = 'errors.auth.unavailable'

/**
 * The translation key describing why an auth call failed.
 *
 * @param error - The error Supabase returned
 * @returns An i18n key; never the raw message
 */
export function authErrorKey(error: AuthErrorLike): string {
  for (const rule of RULES) {
    if (error.code && rule.codes.includes(error.code)) return rule.key
    if (rule.match?.test(error.message)) return rule.key
  }
  return GENERIC_AUTH_ERROR
}

/** Every key this module can produce — used by the message-parity test. */
export const AUTH_ERROR_KEYS: readonly string[] = [
  ...RULES.map(r => r.key),
  GENERIC_AUTH_ERROR,
  AUTH_UNAVAILABLE,
]
