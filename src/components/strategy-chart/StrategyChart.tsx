import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { Translate } from '../../i18n/translate'
import { Lock } from 'lucide-react'
import { S17_STRATEGY, H17_STRATEGY } from '../../engine/strategy/basic-strategy-tables'
import type { StrategyAction, StrategyTable } from '../../engine/strategy/types'
import { ILLUSTRIOUS_18 } from '../../engine/counting/deviations'
import { useAppStore } from '../../store/app-store'
import { useIsPro } from '../../store/entitlement-store'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'

/** A count-based deviation attached to a chart cell. */
interface DevInfo {
  /** 1-based number in the Illustrious 18 list. */
  index: number
  /** True-count threshold at/above which `above` applies. */
  threshold: number
  /** Action at/above the threshold. */
  above: string
  /** Action below the threshold. */
  below: string
}

/**
 * Map of `playerHand|dealerUpcard` → deviation, derived from the engine's
 * Illustrious 18. Insurance (playerHand '*') is a side bet, not a chart cell.
 */
const DEVIATION_CELLS: Record<string, DevInfo> = {}
ILLUSTRIOUS_18.forEach((d, i) => {
  if (d.playerHand === '*') return
  DEVIATION_CELLS[`${d.playerHand}|${d.dealerUpcard}`] = {
    index: i + 1,
    threshold: d.trueCountThreshold,
    above: d.actionAbove,
    below: d.actionBelow,
  }
})

/** Format a true count with an explicit sign (e.g. "+2", "0", "−1"). */
function formatTC(tc: number): string {
  if (tc > 0) return `+${tc}`
  if (tc < 0) return `−${Math.abs(tc)}`
  return '0'
}

/** Display action codes shown in chart cells. */
type ChartAction = 'H' | 'S' | 'D' | 'SP' | 'SU'

/** Background colors for each chart action. */
const ACTION_COLORS: Record<ChartAction, string> = {
  H: '#22c55e',
  S: '#eab308',
  D: '#3b82f6',
  SP: '#ef4444',
  SU: '#a855f7',
}

/**
 * The ink written on those fills.
 *
 * All five are saturated mid-tones, and white on a saturated mid-tone is the
 * classic near-miss: measured in the browser, white on #eab308 is **1.92:1**
 * and on #22c55e **2.28:1**, in both themes, on the table people consult most.
 *
 * The colour code itself is learned and stays exactly as it is — only the ink
 * changes, and dark ink clears AA on every one of the five unchanged fills
 * (H 8.37, S 9.94, D 5.18, SP 5.07, SU 4.82). Not `--color-casino-bg`: these
 * fills are the same in both themes, so their ink must be too.
 */
const ACTION_INK = '#10100c'

/**
 * The same five as text on a page surface rather than as a fill.
 *
 * Used by the detail panel, where the action name is coloured type. The fill
 * colours are far too light for that on the light theme (#eab308 as text on
 * white is 1.92:1), so this is the darkened set — each still recognisably its
 * own hue, and each clears AA against the light surface.
 */
const ACTION_TEXT_COLORS: Record<ChartAction, string> = {
  H: '#15803d',
  S: '#a16207',
  D: '#1d4ed8',
  SP: '#b91c1c',
  SU: '#7e22ce',
}

/** Legend labels, as translation keys. */
const ACTION_LABEL_KEY: Record<ChartAction, string> = {
  H: 'chart.action.H',
  S: 'chart.action.S',
  D: 'chart.action.D',
  SP: 'chart.action.SP',
  SU: 'chart.action.SU',
}

/** Dealer upcard columns in display order. */
const DEALER_KEYS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'] as const

/** Resolve a conditional StrategyAction to a simple ChartAction for display. */
function resolveAction(action: StrategyAction): ChartAction {
  switch (action) {
    case 'H': return 'H'
    case 'S': return 'S'
    case 'D': return 'D'
    case 'Ds': return 'D'
    case 'P': return 'SP'
    case 'Rh': return 'SU'
    case 'Rs': return 'SU'
  }
}

/** Full explanation text for the detail panel. */
function getActionExplanation(action: ChartAction): string {
  switch (action) {
    case 'H': return 'Hit - Take another card.'
    case 'S': return 'Stand - Keep your current hand.'
    case 'D': return 'Double Down - Double your bet and take exactly one more card.'
    case 'SP': return 'Split - Split into two separate hands.'
    case 'SU': return 'Surrender - Give up half your bet and fold.'
  }
}

interface CellInfo {
  hand: string
  dealer: string
  action: ChartAction
}

interface SectionRow {
  label: string
  cells: ChartAction[]
}

interface ChartSection {
  title: string
  rows: SectionRow[]
}

