/**
 * The bot check on the auth forms.
 *
 * Cloudflare Turnstile, because Supabase Auth verifies it server-side with
 * nothing to write (hCaptcha is the other option; Google reCAPTCHA is not
 * one), and because it runs without a puzzle for almost everyone. The
 * site key is public and lives in the bundle; the secret lives in the
 * Supabase dashboard and nowhere in this repository.
 *
 * With no site key the check is simply off — local development, the test
 * run, the offline preview. That is the only reason this is a module and
 * not two lines in the form: every caller asks the same question and gets
 * the same answer.
 */
export const TURNSTILE_SITE_KEY: string | undefined =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || undefined

/** Whether the auth forms require a captcha token before they submit. */
export const isCaptchaConfigured: boolean = Boolean(TURNSTILE_SITE_KEY)

/** Where Turnstile's script is loaded from. */
export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
