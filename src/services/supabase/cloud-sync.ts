import { localStorageService } from '../storage/storage-service'
import { SupabaseStorageService } from './supabase-storage'
import { useStatsStore } from '../../store/stats-store'
import { requireSupabase, isSupabaseConfigured } from './client'

const cloud = new SupabaseStorageService()

/** localStorage flag key marking a user's one-time local→cloud migration as done. */
function migratedKey(userId: string): string {
  return `bjt_cloud_migrated_${userId}`
}

/**
 * Run when a user signs in:
 *  1. One-time migrate local sessions into the cloud (idempotent — upsert on id,
 *     so it never duplicates or overwrites cloud data).
 *  2. Hydrate the stats store from the cloud (now the source of truth).
 *
 * Non-fatal on failure: the app stays usable, we just log and move on.
 */
export async function handleSignedIn(): Promise<void> {
  if (!isSupabaseConfigured) return
  try {
    const { data } = await requireSupabase().auth.getSession()
    const userId = data.session?.user.id
    if (!userId) return

    if (!localStorage.getItem(migratedKey(userId))) {
      const localSessions = await localStorageService.getAllSessionResults()
      if (localSessions.length > 0) {
        await cloud.saveMany(localSessions)
      }
      try { localStorage.setItem(migratedKey(userId), new Date().toISOString()) } catch { /* ignore */ }
    }

    await useStatsStore.getState().loadStats()
  } catch (e) {
    console.error('cloud sync on sign-in failed', e)
  }
}