/** Build all 4 chart sections from a strategy table. */
function buildSections(table: StrategyTable, t: Translate): ChartSection[] {
  const { hardTotals, softTotals, pairs } = table

  function buildRow(key: string, label: string, table: Record<string, Record<string, StrategyAction>>): SectionRow {
    const row = table[key]
    return {
      label,
      cells: DEALER_KEYS.map(dk => resolveAction(row[dk])),
    }
  }

  const hardHighRows = ['17', '16', '15', '14', '13', '12'].map(k => buildRow(k, k, hardTotals))
  const hardLowRows = ['11', '10', '9'].map(k => buildRow(k, k, hardTotals))
  hardLowRows.push({
    label: '5-8',
    cells: DEALER_KEYS.map(() => 'H' as ChartAction),
  })

  const softRows = ['A,9', 'A,8', 'A,7', 'A,6', 'A,5', 'A,4', 'A,3', 'A,2'].map(k => {
    const num = k.split(',')[1]
    return buildRow(k, `A,${num}`, softTotals)
  })

  const pairOrder = ['A,A', '10,10', '9,9', '8,8', '7,7', '6,6', '5,5', '4,4', '3,3', '2,2']
  const pairRows = pairOrder.map(k => {
    const num = k.split(',')[0]
    const displayLabel = num === 'A' ? 'A,A' : `${num},${num}`
    return buildRow(k, displayLabel, pairs)
  })

  return [
    { title: t('chart.s1'), rows: hardHighRows },
    { title: t('chart.s2'), rows: hardLowRows },
    { title: t('chart.s3'), rows: softRows },
    { title: t('chart.s4'), rows: pairRows },
  ]
}

/**
 * Interactive Basic Strategy chart generated from the engine strategy tables.
 * Displays 4 sections with colored cells, hover effects, and click-to-detail.
 * Automatically switches between S17 and H17 based on selected casino rules.
 */
