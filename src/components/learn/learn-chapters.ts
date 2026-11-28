import type { AppMode } from '../../store/app-store'
import type { TrainingMode } from '../../services/stats-types'

/**
 * The in-app Learn page as chapters: which there are, in what order, in which
 * column of the overview, and where each one is practised.
 *
 * A pure module so the order and the mapping have a test of their own — and
 * so the public `/learn` hub, which keeps its accordion, is not touched.
 */

/** What a chapter's body is made of. */
export type ChapterKind = 'basics' | 'topic' | 'faq' | 'modes'

/** The overview's four columns, left to right. */
export type ChapterColumn = 'start' | 'count' | 'strategy' | 'betting'

/** One chapter of the overview. */
export interface LearnChapter {
  /** Stable id; for a topic, its message-key stem (`learn.topics.<id>`). */
  id: string
  kind: ChapterKind
  column: ChapterColumn
  /** Reading-order number, 1-based. Reference pages (FAQ, modes) have none. */
  number: number | null
  /** Where "practise this" leads. Null: nothing to practise (the FAQ). */
  practice: AppMode | null
}

/** Every chapter, in reading order (the reference pages last). */
export const LEARN_CHAPTERS: readonly LearnChapter[] = [
  { id: 'basics', kind: 'basics', column: 'start', number: 1, practice: 'casinoSession' },
  { id: 'what-is-counting', kind: 'topic', column: 'count', number: 2, practice: 'speedDrill' },
  { id: 'hi-lo', kind: 'topic', column: 'count', number: 3, practice: 'speedDrill' },
  { id: 'true-count', kind: 'topic', column: 'count', number: 4, practice: 'deckEstimation' },
  { id: 'basic-strategy', kind: 'topic', column: 'strategy', number: 5, practice: 'deviationTraining' },
  { id: 'deviations', kind: 'topic', column: 'strategy', number: 6, practice: 'deviationTraining' },
  { id: 'i18-fab4', kind: 'topic', column: 'strategy', number: 7, practice: 'deviationTraining' },
  { id: 'bet-spread', kind: 'topic', column: 'betting', number: 8, practice: 'betSpread' },
  { id: 'deck-estimation', kind: 'topic', column: 'betting', number: 9, practice: 'deckEstimation' },
  { id: 'faq', kind: 'faq', column: 'start', number: null, practice: null },
  { id: 'modes', kind: 'modes', column: 'start', number: null, practice: 'plan' },
]

/** The columns in display order. */
export const CHAPTER_COLUMNS: readonly ChapterColumn[] = ['start', 'count', 'strategy', 'betting']

/**
 * Which recorded sessions count as practice of a mode.
 *
 * The flashcards screen records as `deviationFlashCards`; the two older
 * names are sessions from the modes it replaced.
 */
const SESSION_MODES: Partial<Record<AppMode, readonly TrainingMode[]>> = {
  speedDrill: ['speedDrill'],
  deviationTraining: ['deviationFlashCards', 'deviationAtTable', 'tableCounting'],
  betSpread: ['betSpread'],
  deckEstimation: ['deckEstimation'],
  casinoSession: ['casinoSession'],
}

/**
 * How many recorded sessions practised a mode.
 *
 * @param sessions - The learner's sessions (anything with a `mode`)
 * @param mode - The app mode a chapter's "practise this" opens
 * @returns The count; 0 for a mode that records no sessions (the plan)
 */
export function practiceCount(sessions: readonly { mode: TrainingMode }[], mode: AppMode | null): number {
  const modes = mode ? SESSION_MODES[mode] : undefined
  if (!modes) return 0
  return sessions.filter(s => modes.includes(s.mode)).length
}

/** The chapters that can be practised and whose practice is recorded. */
export const PRACTISABLE: readonly LearnChapter[] = LEARN_CHAPTERS.filter(c => c.practice && SESSION_MODES[c.practice])

/** Words a minute an unhurried reader takes in prose with numbers in it. */
const WORDS_PER_MINUTE = 200

/**
 * Reading time of a chapter, in whole minutes, at least one.
 *
 * Markup tags (`<g>`, `<c>`) are not words; everything between spaces is.
 *
 * @param texts - Every string the chapter shows
 */
export function readingMinutes(texts: readonly string[]): number {
  const words = texts
    .map(s => s.replace(/<[^>]+>/g, ' ').trim())
    .filter(Boolean)
    .reduce((n, s) => n + s.split(/\s+/).length, 0)
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE))
}

/**
 * Every string inside a nested message object, depth first.
 *
 * @param value - What `t(key, { returnObjects: true })` returned
 */
export function messageStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value && typeof value === 'object') return Object.values(value).flatMap(messageStrings)
  return []
}
