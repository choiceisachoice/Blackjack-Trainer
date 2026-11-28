import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ChevronDown, BookOpen, Sigma, Grid3x3, Coins, Spade, ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BlackjackBasics } from './BlackjackBasics'
import { TopicChapter } from './TopicChapter'
import { BODY_TAGS, MODE_GUIDE } from './learn-content'
import { FAQ_COUNT } from '../../services/structured-data'
import { learnTopicById, learnTopicPath } from '../../services/learn-topics'

// The public chapter pages import the chapter from here, as they always have.
export { TopicChapter }

interface Topic {
  /** Doubles as the accordion's identity and the stem of its message keys. */
  id: string
}

interface Section {
  titleKey: string
  icon: LucideIcon
  topics: Topic[]
}

/**
 * Beginner-friendly theory, grouped by area. The jargon lives here — not in
 * the drills.
 *
 * The prose itself lives in the message files. Each topic body is assembled
 * with `Trans` over two tags — `<g>` for the gold highlight, `<c>` for the
 * stronger text colour — so a translation decides which words carry the
 * emphasis. Splitting the sentences into fragments around a `<span>` would
 * have frozen English word order into all seven languages.
 */
const SECTIONS: Section[] = [
  {
    titleKey: 'learn.sections.basics',
    icon: Sigma,
    topics: [{ id: 'what-is-counting' }, { id: 'hi-lo' }, { id: 'true-count' }],
  },
  {
    titleKey: 'learn.sections.strategy',
    icon: Grid3x3,
    topics: [{ id: 'basic-strategy' }, { id: 'deviations' }, { id: 'i18-fab4' }],
  },
  {
    titleKey: 'learn.sections.betting',
    icon: Coins,
    topics: [{ id: 'bet-spread' }, { id: 'deck-estimation' }],
  },
]

/** Every topic id, in page order. */
const ALL_TOPICS = SECTIONS.flatMap(s => s.topics.map(t => t.id))

/**
 * Learn / theory page — explains card counting for beginners.
 *
 * @param openAll - Start with every topic expanded. The public `/learn` page
 *   passes this: a collapsed topic is not in the DOM, and what is not in the
 *   DOM is not indexed — a crawler would see eight headings and one paragraph.
 *   Without it the accordion starts with the first topic open. (The app no
 *   longer renders this page: it shows the chapter overview, `LearnChapters`,
 *   which renders the same chapters.)
 * @param chapters - `inline` keeps the whole chapter in the accordion.
 *   `linked` shows the summary and a link to the chapter's own page
 *   (the public hub): the same text on two URLs would have each competing
 *   with the other, so the public site carries every chapter exactly once.
 */
export function LearnPage({ openAll = false, chapters = 'inline' }: { openAll?: boolean; chapters?: 'inline' | 'linked' } = {}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<Set<string>>(() => new Set(openAll ? ALL_TOPICS : ['what-is-counting']))

  const toggle = (id: string) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6" data-testid="learn-page">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="grid place-items-center w-14 h-14 mx-auto mb-4 rounded-2xl text-gold bg-gold/10 border border-gold/20">
            <BookOpen size={26} />
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gold-gradient">{t('learn.title')}</h1>
          <p className="mt-2 text-sm text-content/50">
            {t('learn.sub')}
          </p>
        </div>

        {/* Part one: the game itself. Read in order — the counting chapters
            below rely on every term introduced here. */}
        <section className="mb-10">
          <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-3">
            <Spade size={13} className="text-gold" />
            {t('learn.part1.title')}
          </h2>
          <p className="text-sm text-content/50 mb-4 max-w-[52ch]">
            {t('learn.part1.sub')}
          </p>
          <BlackjackBasics />
        </section>

        {/* Part two: counting. Reference-style — open what you need. */}
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-3">
          <Sigma size={13} className="text-gold" />
          {t('learn.part2.title')}
        </h2>
        <p className="text-sm text-content/50 mb-4 max-w-[52ch]">
          {t('learn.part2.sub')}
        </p>
        <div className="space-y-8">
          {SECTIONS.map(section => (
            <section key={section.titleKey}>
              <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-3">
                <section.icon size={14} className="text-gold" />
                {t(section.titleKey)}
              </h2>
              <div className="space-y-2">
                {section.topics.map(topic => {
                  const isOpen = open.has(topic.id)
                  return (
                    // `id` so `/learn#hi-lo` lands on the topic, and so the
                    // chapters can be linked from outside.
                    <div key={topic.id} id={topic.id} className="surface overflow-hidden scroll-mt-24">
                      <button
                        onClick={() => toggle(topic.id)}
                        aria-expanded={isOpen}
                        data-testid={`topic-${topic.id}`}
                        className="w-full flex items-center justify-between gap-3 p-4 text-left cursor-pointer hover:bg-contrast/5 transition-colors"
                      >
                        <span className="font-semibold text-content">{t(`learn.topics.${topic.id}.title`)}</span>
                        <ChevronDown
                          size={18}
                          className={`text-content/40 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 -mt-1 text-sm text-content/60 leading-relaxed space-y-3">
                          <p className="text-content/75">
                            <Trans i18nKey={`learn.topics.${topic.id}.body`} components={BODY_TAGS} />
                          </p>
                          {chapters === 'inline' ? (
                            <TopicChapter id={topic.id} />
                          ) : (
                            <Link
                              to={learnTopicPath(learnTopicById(topic.id)!)}
                              data-testid={`read-${topic.id}`}
                              className="inline-flex items-center gap-1.5 min-h-10 font-semibold text-gold hover:text-gold-bright"
                            >
                              {t('learn.readChapter')} <ArrowRight size={15} />
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          {/* The questions people actually type into a search box, answered
              in the open — not in an accordion, because a closed answer is
              not in the DOM. The public page mirrors these as FAQPage data. */}
          <section data-testid="learn-faq">
            <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-3">
              <BookOpen size={14} className="text-gold" />
              {t('learn.faq.title')}
            </h2>
            <div className="surface p-4 space-y-4">
              {Array.from({ length: FAQ_COUNT }, (_, i) => i + 1).map(n => (
                <div key={n}>
                  <h3 className="text-sm font-semibold text-content">{t(`learn.faq.q${n}`)}</h3>
                  <p className="mt-1 text-sm text-content/60 leading-relaxed">{t(`learn.faq.a${n}`)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Mode guide */}
          <section>
            <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-3">
              <BookOpen size={14} className="text-gold" />
              {t('learn.modesTitle')}
            </h2>
            <div className="surface p-4 space-y-3">
              {MODE_GUIDE.map(m => (
                <div key={m.nameKey} className="flex items-start gap-3">
                  <span className="grid place-items-center w-9 h-9 rounded-lg text-gold bg-gold/10 border border-gold/20 shrink-0">
                    <m.icon size={17} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-content">{t(m.nameKey)}</p>
                    <p className="text-xs text-content/55 leading-snug">{t(m.textKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="pb-10" />
      </div>
    </div>
  )
}
