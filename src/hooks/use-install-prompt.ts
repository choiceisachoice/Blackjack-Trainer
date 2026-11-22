import { useSyncExternalStore } from 'react'

/**
 * Chrome's `beforeinstallprompt` event. Not in the DOM typings: it is a
 * Chromium feature (Android, desktop Chrome and Edge), not a standard.
 */
export interface BeforeInstallPromptEvent extends Event {
  /** Open the browser's own install dialog. Usable once per event. */
  prompt(): Promise<void>
  /** What the person chose in that dialog. */
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(l => l())

/*
 * Listened for from the moment this module loads, not from the moment a button
 * mounts: the browser fires the event once, shortly after the page has loaded,
 * and the account page — where the button lives — is a chunk of its own that
 * may arrive minutes later. `App` imports this file for that reason.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    // Keeps Chrome's own mini-infobar away; the offer is the button, and only
    // where someone goes looking for it.
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/**
 * Open the browser's install dialog, if the browser has offered one.
 *
 * @returns What the person chose, or `unavailable` when there is nothing to open
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred
  if (!event) return 'unavailable'
  // An event can be prompted once. Dropped before the dialog opens, so a
  // second tap cannot call `prompt()` on a spent event (it throws).
  deferred = null
  notify()
  try {
    await event.prompt()
    return (await event.userChoice).outcome
  } catch {
    return 'dismissed'
  }
}

/**
 * Whether the browser is offering to install the app right now.
 *
 * True only after `beforeinstallprompt` — Android and desktop Chromium, on a
 * page that is not installed yet. Never on iOS: Safari has no such event and
 * no way for a page to open "Add to Home Screen", so there is nothing honest
 * to show there.
 *
 * @returns Whether `promptInstall` would open a dialog
 */
export function useInstallAvailable(): boolean {
  return useSyncExternalStore(subscribe, () => deferred !== null, () => false)
}
