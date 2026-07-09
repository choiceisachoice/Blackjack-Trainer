import { describe, it, expect } from 'vitest'
import {
  normalizeId,
  mergeById,
  pushSession,
  removeCloudSession,
} from './bankroll-sync'
import type { TrackedSession } from '../../store/bankroll-tracker-store'

function mk(overrides: Partial<TrackedSession> = {}): TrackedSession {
  return {
    id: crypto.randomUUID(),
    date: '2026-07-01',
    casino: 'Bellagio',
    result: 500,
    hoursPlayed: 3,
    notes: '',
    createdAt: 1_700_000_000_000,
    ...overrides,
  }
}

describe('bankroll-sync — normalizeId', () => {
  it('keeps a session whose id is already a uuid', () => {
    const s = mk()
    expect(normalizeId(s)).toBe(s)
  })

  it('reassigns a uuid to a legacy non-uuid id', () => {
    const legacy = mk({ id: '1700000000000-abc1234' })
    const fixed = normalizeId(legacy)
    expect(fixed.id).not.toBe(legacy.id)
    expect(fixed.id).toMatch(/^[0-9a-f-]{36}$/i)
    // all other fields preserved
    expect(fixed.result).toBe(legacy.result)
    expect(fixed.date).toBe(legacy.date)
  })
})

describe('bankroll-sync — mergeById', () => {
  it('unions local and cloud sessions by id', () => {
    const a = mk({ id: '11111111-1111-4111-8111-111111111111' })
    const b = mk({ id: '22222222-2222-4222-8222-222222222222' })
    const merged = mergeById([a], [b])
    expect(merged.map(s => s.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('local wins on id conflict (offline edits preserved)', () => {
    const id = '33333333-3333-4333-8333-333333333333'
    const localEdited = mk({ id, result: 999, notes: 'edited offline' })
    const cloudStale = mk({ id, result: 500, notes: 'old' })
    const merged = mergeById([localEdited], [cloudStale])
    expect(merged).toHaveLength(1)
    expect(merged[0].result).toBe(999)
    expect(merged[0].notes).toBe('edited offline')
  })
})

/**
 * With Supabase unconfigured (the test default), the fire-and-forget push/delete
 * hooks must be safe no-ops that never reach the network client.
 */
describe('bankroll-sync (Supabase unconfigured)', () => {
  it('pushSession and removeCloudSession are no-ops that do not throw', () => {
    expect(() => pushSession(mk())).not.toThrow()
    expect(() => removeCloudSession('any-id')).not.toThrow()
  })
})
