import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useLevelStore } from '../../store/level-store'
import { hasSeenLevelIntro, markLevelIntroSeen } from '../../services/level-intro'

const TIER_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  mid: 'Intermediate',
  advanced: 'Advanced',
  elite: 'Elite',
}

const TIER_ICONS: Record<string, string> = {
  beginner: '\uD83C\uDCCF',
  mid: '\u2660\uFE0F',
  advanced: '\uD83D\uDCB0',
  elite: '\uD83C\uDCCF',
}

/**
 * Full-screen level-up celebration popup.
 *
 * Shows old level → new level transition with glow effects and tier badge.
 * Auto-displayed when a level-up occurs, dismissed via Continue button.
 */
export function LevelUpPopup() {
  const { t } = useTranslation()
  const showLevelUp = useLevelStore(s => s.showLevelUp)
  const levelUpData = useLevelStore(s => s.levelUpData)
  const dismissLevelUp = useLevelStore(s => s.dismissLevelUp)

  // Whether to show the one-time explainer. Read once via a lazy initialiser so
  // it stays stable for the life of this popup even after we mark it seen, and
  // declared BEFORE any conditional return so hook order is fixed (a hook after
  // an early `return null` caused "rendered fewer hooks than expected").
  //
  // Not a ref: writing a ref during render is a React rule violation that
  // breaks under concurrent rendering. `useState`'s initialiser is the
  // sanctioned way to compute a value exactly once.
  const [showIntro] = useState(() => !hasSeenLevelIntro())

  // Dismiss on Escape / Enter for keyboard accessibility
  useEffect(() => {
    if (!showLevelUp) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') { markLevelIntroSeen(); dismissLevelUp() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showLevelUp, dismissLevelUp])

  if (!showLevelUp || !levelUpData) return null

  const { oldLevel, newLevel, breakdown } = levelUpData
  const totalXP = breakdown.reduce((sum, b) => sum + b.amount, 0)

  const dismiss = () => { markLevelIntroSeen(); dismissLevelUp() }

  // Overlay pattern copied from UpgradeModalHost, which gets this right in the
  // same app: `grid place-items-center p-4 overflow-y-auto` + `my-auto` so a
  // tall card on a short (landscape phone) window scrolls to reach the button
  // instead of trapping it off-screen, and a backdrop click dismisses. The old
  // version was `flex items-center` with 48px padding and no scroll — on a
  // small viewport "Continue" was unreachable and the modal locked the app.
  return (
    <div
      data-testid="level-up-popup"
      role="dialog"
      aria-modal="true"
      aria-label={t('levels.upTo', { n: newLevel.level, name: t(newLevel.titleKey) })}
      className="fixed inset-0 z-[9999] grid place-items-center p-4 overflow-y-auto"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)', animation: 'levelFadeIn 0.3s ease' }}
      onClick={dismiss}
    >
      <div
        className="text-center w-full max-w-[440px] my-auto p-8 sm:p-10"
        onClick={e => e.stopPropagation()}
        style={{
          borderRadius: '24px',
          backgroundColor: 'var(--color-surface-2)',
          border: `2px solid ${newLevel.color}`,
          boxShadow: `0 0 60px ${newLevel.glowColor}, 0 0 120px ${newLevel.glowColor}`,
          animation: 'levelScaleIn 0.5s ease',
        }}
      >
        {/* LEVEL UP text */}
        <div
          className="text-base tracking-[6px] uppercase mb-4 text-gold"
        >
          {t('levels.levelUp')}
        </div>

        {/* Old level */}
        <div
          className="text-sm mb-2"
          style={{ color: oldLevel.color, opacity: 0.6 }}
        >
          {t('levels.short', { n: oldLevel.level })} {t(oldLevel.titleKey)}
        </div>

        <div className="text-2xl text-content/30 mb-2" aria-hidden>
          &#8595;
        </div>

        {/* A multi-level jump is otherwise invisible — the old and new numbers
            just differ by more than one with no explanation. */}
        {newLevel.level - oldLevel.level > 1 && (
          <div className="text-xs text-content/45 mb-2" data-testid="level-up-jump">
            {t('levels.jumped', { n: newLevel.level - oldLevel.level })}
          </div>
        )}

        {/* New level number */}
        <div
          className="font-extrabold mb-2"
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            color: newLevel.color,
            textShadow: `0 0 30px ${newLevel.glowColor}, 0 0 60px ${newLevel.glowColor}`,
          }}
        >
          {t('levels.abbr', { n: newLevel.level })}
        </div>

        {/* New title */}
        <div
          className="font-bold mb-6"
          style={{
            fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
            color: newLevel.color,
            textShadow: `0 0 20px ${newLevel.glowColor}`,
          }}
        >
          {t(newLevel.titleKey)}
        </div>

        {/*
          What this actually is, in plain words.

          The popup used to show only numbers and titles — "Lv.1 Rookie →
          Lv.3 Card Player, BEGINNER" — which means nothing to someone seeing
          it for the first time. It is also deliberately honest about the
          limit: levels in this app unlock NOTHING (that is what Pro does).
          Implying a reward that does not exist would be worse than silence.
        */}
        {/* Where the XP came from. A jump with no explanation is a mystery;
            "Speed drill +75, Daily challenge +100" is something a beginner can
            actually connect to what they just did. */}
        {breakdown.length > 0 && (
          <div
            className="mx-auto max-w-[300px] mb-7 rounded-xl border border-contrast/10 bg-black/20 divide-y divide-contrast/8"
            data-testid="level-up-breakdown"
          >
            {breakdown.map((b, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                <span className="text-content/60 text-left">{b.label}</span>
                <span className="tabular-nums font-semibold text-gold">+{b.amount}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
              <span className="text-content/45 uppercase tracking-wider text-[0.7rem] font-bold">{t('levels.total')}</span>
              <span className="tabular-nums font-bold text-content">+{totalXP} XP</span>
            </div>
          </div>
        )}

        {showIntro && (
          <p
            className="text-sm text-content/55 leading-relaxed mb-7 mx-auto max-w-[38ch] text-left"
            data-testid="level-up-explainer"
          >
            <Trans i18nKey="levels.whatIsThis" components={{ b: <b className="text-content/80" /> }} />
          </p>
        )}

        {/* Tier badge */}
        <div
          className="inline-block px-4 py-1 rounded-xl text-xs font-semibold tracking-[2px] uppercase mb-8"
          style={{
            backgroundColor: `${newLevel.color}20`,
            color: newLevel.color,
          }}
        >
          {TIER_ICONS[newLevel.tier] || ''} {TIER_LABELS[newLevel.tier] || newLevel.tier}
        </div>

        {/* Continue button */}
        <div>
          <button
            onClick={dismiss}
            data-testid="level-up-dismiss"
            className="px-8 py-3 rounded-lg text-base font-semibold cursor-pointer transition-all duration-200 hover:brightness-125"
            style={{
              border: `1px solid ${newLevel.color}`,
              backgroundColor: `${newLevel.color}20`,
              color: newLevel.color,
            }}
          >
            {t('common.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
