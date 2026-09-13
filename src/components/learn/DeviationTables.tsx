import { useTranslation } from 'react-i18next'
import { ILLUSTRIOUS_18_ROWS, FAB_4_ROWS, type DeviationRow } from '../../services/deviation-table'
import { actionLabelKey, formatTC } from '../strategy-chart/chart-primitives'

/**
 * The Illustrious 18 and the Fab 4 as tables, generated from the engine.
 *
 * "Illustrious 18 chart" is the most searched phrase in this whole field, and
 * until now the app had the numbers only inside the flashcards, behind the
 * login. Here they are as plain table markup a crawler can read — and because
 * they come from the same list the casino table grades against, the page can
 * never promise an index the trainer does not enforce.
 */
export function DeviationTables() {
  const { t } = useTranslation()
  return (
    <div className="space-y-6" data-testid="deviation-tables">
      <Table title={t('learn.table.i18Title')} rows={ILLUSTRIOUS_18_ROWS} testId="table-i18" />
      <Table title={t('learn.table.fab4Title')} rows={FAB_4_ROWS} testId="table-fab4" />
      <p className="text-xs text-content/45">{t('learn.table.note')}</p>
    </div>
  )
}

function Table({ title, rows, testId }: { title: string; rows: readonly DeviationRow[]; testId: string }) {
  const { t } = useTranslation()
  const action = (name: string) => (name === 'Insurance' ? t('learn.table.insurance') : t(actionLabelKey(name)))
  return (
    <div className="overflow-x-auto rounded-xl border border-contrast/10" data-testid={testId}>
      <table className="w-full text-sm">
        <caption className="text-left px-4 pt-3 pb-2 font-semibold text-content">{title}</caption>
        <thead>
          <tr className="text-xs uppercase tracking-wide text-content/45">
            <th scope="col" className="text-left font-semibold px-4 py-2">{t('learn.table.hand')}</th>
            <th scope="col" className="text-left font-semibold px-4 py-2">{t('learn.table.dealer')}</th>
            <th scope="col" className="text-right font-semibold px-4 py-2">{t('learn.table.index')}</th>
            <th scope="col" className="text-left font-semibold px-4 py-2">{t('learn.table.play')}</th>
            <th scope="col" className="text-left font-semibold px-4 py-2">{t('learn.table.otherwise')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-contrast/8">
          {rows.map(row => (
            <tr key={`${row.hand}|${row.dealer}`}>
              <td className="px-4 py-2 font-medium text-content tabular-nums">{row.anyHand ? t('learn.table.any') : row.hand.replace(',', '-')}</td>
              <td className="px-4 py-2 text-content/80 tabular-nums">{row.dealer}</td>
              <td className="px-4 py-2 text-right text-gold font-semibold tabular-nums">{formatTC(row.index)}</td>
              <td className="px-4 py-2 text-content">{action(row.above)}</td>
              <td className="px-4 py-2 text-content/60">{action(row.below)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
