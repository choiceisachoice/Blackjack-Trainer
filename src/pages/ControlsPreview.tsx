import { useState } from 'react'
import { ActionButtons } from '../components/casino-session/ActionButtons'
import { BettingControls } from '../components/casino-session/BettingControls'
import { Action } from '../engine/rules/types'
import { ProgressBar, Input, Skeleton, Button, Tooltip, EmptyState } from '../components/common/ui'
import { BarChart3, TrendingUp, Lock } from 'lucide-react'

/**
 * TEMPORARY side-by-side review harness. Delete after review.
 *
 * The left column reproduces the markup that is live on
 * black-jack-training.com right now, copied verbatim from git so the comparison
 * is against the real previous state and not against a memory of it. The right
 * column renders the actual current components. Both are interactive: hover and
 * press them, that is where the whole difference lives.
 */

const FELT = 'radial-gradient(ellipse at 50% 35%, #1a6b3c, #15603a 55%, #0d4a2a)'

/** The action bar exactly as it ships today: no transition, no shadow. */
function OldActionBar() {
  const base =
    'px-5 py-2 rounded-lg font-semibold cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed'
  return (
    <div className="flex gap-2 flex-wrap justify-center">
      <button className={`${base} bg-success text-white hover:bg-success/80`}>Ziehen (H)</button>
      <button className={`${base} bg-error text-white hover:bg-error/80`}>Stehen (S)</button>
      <button className={`${base} bg-gold text-on-gold hover:bg-gold/80`}>Verdoppeln (D)</button>
      <button className={`${base} bg-chip-blue text-white hover:bg-chip-blue/80`}>Splitten (P)</button>
      <button className={`${base} bg-contrast/10 text-content hover:bg-contrast/20`}>Aufgeben (R)</button>
    </div>
  )
}

/** The chips exactly as they ship today: grey rectangles, one fill for all. */
function OldChips() {
  return (
    <div className="flex gap-2 flex-wrap justify-center">
      {[25, 50, 100, 200, 250, 500].map(b => (
        <button
          key={b}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer
            bg-contrast/10 text-content hover:bg-contrast/20"
        >
          +${b}
        </button>
      ))}
    </div>
  )
}

function Col({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0">
      <p className={`text-xs font-bold tracking-[0.18em] mb-5 ${tone}`}>{title}</p>
      <div className="rounded-2xl p-8 grid place-items-center min-h-[190px]" style={{ background: FELT }}>
        {children}
      </div>
    </div>
  )
}

