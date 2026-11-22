import { create } from 'zustand'
import {
  countTrialHand,
  onTrialChanged,
  readTrialHandsUsed,
  trialHandsLeft,
} from '../services/casino-trial'
import { pushProfileScalars } from '../services/supabase/profiles-sync'

/**
 * The free trial of the casino table, as the screens see it.
 *
 * The count itself is kept by `services/casino-trial.ts` (and carried to the
 * account by `profiles-sync`); this mirrors it so a component re-renders when
 * a hand is settled or a merge with the cloud lands. See the service for what
 * the trial is and what it cannot guarantee.
 */
export interface CasinoTrialState {
  /** Trial hands played. Zero while `known` is false. */
  used: number
  /**
   * Whether this device knows the account's count. False until the first
   * merge with the cloud has landed here — and nothing is offered until then.
   */
  known: boolean
  /**
   * A trial table is on screen in this tab — being played, or showing its
   * summary.
   *
   * The table has to stay mounted through the last hand's settlement, its
   * review and the summary, all of which come *after* the tenth hand was
   * counted. Without this, `TrainerApp` would see "no hands left" and replace
   * the table with the paywall the moment the last card landed.
   */
  seated: boolean
}

export interface CasinoTrialActions {
  /** Read the count from the device again. */
  refresh(): void
  /** A trial hand was settled: count it, and tell the account. */
  countHand(): void
  /** A trial table came on screen, or left it. */
  setSeated(seated: boolean): void
}

export type CasinoTrialStore = CasinoTrialState & CasinoTrialActions

function fromDevice(): Pick<CasinoTrialState, 'used' | 'known'> {
  const used = readTrialHandsUsed()
  return { used: used ?? 0, known: used !== null }
}

export const useCasinoTrialStore = create<CasinoTrialStore>((set, get) => ({
  ...fromDevice(),
  seated: false,

  refresh() {
    const next = fromDevice()
    const now = get()
    if (next.used !== now.used || next.known !== now.known) set(next)
  },

  countHand() {
    countTrialHand()
    // Fire-and-forget, like every other progress write. It reads the row and
    // writes the greater count, so a device that is behind takes nothing back.
    pushProfileScalars()
  },

  setSeated(seated) {
    if (get().seated !== seated) set({ seated })
  },
}))

// The service is written by the sign-in merge as well as from here.
onTrialChanged(() => useCasinoTrialStore.getState().refresh())

/** Trial hands still to play. Zero while the count is unknown. */
export function selectTrialLeft(state: CasinoTrialState): number {
  return state.known ? trialHandsLeft(state.used) : 0
}

/** Whether the trial can be offered: the count is known and hands remain. */
export function selectTrialOpen(state: CasinoTrialState): boolean {
  return selectTrialLeft(state) > 0
}

/** Reactive hook: trial hands still to play. */
export function useTrialLeft(): number {
  return useCasinoTrialStore(selectTrialLeft)
}

/** Reactive hook: may this account still sit down at the trial table? */
export function useTrialOpen(): boolean {
  return useCasinoTrialStore(selectTrialOpen)
}
