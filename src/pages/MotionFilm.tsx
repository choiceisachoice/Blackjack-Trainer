import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowLeft, Play, Pause, SkipBack, Grid3x3 } from 'lucide-react'
import { filmState, BEATS, DURATION, STAGE_W as W, STAGE_H as H } from '../services/motion/deck-film'
import { paintFilm, GOLD, GOLD_LIT } from '../services/motion/paint-film'

/**
 * "Bloom" — the player and review harness for the title sequence.
 *
 * The piece itself lives in `services/motion/`: `deck-film.ts` decides where
 * every card is at a given millisecond, `paint-film.ts` draws one frame. This
 * file is the clock, the canvas, and the controls for looking at it.
 *
 * ## What the controls are for
 *
 * The scrubber is not a convenience. Because the film is a pure function of
 * `(card, t)`, seeking to 6,342 ms draws exactly the frame that belongs there —
 * so timing can be *inspected* rather than watched and guessed at. The grid
 * button samples eight moments side by side, which is how spacing is actually
 * read: bunched frames mean the ease resolves early, evenly spaced ones mean it
 * is effectively linear.
 *
 * ## Two failures worth not repeating
 *
 * The first version of this screen animated the product's *vocabulary* —
 * running count, true count, bet ramp — and meant nothing to anyone who did not
 * already know those words. The second drew card **backs**: dark rectangles on
 * a dark ground, monotone by construction. Both lessons are recorded at the top
 * of `deck-film.ts`, next to the code that acts on them.
 */

// ── Canvas host ───────────────────────────────────────────────────────────

function FilmCanvas({ t, scale }: { t: number; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    // Back the canvas at device resolution; a 1× canvas upscaled by CSS is the
    // usual reason canvas work looks soft next to DOM.
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr }
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paintFilm(ctx, t)
  }, [t, scale])

  return <canvas ref={ref} style={{ width: W * scale, height: H * scale, display: 'block' }} />
}

// ── Title ─────────────────────────────────────────────────────────────────

function Title({ t, scale }: { t: number; scale: number }) {
  const s = filmState(t)
  if (s.title <= 0) return null
  return (
    <div style={{
      position: 'absolute', left: 0, top: H * 0.795 * scale, width: W * scale,
      textAlign: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 700,
        fontSize: 46 * scale, letterSpacing: `${0.1 * scale}em`,
        lineHeight: 1, color: GOLD_LIT,
        opacity: s.title,
        transform: `translateY(${(1 - s.title) * 22 * scale}px)`,
        textShadow: `0 0 ${40 * scale}px rgba(212,168,71,0.45)`,
      }}>SEE WHAT&rsquo;S COMING</div>
      <div style={{
        marginTop: 18 * scale,
        fontFamily: 'var(--font-sans)', fontWeight: 700,
        fontSize: 11 * scale, letterSpacing: `${0.36 * scale}em`,
        textTransform: 'uppercase', color: `${GOLD}b0`,
        opacity: s.sub,
        transform: `translateY(${(1 - s.sub) * 14 * scale}px)`,
      }}>black-jack-training.com</div>
    </div>
  )
}

// ── Harness ───────────────────────────────────────────────────────────────

