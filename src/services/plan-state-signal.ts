/**
 * The one bell every writer of the learner's plan answers rings.
 *
 * Where the plan starts, what it aims for, how much time it has and which
 * greetings have been seen are written by five small modules, each to its own
 * `localStorage` key. Two things have to hear about every one of those writes:
 * the screen (which read the keys once, on mount, and never again) and the
 * cloud copy (which did not exist — a sign-out wiped the keys and the next
 * sign-in asked "where are you starting from?" all over again).
 *
 * This module imports nothing, so any of the five can ring it without a cycle.
 */

const UPDATED_KEY = 'bjt_plan_updated_at'

type Listener = (origin: 'local' | 'cloud') => void
const listeners = new Set<Listener>()

/** Counts every change, so a screen can tell "nothing new" from "read again". */
let version = 0

/** How many times the plan answers have changed on this page load. */
export function planStateVersion(): number {
  return version
}

/** True while a merge is writing the answers back; see `withoutRinging`. */
let muted = false

/**
 * Run writes that must not count as the learner answering something — a merge
 * putting the cloud's copy onto this device goes through the same setters as
 * a tap does, and would otherwise stamp "now" on answers given last month.
 *
 * @param write - The writes to run in silence
 */
export function withoutRinging(write: () => void): void {
  muted = true
  try {
    write()
  } finally {
    muted = false
  }
}

/**
 * A plan answer was written on this device: stamp the time and tell whoever
 * listens. The stamp is what lets a merge tell a fresh local answer from a
 * stale one.
 */
export function planStateChanged(): void {
  if (muted) return
  try {
    localStorage.setItem(UPDATED_KEY, String(Date.now()))
  } catch {
    /* storage unavailable — the answer simply is not carried to the cloud */
  }
  version++
  listeners.forEach(l => l('local'))
}

/**
 * The plan answers were replaced by a merge with the cloud's copy. Screens
 * re-read; nothing is pushed back, or the merge would echo for ever.
 *
 * @param updatedAt - The stamp the merged state carries
 */
export function planStateHydrated(updatedAt: number): void {
  try {
    if (updatedAt > 0) localStorage.setItem(UPDATED_KEY, String(updatedAt))
  } catch {
    /* storage unavailable */
  }
  version++
  listeners.forEach(l => l('cloud'))
}

/** When a plan answer was last written on this device; 0 if never. */
export function planStateUpdatedAt(): number {
  try {
    const n = Number(localStorage.getItem(UPDATED_KEY))
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

/**
 * Hear about every change to the plan answers.
 *
 * @param listener - Called with where the change came from
 * @returns A function that stops listening
 */
export function onPlanStateChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
