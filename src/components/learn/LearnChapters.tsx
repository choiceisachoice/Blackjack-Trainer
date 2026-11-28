import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  ArrowLeft, ArrowRight, BookOpen, Check, Club, Coins, GraduationCap, Grid3x3, Layers, ListChecks, Lock, Play,
  Sigma, Spade, Zap, type LucideIcon,
} from 'lucide-react'
import { useAppStore, type AppMode } from '../../store/app-store'
import { useStatsStore } from '../../store/stats-store'
import { useIsPro } from '../../store/entitlement-store'
import { useTrialOpen } from '../../store/casino-trial-store'
import { isModeLocked } from '../../services/pro-features'
import { FAQ_COUNT } from '../../services/structured-data'
import { BlackjackBasics } from './BlackjackBasics'
import { TopicChapter } from './TopicChapter'
import { BODY_TAGS, MODE_GUIDE } from './learn-content'
import {
  CHAPTER_COLUMNS,
  LEARN_CHAPTERS,
  PRACTISABLE,
  messageStrings,
  practiceCount,
  readingMinutes,
  type ChapterColumn,
  type LearnChapter,
} from './learn-chapters'

/** Column headings and their icons. */
const COLUMN: Record<ChapterColumn, { titleKey: string; icon: LucideIcon }> = {
  start: { titleKey: 'learn.hub.colStart', icon: Spade },
  count: { titleKey: 'learn.hub.colCount', icon: Sigma },
  strategy: { titleKey: 'learn.sections.strategy', icon: Grid3x3 },
  betting: { titleKey: 'learn.sections.betting', icon: Coins },
}

/** A practice destination: its name, what it trains, its icon. */
const PRACTICE: Partial<Record<AppMode, { nameKey: string; textKey: string; icon: LucideIcon }>> = {
  speedDrill: { nameKey: 'modes.speedDrill', textKey: 'learn.mode.speed', icon: Zap },
  deviationTraining: { nameKey: 'modes.deviationFlashCards', textKey: 'learn.mode.flash', icon: GraduationCap },
  betSpread: { nameKey: 'modes.betSpread', textKey: 'learn.mode.bet', icon: Coins },
  deckEstimation: { nameKey: 'modes.deckEstimation', textKey: 'learn.mode.deck', icon: Layers },
  casinoSession: { nameKey: 'modes.casinoSession', textKey: 'learn.mode.casino', icon: Club },
  plan: { nameKey: 'nav.modes.plan', textKey: 'learn.hub.planBody', icon: ListChecks },
}

/** A chapter's title, summary and every string it shows (for its reading time). */
function useChapterText() {
  const { t } = useTranslation()
  return useMemo(() => {
    const title = (c: LearnChapter): string => {
      if (c.kind === 'basics') return t('learn.hub.basicsTitle')
      if (c.kind === 'faq') return t('learn.faq.title')
      if (c.kind === 'modes') return t('learn.modesTitle')
      return t(`learn.topics.${c.id}.title`)
    }
    const summary = (c: LearnChapter): string => t(`learn.hub.sum.${c.id}`)
    const minutes = (c: LearnChapter): number => {
      if (c.kind === 'basics') return readingMinutes(messageStrings(t('basics', { returnObjects: true })))
      if (c.kind === 'faq') {
        return readingMinutes(Array.from({ length: FAQ_COUNT }, (_, i) => [t(`learn.faq.q${i + 1}`), t(`learn.faq.a${i + 1}`)]).flat())
      }
      if (c.kind === 'modes') return readingMinutes(MODE_GUIDE.map(m => t(m.textKey)))
      return readingMinutes(messageStrings(t(`learn.topics.${c.id}`, { returnObjects: true })))
    }
    return { title, summary, minutes }
  }, [t])
}

/**
 * The in-app Learn page: nine chapters and two reference pages as cards, each
 * opening its chapter, each with a way straight into the mode that practises
 * it.
 *
 * It was one 830px column, 6,200px tall on a 720px screen, with no contents,
 * no sense of where one was, and no way from a chapter to the drill. The
 * overview fits the owner's 2000x720 screen in one view — four columns, one
 * per part — and every card says how long it takes and how often its drill
 * has been played, from the learner's own sessions.
 *
 * The text is the same text: the topic chapters render `TopicChapter`, the
 * component the public chapter pages render, and the basics render
 * `BlackjackBasics` unchanged.
 */
