import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Timer, Users, Wallet, Scale, GraduationCap, Volume2, Play, type LucideIcon } from 'lucide-react'
import type { CasinoSessionConfig } from '../../engine/casino-session/types'
import { TrainingBackdrop } from '../training/TrainingBackdrop'
import { Field, Segmented, Toggle, Input } from '../common/ui'

interface CasinoSessionConfigProps {
  initialConfig: CasinoSessionConfig
  onStart: (config: CasinoSessionConfig) => void
}

/*
 * Two local primitives, and only two.
 *
 * `Field`, `Segmented` and `Toggle` used to be defined here as well — `Toggle`
 * character for character identical to the one in `common/ui.tsx`, `Field` the
 * same, `Segmented` the same minus its `fluid` option, which nothing on this
 * screen passes. Fifty lines of a second copy that could drift from the first
 * without anything failing. They now come from the shared module.
 *
 * `Panel` stays, and it is **not** the duplicate it looks like: this one draws a
 * 32px icon tile with `rounded-lg`, the shared one draws a 40px `rounded-xl`
 * tile through `IconTile`. Swapping it would change how this screen looks, which
 * is a design decision and not a cleanup. `NumberField` has no shared
 * equivalent at all.
 */

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

/** Styled numeric input. */
function NumberField({ value, min, max, step = 1, onChange, prefix, label }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; prefix?: string; label: string
}) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-content/40">{prefix}</span>}
      <Input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
        className={`w-28 py-1.5 text-right ${prefix ? 'pl-7 pr-3' : 'px-3'}`}
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
  const basicPlay = config.playStyle === 'basic'

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
            {/*
              The first question on the table is whether the player is counting
              at all. "Just Blackjack" is the same table without the count: no
              RC/TC prompts, no deviations, bets not graded — basic strategy
              only, still with feedback, still with a grade and XP. Choosing it
              also turns the count-dependent options off underneath, so a stale
              'every5' cannot survive in a config that no longer asks.
            */}
            <Field label={t('casino.setup.playStyle')}>
              <Segmented
                ariaLabel={t('casino.setup.playStyle')}
                value={config.playStyle ?? 'counting'}
                onChange={v => setConfig(c => ({
                  ...c,
                  playStyle: v,
                  ...(v === 'basic' ? { countCheckFrequency: 'never' as const, showDeviationHints: false } : {}),
                }))}
                options={[
                  { label: t('casino.setup.styleCounting'), value: 'counting' as const },
                  { label: t('casino.setup.styleBasic'), value: 'basic' as const },
                ]}
              />
            </Field>
            {basicPlay && (
              <p className="text-xs text-content/50 leading-relaxed" data-testid="basic-play-hint">
                {t('casino.setup.styleBasicHint')}
              </p>
            )}
            {!basicPlay && (
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
            )}
            <div className="pt-1 space-y-3">
              <Toggle label={t('casino.setup.showFeedback')} checked={config.trainingMode} onChange={v => update('trainingMode', v)} />
              {!basicPlay && (
                <Toggle label={t('casino.setup.showHints')} checked={config.showDeviationHints} onChange={v => update('showDeviationHints', v)} />
              )}
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
