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
  /** Whether the entitlement has been loaded from the cloud at least once. */
  loaded: boolean
}

export interface EntitlementActions {
  /** Load the signed-in user's entitlement from their profile row. */
  loadEntitlement(): Promise<void>
  /** Reset to the free/default state (used on sign-out). */
  reset(): void
}

export type EntitlementStore = EntitlementState & EntitlementActions

const DEFAULT: EntitlementState = { status: 'free', currentPeriodEnd: null, loaded: false }

export const useEntitlementStore = create<EntitlementStore>((set) => ({
  ...DEFAULT,

  async loadEntitlement() {
    if (!isSupabaseConfigured || !supabase) {
      set({ ...DEFAULT, loaded: true })
      return
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) { set({ ...DEFAULT, loaded: true }); return }

      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_status, current_period_end')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error

      set({
        status: data?.subscription_status ?? 'free',
        currentPeriodEnd: data?.current_period_end
          ? new Date(data.current_period_end).getTime()
          : null,
        loaded: true,
      })
    } catch (e) {
      console.error('failed to load entitlement', e)
      set({ ...DEFAULT, loaded: true })
    }
  },

  reset() {
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
