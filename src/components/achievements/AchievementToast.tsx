import { useEffect, useRef, useState } from 'react'
import { useAchievementStore } from '../../store/achievement-store'
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
 * Positioned at bottom center, slides up with fade-in.
 * Auto-dismisses after 4 seconds. Queues multiple achievements.
 * Plays streak sound on each achievement.
 */
export function AchievementToast() {
  const newlyUnlocked = useAchievementStore(s => s.newlyUnlocked)
  const dismissNewAchievement = useAchievementStore(s => s.dismissNewAchievement)
  const [visible, setVisible] = useState(false)
  /** The post-exit-animation dismissal timer, tracked so it can be cancelled. */
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const current = newlyUnlocked[0] ?? null

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
        fixed bottom-6 left-1/2 -translate-x-1/2 z-50
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
        <p className="text-xs font-semibold text-[#FFD700] uppercase tracking-wider">
          Achievement Unlocked!
        </p>
        <p className="text-base font-bold text-content truncate">{current.name}</p>
        <p className="text-xs text-content/60 truncate">{current.description}</p>
      </div>

      {/* Tier badge */}
      <span className="text-2xl shrink-0">{tier.badge}</span>
    </div>
  )
}
