import { create } from 'zustand'

/**
 * Where the sign-in merge with the cloud stands on this page load.
 *
 *  - `idle` — not started (signed out, or the first render after a sign-in)
 *  - `syncing` — in flight
 *  - `done` — finished, whether it succeeded or not
 */
export type CloudSyncStatus = 'idle' | 'syncing' | 'done'

interface CloudSyncStore {
  status: CloudSyncStatus
  /** Set by the sync itself; nothing else has an opinion. */
  set(status: CloudSyncStatus): void
}

/**
 * Lets a screen wait for the account's data instead of judging an empty
 * device.
 *
 * The plan decides between "welcome, where are you starting from?" and "here
 * is your next drill" from answers that, right after a sign-in, are still on
 * their way down. Without this it decided at once, from nothing, and asked a
 * returning learner the first-day question.
 */
export const useCloudSyncStore = create<CloudSyncStore>(set => ({
  status: 'idle',
  set: status => set({ status }),
}))
