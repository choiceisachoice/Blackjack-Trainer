import { useLevelStore } from '../../store/level-store'
import { useTranslation } from 'react-i18next'

/**
 * Compact level badge displayed on the HomeScreen.
 *
 * Shows: level number, title with tier glow, and a mini XP progress bar.
 */
export function LevelBadge() {
  const { t } = useTranslation()
  const level = useLevelStore(s => s.level)
  const progress = useLevelStore(s => s.progress)
  const totalXP = useLevelStore(s => s.totalXP)

  return (
    <div
      data-testid="level-badge"
      className="flex items-center gap-2 px-3.5 py-1.5 rounded-full"
      style={{
        border: `1px solid ${level.color}40`,
        backgroundColor: `${level.color}10`,
      }}
    >
      {/* Level number */}
      <span
        className="text-sm font-bold"
        style={{ color: level.color }}
      >
        {t('levels.abbr', { n: level.level })}
      </span>

      {/* Title */}
      <span
        className="text-sm"
        style={{
          color: level.color,
          textShadow: `0 0 10px ${level.glowColor}`,
        }}
      >
        {t(level.titleKey)}
      </span>

      {/* Mini progress bar */}
      <div
        className="rounded-full overflow-hidden"
        style={{
          width: '50px',
          height: '4px',
          backgroundColor: 'var(--color-line-strong)',
        }}
      >
        <div
          data-testid="level-progress-bar"
          className="h-full rounded-full"
          style={{
            width: `${progress.percent}%`,
            backgroundColor: level.color,
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      {/* Total XP (subtle) */}
      <span className="text-xs text-content/30">
        {totalXP.toLocaleString()} XP
      </span>
    </div>
  )
}
