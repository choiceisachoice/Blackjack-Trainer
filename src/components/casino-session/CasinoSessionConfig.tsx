import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Timer, Users, Wallet, Scale, GraduationCap, Volume2, Play, type LucideIcon } from 'lucide-react'
import type { CasinoSessionConfig } from '../../engine/casino-session/types'
import { TrainingBackdrop } from '../training/TrainingBackdrop'

interface CasinoSessionConfigProps {
  initialConfig: CasinoSessionConfig
  onStart: (config: CasinoSessionConfig) => void
}

/* ── Small local primitives (dark-luxury form controls) ── */

/** Collapsible-free titled panel with an icon. */
function Panel({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="grid place-items-center w-8 h-8 rounded-lg text-gold bg-gold/10 border border-gold/20">
          <Icon size={16} />
        </span>
        <h3 className="text-sm font-semibold tracking-wide text-content">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

/** A row: label on the left, control on the right. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-content/60">{label}</span>
      {children}
    </div>
  )
}

interface SegOption<T> { label: string; value: T }
/** Segmented control — replaces native selects / radios for small option sets. */
function Segmented<T extends string | number>({ options, value, onChange, ariaLabel }: {
  options: SegOption<T>[]; value: T; onChange: (v: T) => void; ariaLabel: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex p-0.5 rounded-lg bg-contrast/5 border border-contrast/10">
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer
              ${active ? 'bg-gold text-on-gold shadow-[0_2px_10px_-4px_var(--color-gold)]' : 'text-content/60 hover:text-content'}`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/** iOS-style toggle switch — replaces native checkboxes. */
function Toggle({ checked, onChange, label, testId }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="text-sm text-content/80">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer shrink-0
          ${checked ? 'bg-gold' : 'bg-contrast/15'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
          ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </label>
  )
}

/** Styled numeric input. */
function NumberField({ value, min, max, step = 1, onChange, prefix, label }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; prefix?: string; label: string
}) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-content/40">{prefix}</span>}
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
        className={`w-28 bg-surface-2 border border-contrast/15 rounded-lg py-1.5 text-sm text-content text-right
          hover:border-gold/40 focus:border-gold/60 transition-colors ${prefix ? 'pl-7 pr-3' : 'px-3'}`}
      />
    </div>
  )
}

/**
 * Casino Session setup — dark-luxury redesign.
 * Uses segmented controls, toggle switches and styled fields instead of raw
 * native inputs. Card counting is Hi-Lo only, so no system picker is shown.
 */
export function CasinoSessionConfigView({ initialConfig, onStart }: CasinoSessionConfigProps) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<CasinoSessionConfig>(initialConfig)

  const update = <K extends keyof CasinoSessionConfig>(key: K, val: CasinoSessionConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: val }))

  return (
    <div className="flex-1 overflow-y-auto">
      {/* inner wrapper grows to the full settings height so the backdrop spans
          all of it — suit watermark reaches the real bottom, rails centre on
          the whole form rather than just the visible fold */}
      <div className="relative isolate min-h-full px-4 py-8">
      <TrainingBackdrop mode="casinoSession" showRails showGlow={false} railBreakpoint="2xl" />
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gold-gradient">{t('casino.setup.title')}</h2>
          <p className="mt-2 text-sm text-content/50">{t('casino.setup.sub')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Session length */}
          <Panel icon={Timer} title={t('casino.setup.sessionLength')}>
            <Field label={t('casino.setup.measureBy')}>
              <Segmented
                ariaLabel={t('casino.setup.sessionLength')}
                value={config.sessionMode}
                onChange={v => update('sessionMode', v)}
                options={[{ label: t('casino.setup.hands'), value: 'hands' }, { label: t('casino.setup.time'), value: 'time' }]}
              />
            </Field>
            {config.sessionMode === 'hands' ? (
              <Field label={t('casino.setup.numberOfHands')}>
                <NumberField label={t('casino.setup.numberOfHands')} value={config.targetHands} min={5} max={200} onChange={v => update('targetHands', v)} />
              </Field>
            ) : (
              <Field label={t('casino.setup.minutes')}>
                <NumberField label={t('casino.setup.minutes')} value={config.targetMinutes} min={1} max={120} onChange={v => update('targetMinutes', v)} />
              </Field>
            )}
          </Panel>

          {/* Table setup */}
          <Panel icon={Users} title={t('casino.setup.tableSetup')}>
            <Field label={t('casino.setup.bots')}>
              <Segmented
                ariaLabel={t('casino.setup.bots')}
                value={config.numBots}
                onChange={v => update('numBots', v)}
                options={[0, 1, 2, 3, 4, 5].map(n => ({ label: String(n), value: n }))}
              />
            </Field>
            <Field label={t('casino.setup.yourSeat')}>
              <Segmented
                ariaLabel={t('casino.setup.yourSeat')}
                value={config.playerSeatIndex}
                onChange={v => update('playerSeatIndex', v)}
                options={[0, 1, 2, 3, 4, 5].map(n => ({ label: String(n + 1), value: n }))}
              />
            </Field>
          </Panel>

          {/* Bankroll & betting */}
          <Panel icon={Wallet} title={t('casino.setup.bankrollBetting')}>
            <Field label={t('casino.setup.startingBankroll')}>
              <NumberField label={t('casino.setup.startingBankroll')} value={config.startingBankroll} min={100} max={100000} step={100} prefix="$" onChange={v => update('startingBankroll', v)} />
            </Field>
            <Field label={t('casino.setup.minBet')}>
              <NumberField label={t('casino.setup.minBet')} value={config.minBet} min={5} max={500} step={5} prefix="$" onChange={v => update('minBet', v)} />
            </Field>
            <Field label={t('casino.setup.maxBet')}>
              <NumberField label={t('casino.setup.maxBet')} value={config.maxBet} min={50} max={10000} step={50} prefix="$" onChange={v => update('maxBet', v)} />
            </Field>
          </Panel>

          {/* Rules */}
          <Panel icon={Scale} title={t('casino.setup.casinoRules')}>
            <Field label={t('casino.setup.decks')}>
              <Segmented
                ariaLabel={t('casino.setup.decks')}
                value={config.numDecks}
                onChange={v => update('numDecks', v)}
                options={[2, 6, 8].map(n => ({ label: String(n), value: n }))}
              />
            </Field>
            <Field label={t('casino.setup.penetration')}>
              <Segmented
                ariaLabel={t('casino.setup.penetration')}
                value={config.penetration}
                onChange={v => update('penetration', v)}
                options={[0.65, 0.70, 0.75, 0.80, 0.85].map(p => ({ label: `${Math.round(p * 100)}%`, value: p }))}
              />
            </Field>
            <Field label={t('casino.setup.blackjackPays')}>
              <Segmented
                ariaLabel={t('casino.setup.blackjackPays')}
                value={config.blackjackPays}
                onChange={v => update('blackjackPays', v)}
                options={[{ label: '3:2', value: 1.5 }, { label: '6:5', value: 1.2 }]}
              />
            </Field>
            <div className="pt-1 space-y-3">
              <Toggle label={t('casino.setup.h17')} checked={config.dealerHitsSoft17} onChange={v => update('dealerHitsSoft17', v)} />
              <Toggle label={t('casino.setup.das')} checked={config.doubleAfterSplit} onChange={v => update('doubleAfterSplit', v)} />
              <Toggle label={t('casino.setup.lateSurrender')} checked={config.surrenderAllowed} onChange={v => update('surrenderAllowed', v)} />
            </div>
          </Panel>

          {/* Training options */}
          <Panel icon={GraduationCap} title={t('casino.setup.trainingOptions')}>
            <Field label={t('casino.setup.countCheck')}>
              <Segmented
                ariaLabel={t('casino.setup.countCheck')}
                value={config.countCheckFrequency}
                onChange={v => update('countCheckFrequency', v)}
                options={[
                  { label: t('casino.setup.every'), value: 'every' },
                  { label: '5', value: 'every5' },
                  { label: '10', value: 'every10' },
                  { label: t('casino.setup.off'), value: 'never' },
                ]}
              />
            </Field>
            <div className="pt-1 space-y-3">
              <Toggle label={t('casino.setup.showFeedback')} checked={config.trainingMode} onChange={v => update('trainingMode', v)} />
              <Toggle label={t('casino.setup.showHints')} checked={config.showDeviationHints} onChange={v => update('showDeviationHints', v)} />
            </div>
          </Panel>

          {/* Sound */}
          <Panel icon={Volume2} title={t('casino.setup.sound')}>
            <Toggle label={t('casino.setup.ambience')} checked={config.casinoAmbience} onChange={v => update('casinoAmbience', v)} testId="toggle-ambience" />
          </Panel>
        </div>

        {/* Start */}
        <button
          onClick={() => onStart(config)}
          data-testid="start-session"
          className="lift-glow mt-8 w-full py-3.5 rounded-xl font-semibold text-black
            bg-gradient-to-b from-gold-bright to-gold border border-gold/50 cursor-pointer
            flex items-center justify-center gap-2 shadow-[0_10px_30px_-12px_var(--color-gold)]"
        >
          <Play size={18} className="fill-current" />
          {t('casino.setup.start')}
        </button>
      </div>
      </div>
    </div>
  )
}
