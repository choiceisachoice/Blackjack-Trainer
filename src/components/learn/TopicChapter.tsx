import { Trans } from 'react-i18next'
import { DeviationTables } from './DeviationTables'
import { BODY_TAGS } from './learn-content'

/** Every topic carries four chapter paragraphs under `more`. */
const CHAPTER_PARAGRAPHS = ['p1', 'p2', 'p3', 'p4'] as const

/**
 * The chapter proper: four paragraphs with the worked numbers, and the
 * deviation tables where the chapter is about them.
 *
 * Shared by the accordion inside the app and by the chapter's own public
 * page, so the two cannot drift. The short `body` above it is the summary a
 * returning reader wants; these are for the first time — and for a search
 * engine, which ranks a paragraph, not a sentence.
 *
 * @param id - The topic's message-key stem
 */
export function TopicChapter({ id }: { id: string }) {
  return (
    <>
      {CHAPTER_PARAGRAPHS.map(p => (
        <p key={p}>
          <Trans i18nKey={`learn.topics.${id}.more.${p}`} components={BODY_TAGS} />
        </p>
      ))}
      {id === 'i18-fab4' && <DeviationTables />}
    </>
  )
}

