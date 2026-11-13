import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '../services/supabase/client'

/** Stripe subscription statuses that grant Pro access (past_due is a grace window). */
const PRO_STATUSES = new Set(['active', 'trialing', 'past_due'])

/** State shape for the entitlement store. */
export interface EntitlementState {
  /** Raw subscription status from the profile, or 'free'. */
  status: string
  /** End of the paid period (epoch ms), or null. */
  currentPeriodEnd: number | null
  /**
   * Whether the subscription is set to end at `currentPeriodEnd` instead of
   * renewing.
   *
   * Independent of `status`, and that is the whole point: Stripe leaves a
   * cancelled-at-period-end subscription `active`, because the customer paid
   * for the period and keeps it. Without this, "still active" and "cancelled,
   * running out" are indistinguishable — and the app would tell someone who
   * just cancelled that their subscription renews.
   */
  cancelAtPeriodEnd: boolean
  /** Whether the entitlement has been loaded from the cloud at least once. */
  loaded: boolean
}

export interface EntitlementActions {
  /** Load the signed-in user's entitlement from their profile row. */
  loadEntitlement(): Promise<void>
  /**
   * Re-load the entitlement repeatedly until Pro is active or the attempts run
   * out. Used when returning from Stripe Checkout: the webhook that flips the
   * status to `active` arrives a beat after the redirect, so a single load can
   * still read `free`/`incomplete`.
   */
  refreshUntilPro(attempts?: number, intervalMs?: number): Promise<void>
  /** Reset to the free/default state (used on sign-out). */
  reset(): void
}

export type EntitlementStore = EntitlementState & EntitlementActions

const DEFAULT: EntitlementState = {
  status: 'free',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  loaded: false,
}

/**
 * The last entitlement the server confirmed, kept on the device.
 *
 * Without it every page load started at `free` and stayed there until the end
 * of the sign-in sync — five to seven round trips, with this load last. A
 * paying customer was drawn as a free user for that long on every reload:
 * the "Go Pro" crown in the bar, locks on the modes they pay for, the full
 * paywall if they opened one. Then everything changed and the bar shifted.
 *
 * What this is and is not. It is a hint for the seconds before the server
 * answers, so the screen opens as the account was last seen. It is not an
 * entitlement: the answer replaces it the moment it arrives, a failed load
 * falls back to `free` exactly as before, and nothing that sells or refuses
 * to sell reads it — `selectHasSubscription` only believes a loaded state.
 * Gating here is presentation in any case; the code for every mode ships to
 * every browser, and what a subscription buys is enforced by who the webhook
 * wrote into `profiles`.
 *
 * Under the `bjt_` prefix on purpose: the sign-out wipe takes it with the
 * rest of the account's data, so it never greets the next person on the
 * device.
 */
const CACHE_KEY = 'bjt_entitlement'

type CachedEntitlement = Pick<EntitlementState, 'status' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'> & { userId: string }

function readCache(): CachedEntitlement | null {
  if (!isSupabaseConfigured) return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<CachedEntitlement>
    if (typeof v.userId !== 'string' || typeof v.status !== 'string') return null
    return {
      userId: v.userId,
      status: v.status,
      currentPeriodEnd: typeof v.currentPeriodEnd === 'number' ? v.currentPeriodEnd : null,
      cancelAtPeriodEnd: v.cancelAtPeriodEnd === true,
    }
  } catch {
    return null
  }
}

function writeCache(value: CachedEntitlement | null): void {
  try {
    if (value) localStorage.setItem(CACHE_KEY, JSON.stringify(value))
    else localStorage.removeItem(CACHE_KEY)
  } catch { /* a missing hint costs one late repaint, nothing more */ }
}

/** The state a page load opens with: the device's last known answer, unconfirmed. */
function initialState(): EntitlementState {
  const cached = readCache()
  if (!cached) return DEFAULT
  return {
    status: cached.status,
    currentPeriodEnd: cached.currentPeriodEnd,
    cancelAtPeriodEnd: cached.cancelAtPeriodEnd,
    loaded: false,
  }
}

export const useEntitlementStore = create<EntitlementStore>((set, get) => ({
  ...initialState(),

  async loadEntitlement() {
    if (!isSupabaseConfigured || !supabase) {
      set({ ...DEFAULT, loaded: true })
      return
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) { writeCache(null); set({ ...DEFAULT, loaded: true }); return }

      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_status, current_period_end, cancel_at_period_end')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error

      const fresh = {
        status: data?.subscription_status ?? 'free',
        currentPeriodEnd: data?.current_period_end
          ? new Date(data.current_period_end).getTime()
          : null,
        cancelAtPeriodEnd: data?.cancel_at_period_end === true,
      }
      writeCache({ userId, ...fresh })
      set({ ...fresh, loaded: true })
    } catch (e) {
      console.error('failed to load entitlement', e)
      // Free, as before the cache existed: an unanswered question is not a
      // yes. The cached hint is left in place for the next load — one failed
      // request should not also cost the correct first paint afterwards.
      set({ ...DEFAULT, loaded: true })
    }
  },

  async refreshUntilPro(attempts = 8, intervalMs = 1500) {
    for (let i = 0; i < attempts; i++) {
      await get().loadEntitlement()
      if (selectIsPro(get())) return
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, intervalMs))
    }
  },

  reset() {
    writeCache(null)
    set({ ...DEFAULT })
  },
}))

/**
 * Whether the current user has Pro access.
 *
 * When Supabase isn't configured (local dev / tests / offline), there is no
 * billing backend, so everything is unlocked. Otherwise Pro is derived — never
 * stored — from the subscription status and period end, so it can't drift out
 * of sync with Stripe.
 */
export function selectIsPro(state: EntitlementState): boolean {
  if (!isSupabaseConfigured) return true
  if (!PRO_STATUSES.has(state.status)) return false
  return state.currentPeriodEnd === null || state.currentPeriodEnd > Date.now()
}

/** Reactive hook: is the current user Pro? */
export function useIsPro(): boolean {
  return useEntitlementStore(selectIsPro)
}

/**
 * Whether this account actually has a subscription being billed.
 *
 * Deliberately NOT `selectIsPro`. That one answers "may this session use the
 * Pro features", and it says yes whenever there is no billing backend at all —
 * local development, tests, the offline build. Perfectly correct for unlocking
 * a feature, and completely wrong as the basis for "has this person already
 * been sold something", which is what the checkout path needs to know.
 *
 * Conflating the two would mean an offline build silently refuses to sell, and
 * — the direction that costs money — a stale local unlock being treated as
 * proof of payment.
 */
export function selectHasSubscription(state: EntitlementState): boolean {
  // `loaded` first: before the server has answered, `status` may be the
  // device's cached hint, and a hint is not proof of payment.
  return state.loaded && PRO_STATUSES.has(state.status)
}

/** Reactive hook: does this account have a billable subscription? */
export function useHasSubscription(): boolean {
  return useEntitlementStore(selectHasSubscription)
}
