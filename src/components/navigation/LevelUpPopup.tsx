import { useEffect } from 'react'
import { useLevelStore } from '../../store/level-store'

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
  const showLevelUp = useLevelStore(s => s.showLevelUp)
  const levelUpData = useLevelStore(s => s.levelUpData)
  const dismissLevelUp = useLevelStore(s => s.dismissLevelUp)

  // Dismiss on Escape / Enter for keyboard accessibility
  useEffect(() => {
    if (!showLevelUp) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') dismissLevelUp()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showLevelUp, dismissLevelUp])

  if (!showLevelUp || !levelUpData) return null

  const { oldLevel, newLevel } = levelUpData

  return (
    <div
      data-testid="level-up-popup"
      role="dialog"
      aria-modal="true"
      aria-label={`Level up to level ${newLevel.level}, ${newLevel.title}`}
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        animation: 'levelFadeIn 0.3s ease',
      }}
    >
      <div
        className="text-center max-w-[500px] mx-4"
        style={{
          padding: '48px',
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
          LEVEL UP
        </div>

        {/* Old level */}
        <div
          className="text-sm mb-2"
          style={{ color: oldLevel.color, opacity: 0.6 }}
        >
          Lv.{oldLevel.level} {oldLevel.title}
        </div>

        <div className="text-2xl text-content/30 mb-2">
          &#8595;
        </div>

        {/* New level number */}
        <div
          className="font-extrabold mb-2"
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            color: newLevel.color,
            textShadow: `0 0 30px ${newLevel.glowColor}, 0 0 60px ${newLevel.glowColor}`,
          }}
        >
          Lv.{newLevel.level}
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
          {newLevel.title}
        </div>

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
            onClick={dismissLevelUp}
            data-testid="level-up-dismiss"
            className="px-8 py-3 rounded-lg text-base font-semibold cursor-pointer transition-all duration-200 hover:brightness-125"
            style={{
              border: `1px solid ${newLevel.color}`,
              backgroundColor: `${newLevel.color}20`,
              color: newLevel.color,
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
