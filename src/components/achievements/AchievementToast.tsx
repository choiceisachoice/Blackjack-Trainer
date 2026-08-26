import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { achievementName, achievementDescription } from '../../services/achievements/achievement-list'
import { useAchievementStore } from '../../store/achievement-store'
import { useLevelStore } from '../../store/level-store'
import { soundEngine } from '../../services/sound-engine'
import type { AchievementTier } from '../../services/achievements/achievement-types'

/** Auto-dismiss delay in milliseconds. */
const DISMISS_DELAY = 4000

/** Tier badge emoji and border color. */
const TIER_CONFIG: Record<AchievementTier, { badge: string; borderColor: string; bgGlow: string }> = {
  bronze:  { badge: '\uD83E\uDD49', borderColor: 'border-[#CD7F32]', bgGlow: 'shadow-[#CD7F32]/20' },
  silver:  { badge: '\uD83E\uDD48', borderColor: 'border-[#C0C0C0]', bgGlow: 'shadow-[#C0C0C0]/20' },
  gold:    { badge: '\uD83E\uDD47', borderColor: 'border-[#FFD700]', bgGlow: 'shadow-[#FFD700]/20' },
  diamond: { badge: '\uD83D\uDC8E', borderColor: 'border-[#B9F2FF]', bgGlow: 'shadow-[#B9F2FF]/20' },
}

/**
 * Global toast notification for newly unlocked achievements.
 *
 * Slides up with a fade, auto-dismisses after four seconds, queues multiples,
 * and plays the streak sound on each. Positioning belongs to the shared toast
 * layer in `TrainerApp` — this used to place itself on exactly the same
 * coordinates as `XpToast`, and the two fire on the same event.
 *
 * ## Why it waits for the level-up popup
 *
 * That popup covers the screen at `z-[9999]`, and the three announcements
 * arrive together: a session ends, pays XP, unlocks an award, and sometimes
 * takes the player up a level. The toast used to run its whole four seconds
 * behind the overlay and be gone by the time it was closed — an unlocked
 * achievement announced to nobody, and the queue drained with it.
 *
 * `XpToast` already held back for the same reason. Now both do, so the popup
 * owns that moment and the toasts get theirs afterwards.
 */
export function AchievementToast() {
  const { t } = useTranslation()
  const newlyUnlocked = useAchievementStore(s => s.newlyUnlocked)
  const dismissNewAchievement = useAchievementStore(s => s.dismissNewAchievement)
  const levelUpOpen = useLevelStore(s => s.showLevelUp)
  const [visible, setVisible] = useState(false)
  /** The post-exit-animation dismissal timer, tracked so it can be cancelled. */
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Nothing is current while the popup has the screen, so the timers below
  // never start and the queue is still intact when it closes.
  const current = levelUpOpen ? null : (newlyUnlocked[0] ?? null)

  // Animate in when a new achievement appears
  useEffect(() => {
    if (!current) {
      // Reset so the next queued toast slides in fresh. Harmless: the component
      // early-returns null while there's no current achievement.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(false)
      return
    }

    // Play sound
    soundEngine.streak()

    // Slide in after a brief delay for animation
    const showTimer = setTimeout(() => setVisible(true), 50)

    // Auto-dismiss
    const dismissTimer = setTimeout(() => {
      setVisible(false)
      // Wait for exit animation before removing from queue
      exitTimerRef.current = setTimeout(() => dismissNewAchievement(), 300)
    }, DISMISS_DELAY)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(dismissTimer)
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
  }, [current, dismissNewAchievement])

  if (!current) return null

  const tier = TIER_CONFIG[current.tier]

  return (
    <div
      data-testid="achievement-toast"
      onClick={() => {
        setVisible(false)
        if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
        exitTimerRef.current = setTimeout(() => dismissNewAchievement(), 300)
      }}
      className={`
        pointer-events-auto
        flex items-center gap-4 px-5 py-4 rounded-xl
        bg-casino-bg/95 backdrop-blur-sm border-2 ${tier.borderColor}
        shadow-lg ${tier.bgGlow}
        cursor-pointer select-none
        transition-all duration-300 ease-out
        ${visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4'
        }
      `}
    >
      {/* Icon */}
      <span className="text-4xl shrink-0">{current.icon}</span>

      {/* Text */}
      <div className="flex-1 min-w-0">
        {/* `text-gold`, not a literal #FFD700: the token darkens to #a8801f in
            light mode, which is what keeps this readable on a light card. The
            tier metals above are deliberately literal — bronze is bronze in
            both themes. */}
        <p className="text-xs font-semibold text-gold uppercase tracking-wider">
          {t('awards.unlockedBang')}
        </p>
        <p className="text-base font-bold text-content truncate">{achievementName(current, t)}</p>
        <p className="text-xs text-content/60 truncate">{achievementDescription(current, t)}</p>
      </div>

      {/* Tier badge */}
      <span className="text-2xl shrink-0">{tier.badge}</span>
    </div>
  )
}
