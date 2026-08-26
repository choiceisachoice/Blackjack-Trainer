import { useState } from 'react'
import * as Loaders from 'ldrs/react'
import 'ldrs/react/Ring.css'
import 'ldrs/react/Ring2.css'
import 'ldrs/react/Quantum.css'
import 'ldrs/react/Helix.css'
import 'ldrs/react/Orbit.css'
import 'ldrs/react/Trefoil.css'
import 'ldrs/react/Momentum.css'
import 'ldrs/react/Metronome.css'
import 'ldrs/react/Mirage.css'
import 'ldrs/react/Pulsar.css'
import 'ldrs/react/Spiral.css'
import 'ldrs/react/Tailspin.css'
import 'ldrs/react/TailChase.css'
import 'ldrs/react/LineSpinner.css'
import 'ldrs/react/LineWobble.css'
import 'ldrs/react/DotSpinner.css'
import 'ldrs/react/DotStream.css'
import 'ldrs/react/DotPulse.css'
import 'ldrs/react/DotWave.css'
import 'ldrs/react/Waveform.css'
import 'ldrs/react/Reuleaux.css'
import 'ldrs/react/Squircle.css'
import 'ldrs/react/Hourglass.css'
import 'ldrs/react/Grid.css'
import 'ldrs/react/Hatch.css'
import 'ldrs/react/Infinity.css'
import 'ldrs/react/Ripples.css'
import 'ldrs/react/Ping.css'
import 'ldrs/react/Zoomies.css'
import 'ldrs/react/Trio.css'
import 'ldrs/react/NewtonsCradle.css'
import 'ldrs/react/Superballs.css'
import 'ldrs/react/Bouncy.css'
import 'ldrs/react/Jelly.css'
import 'ldrs/react/Wobble.css'
import 'ldrs/react/Cardio.css'
import 'ldrs/react/Pinwheel.css'
import 'ldrs/react/Treadmill.css'
import { AppLoader } from '../components/common/AppLoader'

/**
 * DEV-only gallery of the ldrs loaders, in this app's gold on this app's black.
 *
 * The library's own site shows them on white with default colours, which says
 * nothing about how they read in a dark-luxury interface — and picking a
 * loading animation from a screenshot on someone else's background is how you
 * end up with one that looks cheap in yours.
 *
 * Only the loaders whose CSS is imported above appear here; the package ships
 * 44 and each needs its own stylesheet.
 */
type LoaderProps = {
  size?: number | string
  color?: string
  speed?: number | string
  stroke?: number | string
  bgOpacity?: number | string
}

/** Curated to the ones that suit a precise, premium interface. */
const SHOWN: { name: string; note: string }[] = [
  { name: 'Grid', note: 'In Verwendung — 3×3, Welle läuft durch' },
  { name: 'Ring2', note: 'Dünner Ring mit Lücke' },
  { name: 'Ring', note: 'Klassisch, etwas kräftiger' },
  { name: 'Quantum', note: 'Zwei Bögen, präzise' },
  { name: 'Helix', note: 'Wellenband' },
  { name: 'Orbit', note: 'Kreisende Punkte' },
  { name: 'Trefoil', note: 'Verschlungene Schleife' },
  { name: 'Momentum', note: 'Rotierender Bogen' },
  { name: 'Metronome', note: 'Pendel' },
  { name: 'Mirage', note: 'Fließende Linie' },
  { name: 'Pulsar', note: 'Pulsierender Ring' },
  { name: 'Spiral', note: 'Spirale' },
  { name: 'Tailspin', note: 'Schweif-Ring' },
  { name: 'TailChase', note: 'Punkte jagen sich' },
  { name: 'LineSpinner', note: 'Speichen' },
  { name: 'LineWobble', note: 'Balken, für Fortschritt' },
  { name: 'DotSpinner', note: 'Punkte im Kreis' },
  { name: 'DotStream', note: 'Punktstrom' },
  { name: 'DotPulse', note: 'Drei Punkte, ruhig' },
  { name: 'DotWave', note: 'Punktwelle' },
  { name: 'Waveform', note: 'Audio-Balken' },
  { name: 'Reuleaux', note: 'Geometrisch, ungewöhnlich' },
  { name: 'Squircle', note: 'Rotierendes Quadrat' },
  { name: 'Hourglass', note: 'Sanduhr' },
  { name: 'Hatch', note: 'Schraffur' },
  { name: 'Infinity', note: 'Endlosschleife' },
  { name: 'Ripples', note: 'Wasserringe' },
  { name: 'Ping', note: 'Radar-Ping' },
  { name: 'Zoomies', note: 'Schnelle Striche' },
  { name: 'Trio', note: 'Drei Balken' },
  { name: 'NewtonsCradle', note: 'Kugelstoßpendel' },
  { name: 'Superballs', note: 'Springende Bälle' },
  { name: 'Bouncy', note: 'Hüpfend, verspielt' },
  { name: 'Jelly', note: 'Weich' },
  { name: 'Wobble', note: 'Wackelnd' },
  { name: 'Cardio', note: 'Herzschlag-Linie' },
  { name: 'Pinwheel', note: 'Windrad' },
  { name: 'Treadmill', note: 'Laufband' },
]