function useClock(active: boolean, speed: number, onEnd: () => void) {
  const [t, setT] = useState(0)
  const raf = useRef(0)
  const last = useRef(0)

  useEffect(() => {
    if (!active) return
    last.current = performance.now()
    const step = (now: number) => {
      const dt = (now - last.current) * speed
      last.current = now
      let done = false
      setT(prev => {
        const next = prev + dt
        if (next >= DURATION) { done = true; return DURATION }
        return next
      })
      if (done) onEnd()
      else raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [active, speed, onEnd])

  return [t, setT] as const
}

const SAMPLES = [600, 1900, 3000, 4600, 6900, 8200, 9400, 11600]

export function MotionFilm() {
  const reduced = useReducedMotion()
  const [playing, setPlaying] = useState(!reduced)
  const [speed, setSpeed] = useState(1)
  const [grid, setGrid] = useState(false)
  const stop = useCallback(() => setPlaying(false), [])
  const [t, setT] = useClock(playing, speed, stop)
  const [scale, setScale] = useState(1)
  const box = useRef<HTMLDivElement>(null)

  // A ResizeObserver, not a window listener: the container changes width
  // without the window doing anything, and a stale measurement renders the
  // whole piece at a fraction of its size.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      if (w > 0) setScale(Math.min(1, w / W))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const restart = useCallback(() => { setT(0); setPlaying(true) }, [setT])

  return (
    <div className="min-h-screen px-6 py-8 max-w-[1240px] mx-auto">
      <Link to="/dev" className="inline-flex items-center gap-2 text-sm text-content/60 hover:text-gold mb-6">
        <ArrowLeft size={15} /> dev
      </Link>

      <h1 className="text-2xl font-semibold text-gold-gradient">Bloom</h1>
      <p className="text-sm text-content/55 mt-1 mb-6 max-w-2xl">
        12.8s, canvas. One card becomes fifty-two, which open into a rotating rosette, close
        into a fan, and give back the card they started from. Faces up, because the colour in a
        deck is on the front — white stock, red and black, on green felt.
      </p>

      {reduced && (
        <p className="text-sm mb-4 px-4 py-3 rounded-lg border border-gold/30 bg-gold/5 text-content/80">
          Reduced motion is on, so this did not autoplay. Press play if you want to watch it.
        </p>
      )}

      <div ref={box} className="w-full relative">
        <div style={{ borderRadius: 14, overflow: 'hidden', position: 'relative' }}>
          <FilmCanvas t={t} scale={scale} />
          <Title t={t} scale={scale} />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button onClick={() => (t >= DURATION ? restart() : setPlaying(p => !p))}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold text-casino-bg font-semibold text-sm cursor-pointer">
          {playing ? <Pause size={15} /> : <Play size={15} />}
          {t >= DURATION ? 'Replay' : playing ? 'Pause' : 'Play'}
        </button>
        <button onClick={restart} title="restart"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-contrast/15 text-sm cursor-pointer hover:border-gold/40">
          <SkipBack size={15} />
        </button>

        <input type="range" min={0} max={DURATION} step={1} value={Math.round(t)}
          onChange={e => { setPlaying(false); setT(Number(e.target.value)) }}
          className="flex-1 min-w-[240px] accent-[#d4a847] cursor-pointer" />

        <span className="text-sm text-content/60 tabular-nums w-[86px] text-right">
          {(t / 1000).toFixed(2)}s
        </span>

        {[0.25, 0.5, 1].map(sp => (
          <button key={sp} onClick={() => setSpeed(sp)}
            className={`px-2.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer border ${
              speed === sp ? 'border-gold text-gold' : 'border-contrast/15 text-content/50'}`}>
            {sp}×
          </button>
        ))}

        <button onClick={() => setGrid(g => !g)} title="spacing grid"
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer ${
            grid ? 'border-gold text-gold' : 'border-contrast/15 text-content/60'}`}>
          <Grid3x3 size={15} />
        </button>
      </div>

      <div className="mt-2 flex gap-4 flex-wrap text-[0.7rem] text-content/40">
        {BEATS.map(b => (
          <button key={b.label} onClick={() => { setPlaying(false); setT(b.at) }}
            className="hover:text-gold cursor-pointer tabular-nums">
            {b.label} · {(b.at / 1000).toFixed(1)}s
          </button>
        ))}
      </div>

      {grid && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
          {SAMPLES.map(sp => (
            <button key={sp} onClick={() => { setPlaying(false); setT(sp) }}
              className="text-left cursor-pointer group">
              <div className="border border-contrast/10 group-hover:border-gold/40 rounded-lg overflow-hidden">
                <FilmCanvas t={sp} scale={0.24} />
              </div>
              <span className="text-[0.7rem] text-content/40 tabular-nums">{(sp / 1000).toFixed(2)}s</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