export function StrategyChart() {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<CellInfo | null>(null)
  const dealerHitsSoft17 = useAppStore(s => s.selectedRules.dealerHitsSoft17)
  // In-page rule override (defaults to the globally selected rules).
  const [h17, setH17] = useState(dealerHitsSoft17)
  const isPro = useIsPro()
  const showUpgrade = useUpgradePrompt(s => s.show)
  // The deviations overlay is a Pro feature; free users see the base chart and
  // a locked toggle that opens the paywall.
  const [showDeviationsPref, setShowDeviationsPref] = useState(true)
  const showDeviations = isPro && showDeviationsPref
  const table = h17 ? H17_STRATEGY : S17_STRATEGY
  const sections = buildSections(table, t)
  const ruleLabel = h17 ? 'H17' : 'S17'

  const selectedDev = selected ? DEVIATION_CELLS[`${selected.hand}|${selected.dealer}`] : undefined

  return (
    <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-5">
        <h2 className="text-2xl md:text-3xl font-extrabold text-gold-gradient">{t('chart.title')}</h2>
        <p className="mt-1 text-sm text-content/50">{t('chart.sub')}</p>
      </div>

      {/* Controls: rule toggle + deviations overlay */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
        <div className="inline-flex p-0.5 rounded-lg bg-contrast/5 border border-contrast/10" role="group" aria-label={t('chart.dealerRule')}>
          {([['S17', false], ['H17', true]] as const).map(([label, isH17]) => (
            <button
              key={label}
              onClick={() => setH17(isH17)}
              aria-pressed={h17 === isH17}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-colors
                ${h17 === isH17 ? 'bg-gold text-on-gold' : 'text-content/60 hover:text-content'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            if (isPro) setShowDeviationsPref(v => !v)
            else showUpgrade(t('chart.proHeadline'))
          }}
          aria-pressed={showDeviations}
          data-testid="toggle-deviations"
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors
            ${showDeviations ? 'bg-gold/20 text-gold border-gold/40' : 'bg-contrast/5 text-content/50 border-contrast/10 hover:text-content/70'}`}
        >
          {isPro
            ? <span className={`w-2 h-2 rounded-full ${showDeviations ? 'bg-gold' : 'bg-content/30'}`} />
            : <Lock size={12} className="text-gold/70" />}
          {t('chart.deviationsToggle')}
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4 justify-center">
        {(Object.keys(ACTION_LABEL_KEY) as ChartAction[]).map(action => (
          <span
            key={action}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
            style={{ backgroundColor: ACTION_COLORS[action], color: ACTION_INK }}
          >
            {action} = {t(ACTION_LABEL_KEY[action])}
          </span>
        ))}
        {showDeviations && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-content" style={{ border: '2px solid var(--color-gold-bright)' }}>
            <span className="grid place-items-center rounded-full text-on-gold font-extrabold" style={{ width: '14px', height: '14px', fontSize: '8px', backgroundColor: 'var(--color-gold-bright)' }}>#</span>
            {t('chart.countDeviation')}
          </span>
        )}
      </div>

      <p className="text-center text-content/40 text-xs mb-4">
        {t('chart.rulesLine', { rules: ruleLabel })}
      </p>

      {/* Scrollable chart area */}
      <div className="overflow-x-auto overflow-y-hidden pb-2">
        <div style={{ minWidth: '600px' }}>
          {sections.map(section => (
            <div key={section.title} className="mb-5">
              <h3 className="text-sm font-semibold text-gold mb-2">{section.title}</h3>

              {/* Header row */}
              <div
                className="grid gap-px mb-px"
                style={{ gridTemplateColumns: '72px repeat(10, 1fr)' }}
              >
                <div className="text-xs font-semibold text-content/50 flex items-center justify-center p-1">
                  {t('chart.handHeader')}
                </div>
                {DEALER_KEYS.map(dk => (
                  <div
                    key={dk}
                    className="text-xs font-semibold text-content/70 flex items-center justify-center p-1 bg-contrast/10 rounded"
                  >
                    {dk}
                  </div>
                ))}
              </div>

              {/* Data rows */}
              {section.rows.map(row => (
                <div
                  key={row.label}
                  className="grid gap-px mb-px"
                  style={{ gridTemplateColumns: '72px repeat(10, 1fr)' }}
                >
                  <div className="text-xs font-semibold text-content/70 flex items-center justify-center p-1">
                    {row.label}
                  </div>
                  {row.cells.map((action, ci) => {
                    const dealer = DEALER_KEYS[ci]
                    const isSelected = selected?.hand === row.label && selected?.dealer === dealer
                    const dev = showDeviations ? DEVIATION_CELLS[`${row.label}|${dealer}`] : undefined
                    return (
                      <button
                        key={dealer}
                        onClick={() => setSelected({ hand: row.label, dealer, action })}
                        data-testid="chart-cell"
                        className="relative flex items-center justify-center rounded text-xs font-bold cursor-pointer transition-all duration-100"
                        style={{
                          backgroundColor: ACTION_COLORS[action],
                          color: ACTION_INK,
                          padding: '6px 2px',
                          outline: isSelected ? '2px solid white' : 'none',
                          outlineOffset: '-1px',
                          boxShadow: dev ? 'inset 0 0 0 2px #f0cd82' : undefined,
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.filter = 'brightness(1.2)'
                          e.currentTarget.style.transform = 'scale(1.05)'
                          e.currentTarget.style.zIndex = '10'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.filter = ''
                          e.currentTarget.style.transform = ''
                          e.currentTarget.style.zIndex = ''
                        }}
                      >
                        {action}
                        {dev && (
                          <span
                            className="absolute -top-1 -right-1 grid place-items-center rounded-full font-extrabold text-black leading-none"
                            style={{
                              minWidth: '14px', height: '14px', padding: '0 2px', fontSize: '8px',
                              backgroundColor: '#f0cd82', boxShadow: '0 0 6px rgba(240,205,130,0.7)',
                            }}
                          >
                            {dev.index}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Detail Panel */}
      {selected && (
        <div className="mt-4 p-4 rounded-xl bg-contrast/10 border border-contrast/20 text-center">
          <p className="text-content text-sm font-semibold mb-1">
            {t('chart.yourHand')} <span className="text-gold">{selected.hand}</span>
            {' '}{t('chart.vsDealer')} <span className="text-gold">{selected.dealer}</span>
          </p>
          <p
            className="text-sm font-bold mb-1"
            style={{ color: ACTION_TEXT_COLORS[selected.action] }}
          >
            {selected.action} &mdash; {t(ACTION_LABEL_KEY[selected.action])}
          </p>
          <p className="text-content/50 text-xs">
            {getActionExplanation(selected.action)}
          </p>
          {showDeviations && selectedDev && (
            <div className="mt-3 pt-3 border-t border-contrast/15">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-bright">
                <span
                  className="grid place-items-center rounded-full text-black font-extrabold"
                  style={{ minWidth: '16px', height: '16px', fontSize: '9px', backgroundColor: '#f0cd82' }}
                >
                  {selectedDev.index}
                </span>
                {t('chart.countDeviation')}
              </p>
              <p className="text-content/70 text-xs mt-1">
                <Trans
                  i18nKey="chart.deviationRule"
                  values={{ tc: formatTC(selectedDev.threshold), action: selectedDev.above }}
                  components={{ b: <b className="text-content" /> }}
                />
                <span className="text-content/40"> {t('chart.belowThat', { action: selectedDev.below })}</span>
              </p>
            </div>
          )}
          <button
            onClick={() => setSelected(null)}
            className="mt-2 text-xs text-content/40 hover:text-content/70 cursor-pointer transition-colors"
          >
            {t('common.dismiss')}
          </button>
        </div>
      )}
    </div>
  )
}