export function LoaderGallery() {
  const [size, setSize] = useState(46)
  const [speed, setSpeed] = useState(1)
  const [gold, setGold] = useState(true)
  const [showFull, setShowFull] = useState(false)

  const registry = Loaders as unknown as Record<string, React.FC<LoaderProps>>
  const color = gold ? 'var(--color-gold)' : 'var(--color-content)'

  if (showFull) {
    return (
      <div className="relative h-screen">
        <AppLoader delayMs={0} />
        <button
          onClick={() => setShowFull(false)}
          className="absolute top-4 left-4 z-10 text-sm px-3 py-1.5 rounded-lg
            border border-gold/45 bg-gold/10 text-gold cursor-pointer"
        >
          ← Zurück zur Galerie
        </button>
      </div>
    )
  }

  return (
    <div className="app-canvas min-h-screen">
      <div className="max-w-6xl mx-auto px-5 py-10">
        <header>
          <span className="text-[0.6875rem] font-bold tracking-[0.2em] uppercase text-warning">
            Dev — Loader-Galerie
          </span>
          <h1 className="mt-3 text-3xl font-extrabold text-gold-gradient leading-tight pb-1">
            ldrs, in unserem Gold auf unserem Schwarz
          </h1>
          <p className="mt-2 text-sm text-content/50 max-w-[62ch]">
            {SHOWN.length} von 44 Loadern der Bibliothek. MIT-Lizenz, keine
            Abhängigkeiten — jeder einzeln importierbar, es landet nur im Bundle,
            was wir wirklich benutzen. <b className="text-gold">Grid</b> ist der,
            der aktuell im Ladescreen läuft.
          </p>
        </header>

        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 surface rounded-xl px-5 py-4">
          <label className="flex items-center gap-2.5 text-sm">
            <span className="text-content/50">Größe</span>
            <input
              type="range" min={20} max={90} value={size}
              onChange={e => setSize(Number(e.target.value))}
              className="accent-[var(--color-gold)]"
            />
            <span className="tabular-nums text-content/70 w-9">{size}</span>
          </label>

          <label className="flex items-center gap-2.5 text-sm">
            <span className="text-content/50">Tempo</span>
            <input
              type="range" min={4} max={30} value={speed * 10}
              onChange={e => setSpeed(Number(e.target.value) / 10)}
              className="accent-[var(--color-gold)]"
            />
            <span className="tabular-nums text-content/70 w-9">{speed.toFixed(1)}s</span>
          </label>

          <button
            onClick={() => setGold(g => !g)}
            className="text-sm px-3 py-1.5 rounded-lg border border-contrast/15 cursor-pointer hover:border-gold/40"
          >
            Farbe: <b className={gold ? 'text-gold' : 'text-content'}>{gold ? 'Gold' : 'Elfenbein'}</b>
          </button>

          <button
            onClick={() => setShowFull(true)}
            className="ml-auto text-sm px-4 py-1.5 rounded-lg font-semibold
              bg-gradient-to-br from-gold-bright to-gold text-on-gold cursor-pointer"
          >
            Echten Ladescreen ansehen →
          </button>
        </div>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {SHOWN.map(({ name, note }) => {
            const Loader = registry[name]
            if (!Loader) return null
            const current = name === 'Grid'
            return (
              <div
                key={name}
                data-testid={`loader-${name}`}
                className={`surface rounded-xl p-5 flex flex-col items-center justify-between gap-4 min-h-[168px] ${
                  current ? 'border border-gold/45' : ''
                }`}
              >
                <div className="flex-1 grid place-items-center">
                  <Loader size={size} speed={speed} color={color} />
                </div>
                <div className="text-center">
                  <div className={`text-sm font-semibold ${current ? 'text-gold' : ''}`}>{name}</div>
                  <div className="mt-0.5 text-xs text-content/40 leading-snug">{note}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
