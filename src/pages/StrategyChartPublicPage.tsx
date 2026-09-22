import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { PublicShell } from '../components/common/PublicShell'
import { StrategyChart } from '../components/strategy-chart/StrategyChart'
import { UpgradeModalHost } from '../components/pro/UpgradeModalHost'
import { usePageMeta } from '../hooks/use-page-meta'
import { learnTopicById, learnTopicPath } from '../services/learn-topics'

/**
 * `/strategy-chart` — the basic strategy chart without a login.
 *
 * Every trainer that ranks for "card counting trainer" says the same three
 * words on its result: free, no signup. Text earns a reader; a tool earns a
 * link, and a chart that someone can open, switch between S17 and H17 and
 * read at the table is the kind of page other pages point to. It is the
 * same component the app shows, so it cannot fall out of step with the
 * engine's tables; the deviation layer stays behind Pro exactly as inside.
 *
 * The upgrade modal host is mounted here because the chart's locked cells
 * open it, and on this page there is no app shell to carry it.
 */
export function StrategyChartPublicPage() {
  const { t } = useTranslation()
  usePageMeta('strategy-chart', '/strategy-chart')
  const basicStrategy = learnTopicById('basic-strategy')
  const deviations = learnTopicById('i18-fab4')

  return (
    <PublicShell testId="strategy-chart-public">
      <div className="max-w-5xl mx-auto px-4 md:px-6">
        <StrategyChart heading="h1" />
        {/* The chapters that explain what the chart shows — and the deviations
            page, which is where the locked layer's content lives in the open. */}
        <p className="mt-8 text-sm text-content/60 text-center">
          {basicStrategy && (
            <Link to={learnTopicPath(basicStrategy)} className="text-gold hover:text-gold-bright font-semibold" data-testid="chart-to-basic">
              {t('learn.topics.basic-strategy.title')}
            </Link>
          )}
          <span className="mx-2" aria-hidden>·</span>
          {deviations && (
            <Link to={learnTopicPath(deviations)} className="text-gold hover:text-gold-bright font-semibold" data-testid="chart-to-deviations">
              {t('learn.topics.i18-fab4.title')}
            </Link>
          )}
        </p>
      </div>
      <UpgradeModalHost />
    </PublicShell>
  )
}
