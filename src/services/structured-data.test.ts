import { describe, it, expect } from 'vitest'
import i18next from 'i18next'
import '../i18n'
import { faqJsonLd, siteJsonLd, articleJsonLd, FAQ_COUNT } from './structured-data'

describe('structured data', () => {
  it('builds a FAQPage with every question the page prints', () => {
    const data = faqJsonLd(i18next.t) as { '@type': string; mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity).toHaveLength(FAQ_COUNT)
    for (const q of data.mainEntity) {
      expect(q.name.length).toBeGreaterThan(10)
      expect(q.acceptedAnswer.text.length).toBeGreaterThan(40)
      // A missing key would render as the key path, not a sentence.
      expect(q.name).not.toMatch(/^learn\./)
    }
  })

  it('describes a chapter as an Article with a breadcrumb back to the hub', () => {
    const data = articleJsonLd(i18next.t, {
      headline: 'True Count Explained',
      description: 'Running count divided by decks remaining.',
      url: 'https://black-jack-training.com/learn/true-count',
      hubUrl: 'https://black-jack-training.com/learn',
      hubName: 'Learn',
    }) as { '@graph': Record<string, unknown>[] }
    const [article, crumbs] = data['@graph']
    expect(article['@type']).toBe('Article')
    expect(article.headline).toBe('True Count Explained')
    expect(article.url).toBe('https://black-jack-training.com/learn/true-count')
    expect(crumbs['@type']).toBe('BreadcrumbList')
    const items = crumbs.itemListElement as { position: number; item: string }[]
    expect(items.map(i => i.item)).toEqual(['https://black-jack-training.com/learn', 'https://black-jack-training.com/learn/true-count'])
    // No invented author: the publisher is the site.
    expect(JSON.stringify(data)).not.toContain('"author"')
  })

  it('describes the site without inventing a price', () => {
    const json = JSON.stringify(siteJsonLd(i18next.t))
    expect(json).toContain('"@type":"WebSite"')
    expect(json).toContain('"SoftwareApplication"')
    expect(json).toContain('https://black-jack-training.com/')
    expect(json).not.toContain('offers')
    expect(json).not.toMatch(/CHF|price/i)
  })
})
