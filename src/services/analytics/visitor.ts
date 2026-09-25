/**
 * The visitor id: one random UUID per browser profile.
 *
 * It identifies a browser, not a person. It is stored under the `bjt_`
 * prefix on purpose so the sign-out wipe in `local-reset.ts` clears it along
 * with everything else — the same person after signing out is a new visitor,
 * which errs toward counting one person twice rather than following them.
 */
export const VISITOR_ID_KEY = 'bjt_visitor_id'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A random UUID, with a fallback for the rare runtime without `randomUUID`. */
export function newVisitorId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  c.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * The stored visitor id, created on first use.
 *
 * Returns null when storage is unavailable (private mode with storage
 * blocked, a sandboxed frame): a visitor who cannot be remembered for one
 * page is not tracked at all rather than counted as new on every view.
 */
export function getVisitorId(): string | null {
  try {
    const stored = localStorage.getItem(VISITOR_ID_KEY)
    if (stored && UUID.test(stored)) return stored
    const fresh = newVisitorId()
    localStorage.setItem(VISITOR_ID_KEY, fresh)
    return fresh
  } catch {
    return null
  }
}
