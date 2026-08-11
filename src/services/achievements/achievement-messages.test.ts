import { describe, it, expect } from 'vitest'
import i18next from 'i18next'
import { ALL_ACHIEVEMENTS, achievementName, achievementDescription } from './achievement-list'
import en from '../../i18n/messages/en.json'

/**
 * The 102 achievements carry only an id; their name and description live in
 * the message files under `ach.<id>`.
 *
 * That split is convenient and silent when it breaks. A new achievement added
 * without its two messages does not fail to compile and does not throw — it
 * renders `ach.my_new_award.name` onto the awards page, in every language.
 * These tests are the thing that notices.
 */
const ach = en.ach as Record<string, { name?: string; desc?: string }>

describe('achievement messages', () => {
  it('gives every achievement a name and a description', () => {
    for (const a of ALL_ACHIEVEMENTS) {
      const name = achievementName(a, i18next.t)
      const desc = achievementDescription(a, i18next.t)
      expect(name, `${a.id}: no name`).not.toBe(`ach.${a.id}.name`)
      expect(desc, `${a.id}: no description`).not.toBe(`ach.${a.id}.desc`)
      expect(name.trim().length, a.id).toBeGreaterThan(0)
      expect(desc.trim().length, a.id).toBeGreaterThan(0)
    }
  })

  it('has no messages left over from a deleted achievement', () => {
    // The other direction: an achievement removed from the list leaves its
    // messages behind in seven files, where they look like live copy.
    const ids = new Set(ALL_ACHIEVEMENTS.map(a => a.id))
    for (const id of Object.keys(ach)) {
      expect(ids.has(id), `ach.${id} has no achievement`).toBe(true)
    }
  })

  it('never gives two achievements the same name', () => {
    // Two identically named awards on one page is a bug in the list, not in
    // the translation — and the list no longer shows the names to catch it.
    const names = ALL_ACHIEVEMENTS.map(a => achievementName(a, i18next.t))
    const seen = new Map<string, string>()
    for (const [i, name] of names.entries()) {
      const first = seen.get(name)
      expect(first, `"${name}" is used by both ${first} and ${ALL_ACHIEVEMENTS[i].id}`).toBeUndefined()
      seen.set(name, ALL_ACHIEVEMENTS[i].id)
    }
  })
})
