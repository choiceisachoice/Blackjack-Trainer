import { describe, it, expect } from 'vitest'
import i18next from 'i18next'
import '../i18n'
import { LEARN_TOPICS, LEARN_TOPIC_PATHS, learnTopicBySlug, learnTopicById, learnTopicPath } from './learn-topics'

describe('learn topics', () => {
  it('has a message chapter for every topic', () => {
    for (const topic of LEARN_TOPICS) {
      expect(i18next.exists(`learn.topics.${topic.id}.title`), topic.id).toBe(true)
      expect(i18next.exists(`learn.topics.${topic.id}.more.p4`), topic.id).toBe(true)
      // The page's own head, so no chapter ships with the hub's title.
      expect(i18next.exists(`meta.pages.learn-${topic.slug}.title`), topic.slug).toBe(true)
      expect(i18next.exists(`meta.pages.learn-${topic.slug}.description`), topic.slug).toBe(true)
    }
  })

  it('uses readable, unique slugs', () => {
    const slugs = LEARN_TOPICS.map(t => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(learnTopicById('i18-fab4')?.slug).toBe('illustrious-18-fab-4')
  })

  it('resolves a slug both ways and refuses what is not a chapter', () => {
    expect(learnTopicBySlug('hi-lo-system')?.id).toBe('hi-lo')
    expect(learnTopicBySlug('nope')).toBeNull()
    expect(learnTopicBySlug(undefined)).toBeNull()
    expect(learnTopicPath(LEARN_TOPICS[0])).toBe('/learn/card-counting')
    expect(LEARN_TOPIC_PATHS).toHaveLength(8)
  })
})
