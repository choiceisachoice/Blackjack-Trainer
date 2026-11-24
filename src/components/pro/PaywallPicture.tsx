/**
 * The picture on the paywall: the real thing the visitor is being asked to
 * pay for, in miniature — never a stock image.
 *
 * Each of the three is drawn by the product's own parts. The table is
 * `CasinoTable` itself (through the landing's `FeltTableVisual`, the same
 * fixed hand), the deviations are an excerpt of the real strategy chart with
 * its Illustrious 18 rings, and the drills are the engine's one bet ramp next
 * to the casino table's own discard tray. A drawing of a product beside the
 * product's own type reads as a mockup; this reads as the app.
 *
 * Loaded on demand (see `UpgradePanel`): the table pulls in the whole felt,
 * and the public strategy chart, which hosts the paywall as a modal, should
 * not carry it until someone opens it. Decorative: every picture sits beside
 * a row that says in words what it shows.
 */
import { DeviationChartVisual, FeltTableVisual } from '../landing/FeatureVisuals'
import { DiscardTray } from '../table/ShoeProgress'
import { BET_SPREAD } from '../training/bet-spread-math'
import type { PaywallSubject } from './paywall-subject'

/** Cards in the tray: two and a half decks out of six, a mid-shoe question. */
const TRAY_CARDS = 130

interface PaywallPictureProps {
  subject: PaywallSubject
}

/**
 * One of the three pictures, filling the frame it is given.
 *
 * @param subject - Which of the three to draw
 */
export function PaywallPicture({ subject }: PaywallPictureProps) {
  return (
    <div aria-hidden className="h-full w-full grid place-items-center" data-testid={`paywall-picture-${subject}`}>
      {subject === 'table' && (
        /* Fills the frame at the table's own proportions, edge to edge, and
           lets the frame crop the few pixels that do not fit — a felt that
           ends inside the frame reads as a picture of a picture. The frame
           is a size container, so both of its sides are known here without
           measuring. */
        <div className="w-[max(100cqw,calc(100cqh*1.75))] aspect-[1120/640] shrink-0">
          <FeltTableVisual />
        </div>
      )}
      {subject === 'deviations' && (
        /* The landing tile's excerpt is drawn for a taller tile; scaled
           rather than re-laid-out, so it stays the same picture. */
        <div className="scale-[0.84]">
          <DeviationChartVisual />
        </div>
      )}
      {subject === 'drills' && <DrillsVisual />}
    </div>
  )
}

/**
 * The two drills side by side: the bet ramp the Bet Spread drill grades
 * against, and the discard tray the Deck Estimation drill asks you to read.
 */
function DrillsVisual() {
  // Sized in the frame's own units (it is a size container), so the pair
  // fits a 316px phone frame and a 380px desktop one alike.
  return (
    <div className="h-[88cqh] flex items-stretch justify-center gap-[7cqw]">
      <BetRampVisual />
      {/* The table's own tray, without the per-deck ticks — the drill hides
          them too, or the answer would be printed on the acrylic. `fill`
          takes the height given; the stack stays an exact share of the shoe. */}
      <div className="h-full flex flex-col [&>div]:flex-1 [&>div]:min-h-0">
        <DiscardTray cardCount={TRAY_CARDS} showTicks={false} width={50} fill />
      </div>
    </div>
  )
}

/**
 * The bet ramp as five columns: units over true count, from the same table
 * the drill and the casino table grade against (`BET_SPREAD`, i.e. the
 * engine's `BET_RAMP`). Linear heights on purpose — the doubling is the point.
 */
function BetRampVisual() {
  const most = Math.max(...BET_SPREAD.map(step => step.multiplier))
  return (
    <div className="h-full flex items-stretch gap-[1.6cqw]" data-testid="paywall-bet-ramp">
      {BET_SPREAD.map(step => {
        const share = step.multiplier / most
        return (
          <div key={step.label} className="flex flex-col items-center gap-1 w-[9.5cqw] min-w-6">
            <span className="text-[0.6875rem] font-bold tabular-nums text-gold leading-none">{step.multiplier}×</span>
            <div className="flex-1 min-h-0 w-full flex items-end">
              <div
                className="w-full rounded-t-[4px] bg-gradient-to-b from-gold-bright to-gold"
                style={{ height: `${Math.max(5, share * 100)}%`, opacity: 0.4 + 0.6 * share }}
              />
            </div>
            <span className="text-[0.625rem] font-semibold tabular-nums text-content/55 leading-none whitespace-nowrap">
              {step.label.replace(/^TC\s*/, '')}
            </span>
          </div>
        )
      })}
    </div>
  )
}
