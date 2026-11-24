import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Zap } from 'lucide-react'
import { useLevelStore, awardLines } from '../../store/level-store'

/** How long the toast stays before it clears itself. */
const DISMISS_DELAY = 2800
/** A list is more to read than a line. */
const DISMISS_DELAY_LIST = 4200

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
 *
 * ## One line, or the total and what it is made of
 *
 * A payout from one source is one line, as it always was. When several land
 * together — the answers, the accuracy on top, a finished stage, a kept week —
 * the toast shows the total and lists the parts beneath it: three lines at
 * most (`awardLines` folds the rest into one), and they add up to the total.
 * It is still the same small toast in the same corner and it still leaves on
 * its own; it only stays a little longer when there is a list to read.
 */
export function XpToast() {
  const { t } = useTranslation()
  const award = useLevelStore(s => s.lastAward)
  const levelUpOpen = useLevelStore(s => s.showLevelUp)
  const dismiss = useLevelStore(s => s.dismissXpAward)
  const id = award?.id
  // One line when one line says everything; otherwise the total and its parts.
  const single = !award || award.labelKey != null

  useEffect(() => {
    if (id == null || levelUpOpen) return
    const timer = setTimeout(dismiss, single ? DISMISS_DELAY : DISMISS_DELAY_LIST)
    return () => clearTimeout(timer)
  }, [id, levelUpOpen, dismiss, single])

  if (!award || levelUpOpen) return null

  // `drop-in`, not `rise-in`: the layer hangs from the top of the screen now
  // (`ToastLayer`), so the toast arrives from above.
  const shell = `drop-in pointer-events-none
    flex gap-2.5 pl-3 pr-4 py-2.5 rounded-xl
    border border-gold/35 bg-surface/95 backdrop-blur-sm
    shadow-[0_14px_40px_-16px_var(--color-gold)]`
  const icon = (
    <span className="grid place-items-center w-7 h-7 rounded-lg bg-gold/12 text-gold shrink-0">
      <Zap size={15} />
    </span>
  )

  if (award.labelKey == null) {
    return (
      <div
        key={award.id}
        role="status"
        aria-live="polite"
        data-testid="xp-toast"
        className={`${shell} items-start`}
      >
        {icon}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gold tabular-nums leading-7" data-testid="xp-toast-total">
            +{award.amount}&nbsp;XP
          </div>
          <ul className="flex flex-col gap-0.5 pb-0.5">
            {awardLines(award).map((line, i) => (
              <li
                key={i}
                data-testid="xp-toast-line"
                className="flex items-baseline justify-between gap-5 text-xs text-content/55"
              >
                <span className="truncate min-w-0">{t(line.labelKey, line.labelParams)}</span>
                {line.amount != null && (
                  <span className="tabular-nums text-content/75 shrink-0">+{line.amount}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div
      key={award.id}
      role="status"
      aria-live="polite"
      data-testid="xp-toast"
      className={`${shell} items-center`}
    >
      {icon}
      {/* A session past the day's limit pays nothing and still says why:
          "+0 XP" would read as a fault. */}
      {award.amount > 0 && (
        <span className="text-sm font-bold text-gold tabular-nums whitespace-nowrap">
          +{award.amount}&nbsp;XP
        </span>
      )}
      <span className="text-sm text-content/55 min-w-0">
        {t(award.labelKey, award.labelParams)}
      </span>
    </div>
  )
}
