import { describe, it, expect } from 'vitest'
import { buildDataExport, exportFileName } from './data-export'
import type { TrainingSessionResult } from './stats-types'
import type { TrackedSession } from '../store/bankroll-tracker-store'

const NOW = new Date('2026-09-11T14:30:00Z')

describe('buildDataExport', () => {
  it('carries every part and stamps the time and version', () => {
    const session = { id: 's1', mode: 'speedDrill' } as unknown as TrainingSessionResult
    const tracked = { id: 'b1', result: 500 } as unknown as TrackedSession
    const out = buildDataExport({
      email: 'ada@example.com',
      totalXP: 1234,
      achievements: ['first_hand'],
      sessions: [session],
      bankroll: [tracked],
      now: NOW,
    })
    expect(out.app).toBe('blackjack-trainer')
    expect(out.version).toBe(1)
    expect(out.exportedAt).toBe('2026-09-11T14:30:00.000Z')
    expect(out.email).toBe('ada@example.com')
    expect(out.level.totalXP).toBe(1234)
    expect(out.achievements).toEqual(['first_hand'])
    expect(out.sessions).toEqual([session])
    expect(out.bankroll).toEqual([tracked])
  })

  it('copies the arrays rather than handing out the store’s own', () => {
    // A caller mutating the export must not reach back into live state.
    const achievements = ['a']
    const out = buildDataExport({ email: null, totalXP: 0, achievements, sessions: [], bankroll: [], now: NOW })
    out.achievements.push('b')
    expect(achievements).toEqual(['a'])
  })
})

describe('exportFileName', () => {
  it('is dated, so two exports do not overwrite each other', () => {
    expect(exportFileName(NOW)).toBe('blackjack-trainer-2026-09-11.json')
  })
})