export function LearnChapters() {
  const { t } = useTranslation()
  const [openId, setOpenId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const sessions = useStatsStore(s => s.sessions)

  const open = (id: string | null) => {
    setOpenId(id)
    rootRef.current?.scrollTo?.({ top: 0 })
  }

  const practised = PRACTISABLE.filter(c => practiceCount(sessions, c.practice) > 0).length
  const chapter = LEARN_CHAPTERS.find(c => c.id === openId) ?? null

  return (
    <div ref={rootRef} className="flex-1 overflow-y-auto px-4 pt-3 pb-5 md:px-6 lg:px-8" data-testid="learn-page">
      <div className="mx-auto w-full max-w-[96rem]">
        {chapter
          ? <ChapterView chapter={chapter} onOpen={open} />
          : (
            <>
              <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-2.5">
                <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-4">
                  <h1 className="flex items-center gap-2.5 text-2xl md:text-3xl font-extrabold text-gold-gradient shrink-0">
                    <BookOpen size={24} className="text-gold" aria-hidden />
                    {t('learn.title')}
                  </h1>
                  <p className="text-sm text-content/60">{t('learn.hub.sub')}</p>
                </div>
                <div className="lg:w-72 shrink-0" data-testid="learn-progress">
                  <p className="text-xs text-content/60 tabular-nums lg:text-right">
                    {t('learn.hub.progress', { done: practised, total: PRACTISABLE.length })}
                  </p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-contrast/10 overflow-hidden" aria-hidden>
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold to-gold-bright origin-left"
                      style={{ transform: `scaleX(${practised / PRACTISABLE.length})` }}
                    />
                  </div>
                </div>
              </header>

              <div className="grid gap-x-4 gap-y-5 md:grid-cols-2 xl:grid-cols-4" data-testid="learn-chapters">
                {CHAPTER_COLUMNS.map(col => {
                  const Icon = COLUMN[col].icon
                  return (
                    <section key={col} aria-labelledby={`learn-col-${col}`} className="flex flex-col gap-2">
                      <h2
                        id={`learn-col-${col}`}
                        className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-content/45 uppercase"
                      >
                        <Icon size={13} className="text-gold" aria-hidden />
                        {t(COLUMN[col].titleKey)}
                      </h2>
                      {LEARN_CHAPTERS.filter(c => c.column === col).map(c => (
                        <ChapterCard key={c.id} chapter={c} onOpen={() => open(c.id)} />
                      ))}
                    </section>
                  )
                })}
              </div>
            </>
          )}
      </div>
    </div>
  )
}

/** Number badge in the gold of the basics lesson. */
function NumberBadge({ n }: { n: number }) {
  return (
    <span className="grid place-items-center w-5 h-5 mt-0.5 shrink-0 rounded-md text-[0.6875rem] font-extrabold bg-gradient-to-b from-gold-bright to-gold text-on-gold tabular-nums">
      {n}
    </span>
  )
}

/** "Chapter 3 · 4 min read", or "Reference · 2 min read". */
function ChapterMeta({ chapter }: { chapter: LearnChapter }) {
  const { t } = useTranslation()
  const text = useChapterText()
  return (
    <span className="flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-content/50">
      {chapter.number != null ? <NumberBadge n={chapter.number} /> : <BookOpen size={14} className="text-gold" aria-hidden />}
      <span>
        {chapter.number != null ? t('learn.hub.chapterN', { n: chapter.number }) : t('learn.hub.reference')}
        {' · '}
        {t('learn.hub.minutes', { n: text.minutes(chapter) })}
      </span>
    </span>
  )
}

/** The practice button: the mode's name, a lock where the mode is closed. */
function PracticeButton({ mode, size }: { mode: AppMode; size: 'sm' | 'lg' }) {
  const { t } = useTranslation()
  const setMode = useAppStore(s => s.setMode)
  const isPro = useIsPro()
  const trialOpen = useTrialOpen()
  const target = PRACTICE[mode]
  if (!target) return null
  const locked = isModeLocked(mode, isPro, trialOpen)
  const cls = size === 'sm'
    ? 'h-7 px-2.5 rounded-lg text-xs font-semibold text-gold bg-gold/10 border border-gold/30 hover:bg-gold/20'
    : 'lift-glow w-full h-11 px-4 rounded-xl text-sm font-bold text-on-gold bg-gradient-to-b from-gold-bright to-gold border border-gold/50 shadow-[0_10px_30px_-12px_var(--color-gold)]'
  return (
    <button
      type="button"
      onClick={() => setMode(mode)}
      data-testid={`practice-${mode}`}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${cls}`}
    >
      {locked ? <Lock size={size === 'sm' ? 12 : 14} aria-label={t('nav.proFeature')} /> : <Play size={size === 'sm' ? 12 : 14} aria-hidden fill="currentColor" />}
      {t(target.nameKey)}
    </button>
  )
}

/** "Practised 12×" with a tick, or "Not practised yet". */
function PracticeStatus({ mode }: { mode: AppMode }) {
  const { t } = useTranslation()
  const sessions = useStatsStore(s => s.sessions)
  const n = practiceCount(sessions, mode)
  if (mode === 'plan') return <span className="text-xs text-content/50">{t('learn.hub.planBody')}</span>
  return n > 0
    ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400" data-testid="practice-status">
        <Check size={13} strokeWidth={3} aria-hidden />
        {t('learn.hub.practised', { n })}
      </span>
    )
    : <span className="text-xs text-content/45" data-testid="practice-status">{t('learn.hub.notYet')}</span>
}

/** One card of the overview. */
function ChapterCard({ chapter, onOpen }: { chapter: LearnChapter; onOpen: () => void }) {
  const { t } = useTranslation()
  const text = useChapterText()
  return (
    <article
      className="surface group px-4 py-3 flex flex-col gap-1.5 hover:border-gold/35 transition-colors"
      data-testid={`chapter-${chapter.id}`}
    >
      <button
        type="button"
        onClick={onOpen}
        data-testid={`open-${chapter.id}`}
        aria-label={chapter.number != null ? `${t('learn.hub.chapterN', { n: chapter.number })}: ${text.title(chapter)}` : text.title(chapter)}
        className="text-left flex flex-col gap-1 cursor-pointer"
      >
        <span className="flex items-start gap-2 text-base leading-6 font-bold text-content group-hover:text-gold-bright transition-colors">
          {chapter.number != null
            ? <NumberBadge n={chapter.number} />
            : <BookOpen size={16} className="text-gold shrink-0 mt-1" aria-hidden />}
          <span className="min-w-0">{text.title(chapter)}</span>
          <ArrowRight size={15} className="shrink-0 mt-[5px] text-content/30 group-hover:text-gold transition-colors" aria-hidden />
          <span className="ml-auto shrink-0 pt-px text-xs font-normal text-content/45 tabular-nums whitespace-nowrap">
            {t('learn.hub.minutesShort', { n: text.minutes(chapter) })}
          </span>
        </span>
        <span className="text-[0.8125rem] text-content/60 leading-[1.35]">{text.summary(chapter)}</span>
      </button>
      {chapter.practice && (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 min-h-7">
          <span className="whitespace-nowrap">
            {chapter.practice !== 'plan' && <PracticeStatus mode={chapter.practice} />}
          </span>
          <PracticeButton mode={chapter.practice} size="sm" />
        </div>
      )}
    </article>
  )
}

/** A chapter's body: the same components the old page and the public pages render. */
function ChapterBody({ chapter }: { chapter: LearnChapter }) {
  const { t } = useTranslation()
  if (chapter.kind === 'basics') return <BlackjackBasics />
  if (chapter.kind === 'faq') {
    return (
      <div className="flex flex-col gap-3" data-testid="learn-faq">
        {Array.from({ length: FAQ_COUNT }, (_, i) => i + 1).map(n => (
          <div key={n} className="surface p-4 md:p-5">
            <h3 className="text-base font-semibold text-content">{t(`learn.faq.q${n}`)}</h3>
            <p className="mt-1.5 text-sm text-content/70 leading-relaxed">{t(`learn.faq.a${n}`)}</p>
          </div>
        ))}
      </div>
    )
  }
  if (chapter.kind === 'modes') {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {MODE_GUIDE.map(m => (
          <div key={m.nameKey} className="surface p-4 flex items-start gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-lg text-gold bg-gold/10 border border-gold/20 shrink-0">
              <m.icon size={17} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-content">{t(m.nameKey)}</p>
              <p className="mt-0.5 text-sm text-content/65 leading-snug">{t(m.textKey)}</p>
            </div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="text-[0.9375rem] text-content/70 leading-relaxed space-y-4 max-w-[68ch]">
      <TopicChapter id={chapter.id} />
    </div>
  )
}

/** The lead under a chapter's title: the topic's own summary paragraph, or the card's line. */
function ChapterLead({ chapter }: { chapter: LearnChapter }) {
  const text = useChapterText()
  return (
    <p className="mt-3 text-base md:text-lg text-content/80 leading-relaxed max-w-[64ch]">
      {chapter.kind === 'topic'
        ? <Trans i18nKey={`learn.topics.${chapter.id}.body`} components={BODY_TAGS} />
        : text.summary(chapter)}
    </p>
  )
}

/**
 * One open chapter: the contents on the left, the text in the middle at a
 * reading width, and "practise this" on the right — so a wide screen is used
 * without stretching the lines.
 */
function ChapterView({ chapter, onOpen }: { chapter: LearnChapter; onOpen: (id: string | null) => void }) {
  const { t } = useTranslation()
  const text = useChapterText()
  const i = LEARN_CHAPTERS.indexOf(chapter)
  const prev = LEARN_CHAPTERS[i - 1] ?? null
  const next = LEARN_CHAPTERS[i + 1] ?? null
  const target = chapter.practice ? PRACTICE[chapter.practice] : undefined

  return (
    <div
      className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_18rem] lg:gap-8 xl:gap-10"
      data-testid="learn-chapter"
    >
      {/* Contents */}
      <nav aria-label={t('learn.hub.contents')} className="max-lg:hidden">
        <div className="sticky top-0 flex flex-col gap-1">
          <BackButton onClick={() => onOpen(null)} />
          <p className="mt-3 mb-1 px-2 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-content/40">{t('learn.hub.contents')}</p>
          {LEARN_CHAPTERS.map(c => {
            const active = c.id === chapter.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onOpen(c.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2.5 min-h-8 px-2 rounded-lg text-left text-sm cursor-pointer transition-colors
                  ${active ? 'bg-gold/10 text-gold font-semibold' : 'text-content/65 hover:text-content hover:bg-contrast/5'}`}
              >
                <span className={`w-5 text-center text-xs tabular-nums shrink-0 ${active ? 'text-gold' : 'text-content/40'}`}>
                  {c.number ?? '·'}
                </span>
                <span className="truncate">{text.title(c)}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* The chapter */}
      <article className="min-w-0 max-w-[52rem] xl:mx-auto xl:w-full">
        <div className="lg:hidden mb-4"><BackButton onClick={() => onOpen(null)} /></div>
        <ChapterMeta chapter={chapter} />
        <h1 className="mt-2 text-2xl md:text-3xl font-extrabold text-gold-gradient leading-tight">{text.title(chapter)}</h1>
        <ChapterLead chapter={chapter} />
        <div className="mt-6">
          <ChapterBody chapter={chapter} />
        </div>

        <nav className="mt-8 grid grid-cols-2 gap-3" aria-label={t('learn.hub.contents')}>
          {prev ? <StepLink label={t('learn.hub.prev')} title={text.title(prev)} onClick={() => onOpen(prev.id)} dir="prev" /> : <span />}
          {next ? <StepLink label={t('learn.hub.next')} title={text.title(next)} onClick={() => onOpen(next.id)} dir="next" /> : <span />}
        </nav>
      </article>

      {/* Practise this */}
      {chapter.practice && target && (
        <aside className="lg:col-start-2 xl:col-start-3 xl:row-start-1 max-xl:max-w-[52rem]">
          <div className="xl:sticky xl:top-0 surface p-5 flex flex-col gap-3" data-testid="learn-practice">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-gold">{t('learn.hub.practiseTitle')}</p>
            <div className="flex items-start gap-3">
              <span className="grid place-items-center w-10 h-10 rounded-xl text-gold bg-gold/10 border border-gold/20 shrink-0">
                <target.icon size={19} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-base font-bold text-content">{t(target.nameKey)}</p>
                <p className="mt-0.5 text-sm text-content/60 leading-snug">{t(target.textKey)}</p>
              </div>
            </div>
            {chapter.practice !== 'plan' && <PracticeStatus mode={chapter.practice} />}
            <PracticeButton mode={chapter.practice} size="lg" />
          </div>
        </aside>
      )}
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="learn-back"
      className="inline-flex items-center gap-2 min-h-9 px-2 rounded-lg text-sm font-semibold text-content/70 hover:text-gold cursor-pointer"
    >
      <ArrowLeft size={16} aria-hidden />
      {t('learn.hub.back')}
    </button>
  )
}

function StepLink({ label, title, onClick, dir }: { label: string; title: string; onClick: () => void; dir: 'prev' | 'next' }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`learn-${dir}`}
      className={`surface p-3.5 flex flex-col gap-0.5 cursor-pointer hover:border-gold/35 transition-colors ${dir === 'next' ? 'items-end text-right' : 'items-start text-left'}`}
    >
      <span className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-content/45">
        {dir === 'prev' && <ArrowLeft size={12} aria-hidden />}
        {label}
        {dir === 'next' && <ArrowRight size={12} aria-hidden />}
      </span>
      <span className="text-sm font-semibold text-content">{title}</span>
    </button>
  )
}
