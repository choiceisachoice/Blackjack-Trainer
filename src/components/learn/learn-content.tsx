import type { LucideIcon } from 'lucide-react'
import { Club, Coins, GraduationCap, Layers, Zap } from 'lucide-react'

/** The two emphasis tags every topic body may use. */
export const BODY_TAGS = {
  g: <span className="text-gold font-medium" />,
  c: <span className="text-content font-medium" />,
}

// The mode names reuse the keys the modes themselves use, so the guide can
// never call a screen something the screen does not call itself.
export const MODE_GUIDE: { icon: LucideIcon; nameKey: string; textKey: string }[] = [
  { icon: Zap, nameKey: 'training.speed.title', textKey: 'learn.mode.speed' },
  { icon: GraduationCap, nameKey: 'training.flash.title', textKey: 'learn.mode.flash' },
  { icon: Coins, nameKey: 'training.bet.title', textKey: 'learn.mode.bet' },
  { icon: Layers, nameKey: 'training.deck.title', textKey: 'learn.mode.deck' },
  { icon: Club, nameKey: 'casino.name', textKey: 'learn.mode.casino' },
]

