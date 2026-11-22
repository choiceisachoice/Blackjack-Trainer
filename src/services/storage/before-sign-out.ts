/**
 * Work that has to finish before a sign-out wipes this device.
 *
 * The wipe in `signOutAndClearLocal` is a security boundary and runs first by
 * design — but anything still held only in memory or only on the device at
 * that moment is lost with it, or worse, is written *after* it into storage
 * that no longer has an owner and is then merged into whoever signs in next.
 * A casino table in play is the case that showed it: unmounting the table
 * recorded the session after the wipe.
 *
 * The sync layer may not import the table (services do not import components),
 * so the table registers here and the sign-out runs whatever is registered
 * while the user is still signed in.
 */

/** One piece of work; may be async. It must not throw for the sign-out to wait on the rest. */
export type BeforeSignOutTask = () => void | Promise<void>

const tasks = new Set<BeforeSignOutTask>()

/**
 * Register work to run before the next sign-out wipes the device.
 *
 * @returns The function that removes it again (call it on unmount)
 */
export function registerBeforeSignOut(task: BeforeSignOutTask): () => void {
  tasks.add(task)
  return () => { tasks.delete(task) }
}

/**
 * Run everything registered, in registration order, and wait for it.
 *
 * A task that throws or rejects is logged and skipped: one failing piece must
 * not keep the others from running, and none of them may keep a person from
 * signing out.
 */
export async function runBeforeSignOut(): Promise<void> {
  for (const task of [...tasks]) {
    try {
      await task()
    } catch (e) {
      console.error('a before-sign-out task failed', e)
    }
  }
}
