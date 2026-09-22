import { Trans, useTranslation } from 'react-i18next'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react'
import { PublicShell } from '../components/common/PublicShell'
import { TopicChapter } from '../components/learn/LearnPage'
import { JsonLd } from '../components/common/JsonLd'
import { articleJsonLd } from '../services/structured-data'
import { LEARN_TOPICS, learnTopicBySlug, learnTopicPath } from '../services/learn-topics'
import { usePageMeta, pageMeta, SITE_ORIGIN } from '../hooks/use-page-meta'
import { localeFromPath } from '../i18n/locales'

/** The two emphasis tags the chapter text may use — the same as the accordion's. */
const BODY_TAGS = {
  g: <span className="text-gold font-medium" />,
  c: <span className="text-content font-medium" />,
}

/**
 * `/learn/<slug>` — one chapter of the theory on a page of its own.
 *
 * The chapter text is the accordion's (`TopicChapter`), so the app and the
 * public site cannot say different things. What this page adds is what a
 * search engine needs to rank a chapter on its own subject: a URL, a title
 * and a description that are about this one thing, the previous and next
 * chapter, and a list of the others — so a reader who arrived at the true
 * count from a search finds the running count one click away.
 *
 * An unknown slug goes to the hub rather than to a 404 the app does not
 * have; the router's catch-all would have sent it to the landing.
 */
export function LearnTopicPage() {
  const { t } = useTranslation()
  const { slug } = useParams<{ slug: string }>()
  const topic = learnTopicBySlug(slug)
  const path = topic ? learnTopicPath(topic) : '/learn'
  usePageMeta(topic ? `learn-${topic.slug}` : 'learn', path)

  if (!topic) return <Navigate to="/learn" replace />

  const index = LEARN_TOPICS.indexOf(topic)
  const prev = LEARN_TOPICS[index - 1]
  const next = LEARN_TOPICS[index + 1]
  const prefix = typeof window === 'undefined' ? '' : (localeFromPath(window.location.pathname)?.basename ?? '')
  const meta = pageMeta(t, `learn-${topic.slug}`, `${prefix}${path}`)

  return (
    <PublicShell testId="learn-topic">
      <JsonLd data={articleJsonLd(t, {
        headline: meta.title,
        description: meta.description,
        url: meta.canonical,
        hubUrl: `${SITE_ORIGIN}${prefix}/learn`,
        hubName: t('learn.title'),
      })} />

      <article className="max-w-2xl mx-auto px-4 md:px-6" data-testid={`topic-page-${topic.id}`}>
        <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase text-content/40">
          <BookOpen size={13} className="text-gold" />
          <Link to="/learn" className="hover:text-content">{t('learn.title')}</Link>
          <span aria-hidden>·</span>
          {t('learn.chapterOf', { n: index + 1, total: LEARN_TOPICS.length })}
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-extrabold text-gold-gradient leading-tight">
          {t(`learn.topics.${topic.id}.title`)}
        </h1>
        <p className="mt-4 text-base md:text-lg text-content/80 leading-relaxed">
          <Trans i18nKey={`learn.topics.${topic.id}.body`} components={BODY_TAGS} />
        </p>
        <div className="mt-6 space-y-4 text-[0.95rem] text-content/65 leading-relaxed">
          <TopicChapter id={topic.id} />
        </div>

        {/* Previous and next: the chapters are written to be read in order. */}
        <nav className="mt-10 grid sm:grid-cols-2 gap-3" aria-label={t('learn.otherChapters')}>
          {prev ? (
            <Link to={learnTopicPath(prev)} data-testid="topic-prev" className="surface p-4 flex items-center gap-3 hover:border-gold/40">
              <ArrowLeft size={16} className="text-gold shrink-0" />
              <span className="text-sm font-semibold text-content">{t(`learn.topics.${prev.id}.title`)}</span>
            </Link>
          ) : <span />}
          {next && (
            <Link to={learnTopicPath(next)} data-testid="topic-next" className="surface p-4 flex items-center justify-end gap-3 text-right hover:border-gold/40">
              <span className="text-sm font-semibold text-content">{t(`learn.topics.${next.id}.title`)}</span>
              <ArrowRight size={16} className="text-gold shrink-0" />
            </Link>
          )}
        </nav>

        <section className="mt-10" data-testid="topic-others">
          <h2 className="text-xs font-semibold tracking-[0.2em] uppercase text-content/40 mb-3">{t('learn.otherChapters')}</h2>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {LEARN_TOPICS.filter(other => other.id !== topic.id).map(other => (
              <li key={other.id}>
                <Link to={learnTopicPath(other)} className="text-content/70 hover:text-gold">
                  {t(`learn.topics.${other.id}.title`)}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/learn" className="font-semibold text-gold hover:text-gold-bright">{t('learn.allChapters')}</Link>
            </li>
          </ul>
        </section>
      </article>
    </PublicShell>
  )
}