export function ControlsPreview() {
  const [bet, setBet] = useState(0)
  return (
    <div className="app-canvas min-h-screen p-10 space-y-12">
      <header className="max-w-5xl">
        <h1 className="text-3xl font-bold text-content">Was sich geändert hat</h1>
        <p className="text-content/60 mt-2 text-sm leading-relaxed">
          Links der Stand, der jetzt auf black-jack-training.com läuft. Rechts der neue.
          Beide sind echt und anklickbar — fahren Sie mit der Maus darüber und drücken Sie sie.
          Der Unterschied liegt im Übergang und im Druck, nicht im Standbild.
        </p>
      </header>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-gold mb-4">1 · Aktionsleiste</h2>
        <div className="flex gap-6 flex-wrap">
          <Col title="VORHER — LIVE" tone="text-content/40"><OldActionBar /></Col>
          <Col title="NACHHER — NEU" tone="text-success"><ActionButtons onAction={(a: Action) => void a} canDouble canSplit canSurrender humanBusted={false} /></Col>
        </div>
        <p className="text-xs text-content/40 mt-3">
          Gemessen: vorher <code>transition-duration: 0s</code>, <code>box-shadow: none</code> —
          nachher 0,15 s über vier Eigenschaften, dazu Schatten und <code>active:scale</code>.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-gold mb-4">2 · Jetons</h2>
        <div className="flex gap-6 flex-wrap">
          <Col title="VORHER — LIVE" tone="text-content/40"><OldChips /></Col>
          <Col title="NACHHER — NEU" tone="text-success">
            <BettingControls currentBet={bet} minBet={25} maxBet={500} bankroll={5000} onBetChange={setBet} onConfirm={() => setBet(0)} />
          </Col>
        </div>
        <p className="text-xs text-content/40 mt-3">
          Farben nach Tischkonvention aus <code>--color-chip-*</code>, den vier Tokens, die vorher
          nirgends im Code referenziert waren.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-gold mb-4">3 · Gesperrte Zustände (nur neu)</h2>
        <div className="flex gap-6 flex-wrap">
          <Col title="NUR ZIEHEN UND STEHEN MÖGLICH" tone="text-content/40">
            <ActionButtons onAction={() => {}} canDouble={false} canSplit={false} canSurrender={false} humanBusted={false} />
          </Col>
          <Col title="ÜBERKAUFT — ALLES GESPERRT" tone="text-content/40">
            <ActionButtons onAction={() => {}} canDouble canSplit canSurrender humanBusted />
          </Col>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-gold mb-4">4 · Kleiner Tisch, wenig Geld</h2>
        <div className="flex gap-6 flex-wrap">
          <Col title="$5–$100, BANKROLL NUR $40 — DAS MEISTE GESPERRT" tone="text-content/40">
            <BettingControls currentBet={0} minBet={5} maxBet={100} bankroll={40} onBetChange={() => {}} onConfirm={() => {}} />
          </Col>
        </div>
        <p className="text-xs text-content/40 mt-3">
          Hier sehen Sie den roten Fünfer und den blauen Zehner, die auf dem großen Tisch nicht vorkommen.
        </p>
      </section>


      <section>
        <h2 className="text-sm font-semibold tracking-wide text-gold mb-4">5 · ProgressBar (neu)</h2>
        <div className="flex gap-6 flex-wrap">
          <div className="flex-1 min-w-[320px] surface p-6 space-y-5">
            <p className="text-xs tracking-[0.18em] text-content/40">VORHER — 12 HANDGEBAUTE, UNEINHEITLICH</p>
            <div className="h-2 bg-contrast/10 rounded-full overflow-hidden">
              <div className="h-full bg-gold rounded-full transition-all" style={{ width: '64%' }} />
            </div>
            <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-gold" style={{ width: '38%' }} />
            </div>
            <p className="text-xs text-content/40">Oben mit <code>transition-all</code>, unten ganz ohne — derselbe Balken, zwei Verhalten.</p>
          </div>
          <div className="flex-1 min-w-[320px] surface p-6 space-y-5">
            <p className="text-xs tracking-[0.18em] text-success">NACHHER — EINE KOMPONENTE</p>
            <ProgressBar value={64} label="Fortschritt" />
            <ProgressBar value={47} height={10} active label="Läuft gerade" />
            <ProgressBar value={38} height={4} label="Kategorie" />
            <ProgressBar value={82} height={10} fill="linear-gradient(90deg, var(--color-gold), var(--color-gold-bright))" label="Level" />
            <p className="text-xs text-content/40">Einheitlich 300 ms, <code>role="progressbar"</code> mit Wert für Screenreader.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-gold mb-4">5b · Der Balken groß — damit man ihn beurteilen kann</h2>
        <div className="surface p-8 space-y-7">
          <div>
            <p className="text-xs tracking-[0.18em] text-content/40 mb-2">ALT — FLACHE FÜLLUNG, EINE FARBE</p>
            <div className="h-7 rounded-full bg-contrast/10 overflow-hidden">
              <div className="h-full rounded-full bg-gold" style={{ width: '68%' }} />
            </div>
          </div>
          <div>
            <p className="text-xs tracking-[0.18em] text-success mb-2">NEU — VERLAUF, GLANZ, RINNE, SCHEIN</p>
            <ProgressBar value={68} height={28} label="Groß" />
          </div>
          <div>
            <p className="text-xs tracking-[0.18em] text-success mb-2">NEU, ARBEITEND — MIT LAUFENDEN STREIFEN</p>
            <ProgressBar value={68} height={28} active label="Groß, arbeitend" />
          </div>
          <div>
            <p className="text-xs tracking-[0.18em] text-content/40 mb-2">EIGENER SCHEIN STATT GOLD — WIE IN DER ANALYSE</p>
            <div className="grid gap-4 md:grid-cols-3">
              <ProgressBar value={91} height={20} fill="linear-gradient(180deg, #4ade80, var(--color-success))" glow="color-mix(in srgb, var(--color-success) 45%, transparent)" />
              <ProgressBar value={54} height={20} fill="linear-gradient(180deg, #fbbf24, var(--color-warning))" glow="color-mix(in srgb, var(--color-warning) 45%, transparent)" />
              <ProgressBar value={23} height={20} fill="linear-gradient(180deg, #f87171, var(--color-error))" glow="color-mix(in srgb, var(--color-error) 45%, transparent)" />
            </div>
          </div>
          <div>
            <p className="text-xs tracking-[0.18em] text-content/40 mb-2">LEER UND VOLL — DIE RANDFÄLLE</p>
            <div className="space-y-3">
              <ProgressBar value={0} height={20} />
              <ProgressBar value={100} height={20} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-gold mb-4">6 · Input (neu) — mit Tastatur testen</h2>
        <div className="flex gap-6 flex-wrap">
          <div className="flex-1 min-w-[320px] surface p-6 space-y-4">
            <p className="text-xs tracking-[0.18em] text-content/40">VORHER — HEBT DEN FOKUSRING AUS</p>
            <input
              placeholder="Mit Tab anspringen"
              className="w-full px-3 py-2 rounded-lg bg-input-bg border border-contrast/20 text-content text-sm focus:outline-none focus:border-gold/60"
            />
            <p className="text-xs text-content/40"><code>focus:outline-none</code> schaltet den globalen Goldring ab. 20-mal so kopiert.</p>
          </div>
          <div className="flex-1 min-w-[320px] surface p-6 space-y-4">
            <p className="text-xs tracking-[0.18em] text-success">NACHHER — RING BLEIBT</p>
            <Input placeholder="Mit Tab anspringen" className="w-full" />
            <Input placeholder="Ungültig" defaultValue="abc" invalid className="w-full" />
            <p className="text-xs text-content/40">Drücken Sie Tab: links kein Ring, rechts der Goldring. Dazu ein Fehlerzustand, den es vorher nicht gab.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-gold mb-4">7 · Skeleton (neu) — Analyse beim Laden</h2>
        <div className="flex gap-6 flex-wrap">
          <div className="flex-1 min-w-[320px] surface p-6 min-h-[260px] grid place-items-center">
            <div>
              <p className="text-xs tracking-[0.18em] text-content/40 mb-6">VORHER</p>
              <p className="text-content/50">Analyse wird geladen …</p>
            </div>
          </div>
          <div className="flex-1 min-w-[320px] surface p-6 min-h-[260px]">
            <p className="text-xs tracking-[0.18em] text-success mb-4">NACHHER</p>
            <div className="space-y-4">
              <div className="flex gap-2">
                {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 flex-1" rounded="rounded-xl" />)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-24" rounded="rounded-2xl" />
                <Skeleton className="h-24" rounded="rounded-2xl" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-gold mb-4">8 · Goldbutton — 24 Stellen vereinheitlicht</h2>
        <div className="flex gap-6 flex-wrap items-start">
          <div className="flex-1 min-w-[300px] surface p-6 space-y-4">
            <p className="text-xs tracking-[0.18em] text-content/40">VORHER — ZWEI RICHTUNGEN NEBENEINANDER</p>
            <div className="flex gap-3 flex-wrap">
              <button className="px-6 py-2.5 rounded-xl font-semibold text-on-gold bg-gradient-to-b from-gold-bright to-gold border border-gold/50">senkrecht (-to-b)</button>
              <button className="px-6 py-2.5 rounded-xl font-semibold text-on-gold bg-linear-to-br from-gold-bright to-gold border border-gold/50">diagonal (-to-br)</button>
            </div>
            <p className="text-xs text-content/40">Derselbe Knopftyp, zwei Verlaufsrichtungen — 25 Fundstellen quer durch die App.</p>
          </div>
          <div className="flex-1 min-w-[300px] surface p-6 space-y-4">
            <p className="text-xs tracking-[0.18em] text-success">NACHHER — EINE RICHTUNG</p>
            <div className="flex gap-3 flex-wrap">
              <Button>Gratis starten</Button>
              <Button variant="secondary">Später</Button>
            </div>
            <p className="text-xs text-content/40">24 Stellen auf <code>-to-b</code> gezogen, die Richtung der Button-Komponente.</p>
          </div>
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold tracking-wide text-gold mb-4">9 · Tooltip (neu) &amp; Filz aus dem Token</h2>
        <div className="flex gap-6 flex-wrap">
          <div className="flex-1 min-w-[320px] surface p-6 space-y-6">
            <p className="text-xs tracking-[0.18em] text-content/40">VORHER — NATIVES title=</p>
            <span title="Erscheint nach einer Sekunde, nie auf dem Handy" className="inline-block px-4 py-2 rounded-lg bg-contrast/10 text-content text-sm">Maus draufhalten</span>
            <p className="text-xs tracking-[0.18em] text-success pt-2">NACHHER — TOOLTIP</p>
            <Tooltip label="Sofort da, auch per Tastatur erreichbar">
              <span className="inline-block px-4 py-2 rounded-lg bg-contrast/10 text-content text-sm">Maus draufhalten oder Tab</span>
            </Tooltip>
          </div>
          <div className="flex-1 min-w-[320px] surface p-6 space-y-4">
            <p className="text-xs tracking-[0.18em] text-content/40">FILZ — HEX GEGEN TOKEN</p>
            <div className="flex gap-4">
              <div className="flex-1 h-24 rounded-xl grid place-items-end p-2" style={{ background: 'radial-gradient(ellipse 110% 80% at 50% -8%, #1a6b3c 0%, #15603a 48%, #0d4a2a 92%)', border: '8px solid #5c3a1e' }}>
                <span className="text-[10px] text-white/70">alt: fest verdrahtet</span>
              </div>
              <div className="flex-1 h-24 rounded-xl grid place-items-end p-2" style={{ background: 'radial-gradient(ellipse 110% 80% at 50% -8%, var(--color-felt) 0%, color-mix(in srgb, var(--color-felt) 88%, black) 48%, color-mix(in srgb, var(--color-felt) 62%, black) 92%)', border: '8px solid var(--color-wood)' }}>
                <span className="text-[10px] text-white/70">neu: --color-felt</span>
              </div>
            </div>
            <p className="text-xs text-content/40">Der Ton wird minimal dunkler — das ist der Wert, der im Theme steht.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-gold mb-4">9b · Leerzustände (neu)</h2>
        <div className="flex gap-6 flex-wrap">
          <div className="flex-1 min-w-[340px] surface p-6">
            <p className="text-xs tracking-[0.18em] text-content/40 mb-4">VORHER — LIEST SICH WIE EIN LADEFEHLER</p>
            <div className="surface p-10 text-center">
              <p className="text-content/60 text-lg font-medium">Noch keine Durchgänge erfasst</p>
              <p className="text-content/40 text-sm mt-1">Spiel ein paar Runden, dann erscheint hier deine Auswertung.</p>
            </div>
            <div className="h-24 grid place-items-center text-content/40 text-sm mt-4">Keine Durchgänge in diesem Zeitraum</div>
          </div>
          <div className="flex-1 min-w-[340px] surface p-6">
            <p className="text-xs tracking-[0.18em] text-success mb-4">NACHHER — LIEST SICH WIE EINE EINLADUNG</p>
            <div className="surface p-10">
              <EmptyState
                icon={BarChart3}
                title="Noch keine Durchgänge erfasst"
                body="Spiel ein paar Runden, dann erscheint hier deine Auswertung."
                action={{ label: 'Loslegen', onClick: () => {} }}
              />
            </div>
            <div className="h-24 grid place-items-center mt-4">
              <EmptyState compact icon={TrendingUp} title="Keine Durchgänge in diesem Zeitraum" />
            </div>
          </div>
        </div>
        <div className="mt-4 surface p-6 max-w-md">
          <p className="text-xs tracking-[0.18em] text-content/40 mb-2">KOMPAKT, IN EINEM PANEL</p>
          <EmptyState compact icon={Lock} title="Noch keine Erfolge freigeschaltet" />
        </div>
        <p className="text-xs text-content/40 mt-3">
          Die Texte sind unverändert — sie existierten schon in allen sieben Sprachen. Neu ist nur die Form.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-gold mb-4">10 · Aufgeräumt, ohne sichtbare Änderung</h2>
        <p className="text-sm text-content/60 max-w-3xl leading-relaxed">
          In <code>CasinoSessionConfig.tsx</code> waren <code>Field</code>, <code>Segmented</code> und
          <code> Toggle</code> ein zweites Mal definiert — <code>Toggle</code> Zeichen für Zeichen identisch
          mit der Fassung in <code>common/ui.tsx</code>. 60 Zeilen entfernt, sie kommen jetzt aus dem
          geteilten Modul. Auf dem Bildschirm ändert das nichts, und genau das war die Absicht:
          eine zweite Kopie kann abdriften, ohne dass etwas fehlschlägt.
        </p>
      </section>
    </div>
  )
}
