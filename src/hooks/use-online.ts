import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** What the browser reports right now. Anything but an explicit `false` counts as online. */
function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/**
 * Whether the browser has a network connection, kept current.
 *
 * `navigator.onLine` is only reliable in one direction: `false` means there is
 * no network; `true` means there is an interface, not that our server answers.
 * So this is the signal for "certainly offline" and nothing more — a save that
 * failed with the browser claiming to be online is tracked separately, by
 * `services/storage/pending-sessions`.
 *
 * On the server and on the first client render it says `true`, so a
 * prerendered page never ships an offline notice.
 *
 * @returns `false` only while the browser reports no connection
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true)
}
