import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ChevronDown, BookOpen, Sigma, Grid3x3, Coins, Zap, GraduationCap, Layers, Club, Spade } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BlackjackBasics } from './BlackjackBasics'

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

/** The two emphasis tags every topic body may use. */
const BODY_TAGS = {
  g: <span className="text-gold font-medium" />,
  c: <span className="text-content font-medium" />,
}

// The mode names reuse the keys the modes themselves use, so the guide can
// never call a screen something the screen does not call itself.
const MODE_GUIDE: { icon: LucideIcon; nameKey: string; textKey: string }[] = [
  { icon: Zap, nameKey: 'training.speed.title', textKey: 'learn.mode.speed' },
  { icon: GraduationCap, nameKey: 'training.flash.title', textKey: 'learn.mode.flash' },
  { icon: Coins, nameKey: 'training.bet.title', textKey: 'learn.mode.bet' },
  { icon: Layers, nameKey: 'training.deck.title', textKey: 'learn.mode.deck' },
  { icon: Club, nameKey: 'casino.name', textKey: 'learn.mode.casino' },
]

/** Learn / theory page — explains card counting for beginners. */
export function LearnPage() {
  const { t } = useTranslation()
  const [open, setOpen] = useState<Set<string>>(new Set(['what-is-counting']))

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
                    <div key={topic.id} className="surface overflow-hidden">
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
                        <div className="px-4 pb-4 -mt-1 text-sm text-content/60 leading-relaxed">
                          <Trans i18nKey={`learn.topics.${topic.id}.body`} components={BODY_TAGS} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

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
