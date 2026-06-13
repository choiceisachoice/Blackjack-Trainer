import { useState } from 'react'
import { S17_STRATEGY, H17_STRATEGY } from '../../engine/strategy/basic-strategy-tables'
import type { StrategyAction, StrategyTable } from '../../engine/strategy/types'
import { useAppStore } from '../../store/app-store'

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

/** Human-readable labels for the legend. */
const ACTION_LABELS: Record<ChartAction, string> = {
  H: 'Hit',
  S: 'Stand',
  D: 'Double',
  SP: 'Split',
  SU: 'Surrender',
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
function buildSections(table: StrategyTable): ChartSection[] {
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
    { title: 'I. Hard Totals (12-17+)', rows: hardHighRows },
    { title: 'II. Hard Totals (5-11)', rows: hardLowRows },
    { title: 'III. Soft Hands', rows: softRows },
    { title: 'IV. Pairs', rows: pairRows },
  ]
}

/**
 * Interactive Basic Strategy chart generated from the engine strategy tables.
 * Displays 4 sections with colored cells, hover effects, and click-to-detail.
 * Automatically switches between S17 and H17 based on selected casino rules.
 */
export function StrategyChart() {
  const [selected, setSelected] = useState<CellInfo | null>(null)
  const dealerHitsSoft17 = useAppStore(s => s.selectedRules.dealerHitsSoft17)
  const table = dealerHitsSoft17 ? H17_STRATEGY : S17_STRATEGY
  const sections = buildSections(table)
  const ruleLabel = dealerHitsSoft17 ? 'H17' : 'S17'

  return (
    <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4 justify-center">
        {(Object.keys(ACTION_LABELS) as ChartAction[]).map(action => (
          <span
            key={action}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: ACTION_COLORS[action] }}
          >
            {action} = {ACTION_LABELS[action]}
          </span>
        ))}
      </div>

      <p className="text-center text-content/40 text-xs mb-4">
        {ruleLabel} &middot; 6 Deck &middot; DAS &middot; Late Surrender &middot; Tap any cell for details
      </p>

      {/* Scrollable chart area */}
      <div className="overflow-x-auto pb-2">
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
                  Hand
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
                    return (
                      <button
                        key={dealer}
                        onClick={() => setSelected({ hand: row.label, dealer, action })}
                        className="flex items-center justify-center rounded text-xs font-bold text-white cursor-pointer transition-all duration-100"
                        style={{
                          backgroundColor: ACTION_COLORS[action],
                          padding: '6px 2px',
                          outline: isSelected ? '2px solid white' : 'none',
                          outlineOffset: '-1px',
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
            Your Hand: <span className="text-gold">{selected.hand}</span>
            {' '}vs Dealer: <span className="text-gold">{selected.dealer}</span>
          </p>
          <p
            className="text-sm font-bold mb-1"
            style={{ color: ACTION_COLORS[selected.action] }}
          >
            {selected.action} &mdash; {ACTION_LABELS[selected.action]}
          </p>
          <p className="text-content/50 text-xs">
            {getActionExplanation(selected.action)}
          </p>
          <button
            onClick={() => setSelected(null)}
            className="mt-2 text-xs text-content/40 hover:text-content/70 cursor-pointer transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
