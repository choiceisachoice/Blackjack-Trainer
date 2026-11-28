import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { Translate } from '../../i18n/translate'
import { Lock } from 'lucide-react'
import { S17_STRATEGY, H17_STRATEGY } from '../../engine/strategy/basic-strategy-tables'
import type { StrategyAction, StrategyTable } from '../../engine/strategy/types'
import {
  ACTION_COLORS,
  ACTION_INK,
  DEALER_KEYS,
  DEVIATION_CELLS,
  actionLabelKey,
  formatTC,
  resolveAction,
  type ChartAction,
} from './chart-primitives'
import { useAppStore } from '../../store/app-store'
import { useIsPro } from '../../store/entitlement-store'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'

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

/**
 * What each action means, for the detail panel — as translation keys.
 *
 * These were five English sentences returned from a `switch`, which is one
 * more shape the JSX lint rule cannot see. The action's name is not repeated
 * in them: the line above already prints it.
 */
const ACTION_EXPLAIN_KEY: Record<ChartAction, string> = {
  H: 'chart.explain.H',
  S: 'chart.explain.S',
  D: 'chart.explain.D',
  SP: 'chart.explain.SP',
  SU: 'chart.explain.SU',
}

/**
 * The chart's columns. Under `sm` the whole chart fits a 390px phone: a 40px
 * hand column and ten columns sharing the rest (about 31px each), so every
 * dealer card from 2 to A is on screen at once. It used to keep 616px and
 * scroll each section sideways, with 7 to A behind a fade. From `sm` up it is
 * the chart it was.
 */
const CHART_COLUMNS = 'grid-cols-[40px_repeat(10,minmax(0,1fr))] sm:grid-cols-[72px_repeat(10,minmax(0,1fr))]'

/**
 * The hand column: pinned to the left edge of the scroll box, on the page's
 * own ground so the cells pass under it, and above a hovered cell (z-index 10).
 * The negative margin and the padding cover the scroll box's 8px of padding,
 * where a cell would otherwise show beside the label; the 1px ring of the
 * same colour closes the gap between two rows, through which the deviation
 * badges of the cells underneath showed as dashes.
 */
const STICKY_HAND = 'sticky left-0 z-20 -ml-2 pl-2 bg-casino-bg shadow-[0_0_0_1px_var(--color-casino-bg)] text-[0.6875rem] sm:text-xs font-semibold flex items-center justify-center p-0.5 sm:p-1 whitespace-nowrap'

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
 *
 * @param heading - The element for the title. `h2` inside the app, where the
 *   screen is one of many; `h1` on the public page, where the chart is the
 *   page and a search engine reads the first heading as its subject.
 */
