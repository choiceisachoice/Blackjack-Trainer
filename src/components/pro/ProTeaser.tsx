import { Check, Crown } from 'lucide-react'
import { useUpgradePrompt } from '../../store/upgrade-prompt-store'

interface ProTeaserProps {
  /** Headline for the teaser card. */
  title: string
  /** Subline explaining the value. */
  subtitle: string
  /** The specific things Pro unlocks here. */
  items: string[]
  /** Context passed to the paywall when opened. */
  upgradeHeadline?: string
}

/**
 * A locked-feature placeholder: says what Pro unlocks here and opens the paywall.
 * Used in place of premium sections (e.g. the advanced analytics) for free users,
 * so they can see the value they're missing rather than a blank space.
 */
export function ProTeaser({ title, subtitle, items, upgradeHeadline }: ProTeaserProps) {
  const show = useUpgradePrompt(s => s.show)
  return (
    <div className="surface p-6 md:p-8 flex flex-col items-center text-center gap-4 border border-gold/20">
      <span className="grid place-items-center w-12 h-12 rounded-2xl bg-gold/10 text-gold">
        <Crown size={22} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-semibold text-gold-gradient">{title}</h3>
        <p className="text-sm text-content/60 max-w-md">{subtitle}</p>
      </div>
      <ul className="flex flex-col gap-2 text-left">
        {items.map(item => (
          <li key={item} className="flex items-start gap-2.5 text-sm text-content/80">
            <Check size={15} className="text-gold shrink-0 mt-0.5" />
            {item}
          </li>
        ))}
      </ul>
      <button
        onClick={() => show(upgradeHeadline)}
        data-testid="pro-teaser-cta"
        className="glow-hover inline-flex items-center gap-2 mt-1 px-5 py-2.5 rounded-xl bg-gold text-black text-sm font-semibold cursor-pointer hover:bg-gold/90"
      >
        <Crown size={15} />
        Unlock with Pro
      </button>
    </div>
  )
}
