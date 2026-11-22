/**
 * Which account the local caches on this device belong to.
 *
 * A leaf module with no imports: the sign-out wipe, the sign-in merge and the
 * storage facade all need the answer, and two of those already import each
 * other's neighbours.
 */

/** localStorage key recording which user the local caches currently belong to. */
export const LOCAL_OWNER_KEY = 'bjt_local_owner'

/** The user id the local caches belong to, or null for never-signed-in (guest) data. */
export function getLocalOwner(): string | null {
  try {
    return localStorage.getItem(LOCAL_OWNER_KEY)
  } catch {
    return null
  }
}

/** Record which user the local caches belong to. */
export function setLocalOwner(userId: string): void {
  try {
    localStorage.setItem(LOCAL_OWNER_KEY, userId)
  } catch { /* ignore */ }
}