export function StrategyChart({ heading: Heading = 'h2' }: { heading?: 'h1' | 'h2' } = {}) {
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

  // Whether the chart continues past the right edge of its scroll box. On a
  // phone it is 616px in 374, and nothing said so: the last four dealer
  // columns were simply not there. While this is true the edge fades out.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [moreRight, setMoreRight] = useState(false)
  useEffect(() => {
    const box = scrollRef.current
    if (!box) return
    const update = () => setMoreRight(box.scrollLeft + box.clientWidth < box.scrollWidth - 1)
    update()
    box.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(box)
    return () => {
      box.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [])

  return (
    <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-5">
        <Heading className="text-2xl md:text-3xl font-extrabold text-gold-gradient">{t('chart.title')}</Heading>
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
            <span className="grid place-items-center rounded-full text-on-gold font-extrabold leading-none" style={{ width: '16px', height: '16px', fontSize: '10px', backgroundColor: 'var(--color-gold-bright)' }}>#</span>
            {t('chart.countDeviation')}
          </span>
        )}
      </div>

      <p className="text-center text-content/40 text-xs mb-4">
        {t('chart.rulesLine', { rules: ruleLabel })}
      </p>

      {/* Scrollable chart area. The padding is room for what hangs over a
          cell's edge — the deviation badge sits 4px outside its top right
          corner, and a scroll box cuts at its padding edge, so in the last
          column (11 v A, 10 v A) half of each badge was gone. */}
      <div className="relative -mx-2">
      <div
        ref={scrollRef}
        data-testid="chart-scroll"
        className="overflow-x-auto overflow-y-hidden"
      >
        {/* The padding is on the content, not on the scroll box: a sticky
            column pins to the box's padding edge, and with the padding out
            there the cells showed through an 8px strip to its left. */}
        <div className="p-2 sm:min-w-[616px]">
          {sections.map(section => (
            <div key={section.title} className="mb-5">
              {/* The title and the hand column stay put while the dealer
                  columns scroll under them: scrolled to the right, a row of
                  colours without its hand is not a chart. */}
              <h3 className="sticky left-0 w-max text-sm font-semibold text-gold mb-2">{section.title}</h3>

              {/* Header row */}
              <div className={`grid gap-px mb-px ${CHART_COLUMNS}`}>
                <div className={`${STICKY_HAND} text-content/50`}>
                  {t('chart.handHeader')}
                </div>
                {DEALER_KEYS.map(dk => (
                  <div
                    key={dk}
                    className="text-[0.6875rem] sm:text-xs font-semibold text-content/80 sm:text-content/70 flex items-center justify-center p-1 bg-contrast/10 rounded"
                  >
                    {dk}
                  </div>
                ))}
              </div>

              {/* Data rows */}
              {section.rows.map(row => (
                <div key={row.label} className={`grid gap-px mb-px ${CHART_COLUMNS}`}>
                  <div className={`${STICKY_HAND} text-content/70`} data-testid="chart-hand">
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
                        className="relative flex items-center justify-center rounded text-[0.6875rem] sm:text-xs font-bold cursor-pointer transition-all duration-100
                          min-h-8 sm:min-h-0 py-1 sm:py-1.5 px-0 sm:px-0.5 [@media(pointer:coarse)]:min-h-8"
                        style={{
                          backgroundColor: ACTION_COLORS[action],
                          color: ACTION_INK,
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
                            className="absolute -top-1 -right-1 grid place-items-center rounded-full font-extrabold text-black leading-none
                              min-w-[13px] h-[13px] text-[8px] sm:min-w-4 sm:h-4 sm:text-[10px] px-px sm:px-0.5"
                            style={{ backgroundColor: '#f0cd82', boxShadow: '0 0 6px rgba(240,205,130,0.7)' }}
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
        {moreRight && (
          <div
            aria-hidden
            data-testid="chart-more-right"
            className="pointer-events-none absolute inset-y-0 right-0 w-10 z-30"
            style={{ background: 'linear-gradient(to left, var(--color-casino-bg), transparent)' }}
          />
        )}
      </div>

      {/* Detail Panel */}
      {selected && (
        <div
          // The explanation of a cell is under three tables. Clicking a cell
          // near the top changed nothing in sight — the panel appeared 800px
          // further down. It is brought into view when it changes.
          key={`${selected.hand}-${selected.dealer}`}
          ref={el => { el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }) }}
          data-testid="chart-detail"
          className="mt-4 p-4 rounded-xl bg-contrast/10 border border-contrast/20 text-center scroll-mb-6">
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
            {t(ACTION_EXPLAIN_KEY[selected.action])}
          </p>
          {showDeviations && selectedDev && (
            <div className="mt-3 pt-3 border-t border-contrast/15">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-bright">
                <span
                  className="grid place-items-center rounded-full text-black font-extrabold"
                  style={{ minWidth: '16px', height: '16px', fontSize: '10px', backgroundColor: '#f0cd82' }}
                >
                  {selectedDev.index}
                </span>
                {t('chart.countDeviation')}
              </p>
              <p className="text-content/70 text-xs mt-1">
                {/* The cell says Surrender and the index says Stand or Hit:
                    both are right, for different tables. 16 v 10, 15 v 10 and
                    16 v 9 are no-surrender indices — they replace the *hit*
                    a player falls back on where surrender is not offered. */}
                {selected.action === 'SU' && (
                  <span className="text-content/50">{t('chart.withoutSurrender')} </span>
                )}
                <Trans
                  i18nKey="chart.deviationRule"
                  values={{ tc: formatTC(selectedDev.threshold), action: t(actionLabelKey(selectedDev.above)) }}
                  components={{ b: <b className="text-content" /> }}
                />
                <span className="text-content/40"> {t('chart.belowThat', { action: t(actionLabelKey(selectedDev.below)) })}</span>
              </p>
            </div>
          )}
          <button
            onClick={() => setSelected(null)}
            className="mt-1 inline-flex items-center justify-center min-h-10 px-4 text-xs text-content/40 hover:text-content/70 cursor-pointer transition-colors"
          >
            {t('common.dismiss')}
          </button>
        </div>
      )}
    </div>
  )
}
