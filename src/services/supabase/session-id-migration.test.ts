import { describe, it, expect } from 'vitest'
import { normalizeSessionId } from './cloud-sync'
import type { TrainingSessionResult } from '../stats-types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A session fixture; only `id` matters for the migration. */
function session(id: string): TrainingSessionResult {
  return {
    id,
    mode: 'speedDrill',
    timestamp: '2026-03-20T10:00:00.000Z',
    durationSeconds: 120,
    totalQuestions: 20,
    correctAnswers: 16,
    accuracy: 0.8,
    bestStreak: 5,
  } as unknown as TrainingSessionResult
}

describe('normalizeSessionId', () => {
  it('replaces a legacy id with a uuid', () => {
    // "a0" is the shape that actually broke a live sign-in: the cloud primary
    // key is a uuid, so Postgres rejected the batch with 22P02.
    const out = normalizeSessionId(session('a0'))
    expect(UUID_RE.test(out.id)).toBe(true)
    expect(out.id).not.toBe('a0')
  })

  it('leaves a valid uuid untouched, so repeated syncs are idempotent', () => {
    const id = crypto.randomUUID()
    const first = normalizeSessionId(session(id))
    const second = normalizeSessionId(first)
    expect(first.id).toBe(id)
    expect(second.id).toBe(id)
  })

  it('keeps every other field intact', () => {
    const original = session('a0')
    const out = normalizeSessionId(original)
    expect(out.mode).toBe(original.mode)
    expect(out.timestamp).toBe(original.timestamp)
    expect(out.accuracy).toBe(original.accuracy)
    expect(out.correctAnswers).toBe(original.correctAnswers)
  })

  it('does not mutate the input', () => {
    const original = session('a0')
    normalizeSessionId(original)
    expect(original.id).toBe('a0')
  })

  it('gives distinct ids to distinct legacy sessions', () => {
    // A shared id would collapse the whole history into one cloud row.
    const ids = ['a0', 'a1', 'a2'].map(i => normalizeSessionId(session(i)).id)
    expect(new Set(ids).size).toBe(3)
  })

  it('rejects near-miss ids that are not real uuids', () => {
    for (const bad of ['', 'a0', '1234', 'not-a-uuid', '12345678-1234-1234-1234-12345678901']) {
      const out = normalizeSessionId(session(bad))
      expect(UUID_RE.test(out.id), `expected a fresh uuid for "${bad}"`).toBe(true)
      expect(out.id).not.toBe(bad)
    }
  })
})
