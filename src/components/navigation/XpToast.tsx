import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Zap } from 'lucide-react'
import { useLevelStore } from '../../store/level-store'

/** How long the toast stays before it clears itself. */
const DISMISS_DELAY = 2800

/**
 * Announces an XP payout the moment it lands.
 *
 * ## Why this exists
 *
 * Finishing a session felt like it paid nothing. It always paid — the amount
 * was right and it reached the right account — but silently, and only once the
 * mode unmounted, which is to say during navigation, in a component being torn
 * down. Achievements and challenges announce themselves as they land, so those
 * read as working and training read as broken. Identical mechanism, opposite
 * impression, and the impression is what people act on.
 *
 * Three deliberate choices:
 *
 * It stays quiet while the level-up popup is open. That popup already lists
 * every source of the climb, including this one; a toast sliding in underneath
 * would repeat it and compete for the same moment.
 *
 * The entrance is a CSS animation keyed on `award.id`, not a piece of React
 * state. A new payout remounts the element and replays it, which means two
 * identical 40-XP drills in a row announce twice — keying on the amount would
 * silently swallow the second, and that is the case a regular user hits most.
 *
 * `aria-live="polite"` rather than `assertive`: this is a reward, not a
 * warning, and it must never interrupt a screen reader mid-sentence.
 */
export function XpToast() {
  const { t } = useTranslation()
  const award = useLevelStore(s => s.lastAward)
  const levelUpOpen = useLevelStore(s => s.showLevelUp)
  const dismiss = useLevelStore(s => s.dismissXpAward)
  const id = award?.id

  useEffect(() => {
    if (id == null || levelUpOpen) return
    const timer = setTimeout(dismiss, DISMISS_DELAY)
    return () => clearTimeout(timer)
  }, [id, levelUpOpen, dismiss])

  if (!award || levelUpOpen) return null

  return (
    <div
      key={award.id}
      role="status"
      aria-live="polite"
      data-testid="xp-toast"
      className="rise-in pointer-events-none
        flex items-center gap-2.5 pl-3 pr-4 py-2.5 rounded-xl
        border border-gold/35 bg-surface/95 backdrop-blur-sm
        shadow-[0_14px_40px_-16px_var(--color-gold)]"
    >
      <span className="grid place-items-center w-7 h-7 rounded-lg bg-gold/12 text-gold shrink-0">
        <Zap size={15} />
      </span>
      <span className="text-sm font-bold text-gold tabular-nums">
        +{award.amount}&nbsp;XP
      </span>
      <span className="text-sm text-content/55">
        {t(award.labelKey, award.labelParams)}
      </span>
    </div>
  )
}
