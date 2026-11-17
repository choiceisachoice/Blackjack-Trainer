import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { onPlanStateChanged, planStateVersion } from '../services/plan-state-signal'
import { readPlanState, type PlanState } from '../services/plan-state'
import { isSupabaseConfigured } from '../services/supabase/client'
import { useCloudSyncStore } from '../store/cloud-sync-store'

/**
 * The learner's plan answers, kept current.
 *
 * The plan used to read them once, when it mounted. Right after a sign-in
 * that is before the account's copy has arrived, so it read "never asked" and
 * stayed there. This re-reads whenever an answer is written — by a tap here,
 * or by the merge with the cloud.
 */
export function usePlanState(): PlanState {
  const version = useSyncExternalStore(onPlanStateChanged, planStateVersion)
  // Read again exactly when something was written, and not on every render:
  // the state is nine storage reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readPlanState(), [version])
}

/**
 * Whether the account's data is still on its way down.
 *
 * True only where there is a cloud to wait for, and only until the sign-in
 * merge has finished — successfully or not, so a dead network delays the
 * first-day screens by the length of one failed request and never blocks
 * them.
 */
export function useAwaitingAccount(): boolean {
  const status = useCloudSyncStore(s => s.status)
  // A request that hangs neither succeeds nor fails. After this long the
  // screen stops waiting and shows what the device has.
  const [gaveUp, setGaveUp] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setGaveUp(true), ACCOUNT_WAIT_MS)
    return () => clearTimeout(id)
  }, [])
  return isSupabaseConfigured && status !== 'done' && !gaveUp
}

/** How long a screen waits for the account's data before going on without it. */
export const ACCOUNT_WAIT_MS = 8000
