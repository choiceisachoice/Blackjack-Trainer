/**
 * The chapters of the theory, and where each one lives on the public site.
 *
 * ## Why every chapter is its own page
 *
 * `/learn` used to carry all eight chapters on one URL. A search for
 * "illustrious 18 chart" is answered by pages that are about nothing else,
 * and a page about eight things at once loses to each of them on its own
 * subject. So each chapter has a URL, a title and a description of its own,
 * in every language, and `/learn` is the hub that links to them.
 *
 * The `id` is the message-key stem (`learn.topics.<id>`) and the accordion's
 * anchor inside the app; the `slug` is what a person reads in the address
 * bar and what a search engine matches against a query — hence
 * `illustrious-18-fab-4`, not `i18-fab4`. The two are kept apart so the
 * message files did not have to be renamed to change a URL.
 */
export interface LearnTopic {
  /** Message-key stem and in-app anchor. */
  id: string
  /** URL segment under `/learn/`. */
  slug: string
}

/** Every chapter, in reading order. */
export const LEARN_TOPICS: readonly LearnTopic[] = [
  { id: 'what-is-counting', slug: 'card-counting' },
  { id: 'hi-lo', slug: 'hi-lo-system' },
  { id: 'true-count', slug: 'true-count' },
  { id: 'basic-strategy', slug: 'basic-strategy' },
  { id: 'deviations', slug: 'deviations' },
  { id: 'i18-fab4', slug: 'illustrious-18-fab-4' },
  { id: 'bet-spread', slug: 'bet-spread' },
  { id: 'deck-estimation', slug: 'deck-estimation' },
]

/** The public path of a chapter, without a language prefix. */
export function learnTopicPath(topic: LearnTopic): string {
  return `/learn/${topic.slug}`
}

/** The chapter behind a URL segment, or null for a slug that is not one. */
export function learnTopicBySlug(slug: string | undefined): LearnTopic | null {
  if (!slug) return null
  return LEARN_TOPICS.find(t => t.slug === slug) ?? null
}

/** The chapter behind a message-key stem. */
export function learnTopicById(id: string): LearnTopic | null {
  return LEARN_TOPICS.find(t => t.id === id) ?? null
}

/** Every chapter's public path, for the route lists and the sitemap. */
export const LEARN_TOPIC_PATHS: readonly string[] = LEARN_TOPICS.map(learnTopicPath)
