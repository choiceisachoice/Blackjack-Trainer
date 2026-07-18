import type { ReactNode } from 'react'
import { Trophy, Wallet } from 'lucide-react'
import { Reveal } from './Reveal'
import {
  SpeedDrillVisual,
  TrendVisual,
  FeltTableVisual,
  DeviationChartVisual,
  BankrollVisual,
} from './FeatureVisuals'

/**
 * The landing's feature showcase, told as a progression rather than a grid of
 * equal cards: what the free tier already gives you, then what Pro opens up.
 *
 * The tier is carried by the *structure* — two labelled bands — instead of a
 * "PRO" sticker on individual cards. A badge reads as a restriction and makes
 * the reader assemble the offer themselves; a band states the deal plainly and
 * hands the visitor to the pricing section with the split already understood.
 */
export function FeatureShowcase() {
  return (
    <div className="mt-12 flex flex-col gap-5">
      {/* ── Free ─────────────────────────────────────────────── */}
      <Reveal>
        <BandHead
          label="Free"
          headline="Learn the count properly."
          sub="No card required — and genuinely enough to build the skill."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <Tile className="lg:col-span-2">
            <TileText
              title="Speed Drill & Flashcards"
              body="Keep the running count under time pressure, and drill every basic-strategy hand until it’s reflex."
            />
            <div className="mt-6"><SpeedDrillVisual /></div>
          </Tile>

          <Tile>
            <TileText
              title="Analytics that don’t lie"
              body="Accuracy trend, practice heatmap and your weakest hands — from your real sessions."
            />
            <div className="mt-6"><TrendVisual /></div>
          </Tile>

          <Strip
            icon={<Trophy size={20} />}
            title="Levels & achievements"
            body="100+ goals and a 25-level track that pull you from first hand to genuine advantage play."
          />
        </div>
      </Reveal>

      {/* ── Pro ──────────────────────────────────────────────── */}
      <Reveal delay={0.06}>
        <div className="rounded-3xl border border-gold/25 p-5 md:p-6
          bg-[radial-gradient(90%_130%_at_50%_-10%,rgba(212,168,71,.08),transparent_65%),rgba(255,255,255,.012)]">
          <BandHead
            label="Pro"
            gold
            headline="Take it to the table."
            sub="Where the count stops being a drill and turns into an actual edge."
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <Tile className="lg:col-span-2 flex flex-col">
              <TileText
                title="Full Casino Session"
                body="A real multi-seat felt table — bots, splits, doubles, payouts and dealer soft-17 rules. The closest thing to the pit."
              />
              <div className="mt-6 flex-1"><FeltTableVisual /></div>
            </Tile>

            <Tile>
              <TileText
                title="Deviations on the chart"
                body="Illustrious 18 & Fab 4 overlaid on the strategy chart, with the true-count threshold for every play."
              />
              <div className="mt-6"><DeviationChartVisual /></div>
            </Tile>

            <Strip
              icon={<Wallet size={20} />}
              title="Bankroll tools"
              body="Track real-money sessions and simulate risk of ruin, so your bet spread matches your actual edge."
              aside={<BankrollVisual />}
            />
          </div>
        </div>
      </Reveal>
    </div>
  )
}

/** Band label + headline, introducing what this tier covers. */
function BandHead({ label, headline, sub, gold = false }: {
  label: string
  headline: string
  sub: string
  gold?: boolean
}) {
  return (
    <div className="mb-5 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
      <span className={`text-[11px] font-extrabold tracking-[0.16em] uppercase rounded-full px-2.5 py-1 ${
        gold
          ? 'text-casino-bg bg-gradient-to-br from-gold-bright to-gold'
          : 'text-content/60 bg-contrast/8 border border-contrast/12'
      }`}>
        {label}
      </span>
      <h3 className="text-xl md:text-2xl font-bold tracking-tight">{headline}</h3>
      <p className="text-sm text-content/50 basis-full sm:basis-auto">{sub}</p>
    </div>
  )
}

/** A showcase tile: text on top, a product glimpse underneath. */
function Tile({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`surface rounded-2xl p-[22px] ${className}`}>{children}</div>
}

function TileText({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h4 className="text-base font-bold">{title}</h4>
      <p className="mt-2 text-sm text-content/60 leading-relaxed max-w-[42ch]">{body}</p>
    </>
  )
}

/** A wide, short tile — breaks the grid's rhythm so nothing reads as a uniform row. */
function Strip({ icon, title, body, aside }: {
  icon: ReactNode
  title: string
  body: string
  aside?: ReactNode
}) {
  return (
    <div className="surface rounded-2xl p-[22px] lg:col-span-3 flex items-center gap-5">
      <span className="grid place-items-center w-11 h-11 rounded-xl shrink-0
        bg-gold/12 border border-gold/20 text-gold">
        {icon}
      </span>
      <div className="min-w-0">
        <h4 className="text-base font-bold">{title}</h4>
        <p className="mt-1 text-sm text-content/60 leading-relaxed">{body}</p>
      </div>
      {aside && <div className="ml-auto hidden md:block">{aside}</div>}
    </div>
  )
}
