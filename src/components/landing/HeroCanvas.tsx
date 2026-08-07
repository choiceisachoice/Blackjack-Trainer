import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/**
 * The landing hero's animated background: playing cards and casino chips
 * drifting toward the camera in real 3D
 * (Three.js — perspective + depth fog + depth-of-field blur +
 * pointer parallax). The canvas is opaque (clears to the app background); the CSS
 * scrim/ambient/vignette layers sit on top. Honours
 * reduced-motion (one static frame) and no-ops where WebGL is unavailable.
 */
type Def =
  | { t: 'card'; r: string; s: string; red: boolean }
  | { t: 'chip'; c: string; fill: string; ink: string }

interface Drifter {
  sharp: THREE.Sprite
  blur: THREE.Sprite
  mSharp: THREE.SpriteMaterial
  mBlur: THREE.SpriteMaterial
  bx: number
  by: number
  z: number
  sp: number
  rot0: number
  rs: number
}

const BG = 0x070809
const cc = String.fromCharCode
const SUIT = { spade: cc(9824), heart: cc(9829), diamond: cc(9830), club: cc(9827) }

/**
 * What drifts past.
 *
 * Cards and chips only. There used to be eight product-UI pills in here as well
 * — "Weakest Hands", "Skill Radar", "True Count +3" and so on — floating in
 * space above the headline. They were interface taken out of its interface: a
 * first-time visitor has never seen this product, so none of those labels mean
 * anything yet, and a hero full of unexplained jargon reads as debris rather
 * than as a preview. Cards and chips say "blackjack" without a word.
 *
 * The count is held near the old total on purpose. Dropping eight of eighteen
 * objects and leaving it there would have halved the density of the field, and
 * a scatter that thin reads as an accident rather than a composition.
 */
const DEFS: Def[] = [
  { t: 'card', r: 'A', s: SUIT.spade, red: false },
  { t: 'card', r: 'K', s: SUIT.heart, red: true },
  { t: 'card', r: '10', s: SUIT.diamond, red: true },
  { t: 'card', r: 'Q', s: SUIT.spade, red: false },
  { t: 'card', r: '9', s: SUIT.heart, red: true },
  { t: 'card', r: 'J', s: SUIT.diamond, red: true },
  { t: 'card', r: '7', s: SUIT.club, red: false },
  { t: 'card', r: '5', s: SUIT.diamond, red: true },
  { t: 'card', r: 'A', s: SUIT.heart, red: true },
  { t: 'card', r: '8', s: SUIT.club, red: false },
  // Denominations, not suits. A chip with a heart printed on it is not a thing
  // that exists; a red 5, a green 25 and a black 100 are what anyone who has
  // stood at a table recognises without being told. Repeats are deliberate —
  // real stacks repeat.
  { t: 'chip', c: '5', fill: '#c41e3a', ink: '#ffffff' },
  { t: 'chip', c: '25', fill: '#15803d', ink: '#ffffff' },
  { t: 'chip', c: '100', fill: '#1c1917', ink: '#f2f1ee' },
  { t: 'chip', c: '25', fill: '#15803d', ink: '#ffffff' },
  { t: 'chip', c: '100', fill: '#1c1917', ink: '#f2f1ee' },
]

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath()
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath()
}

/**
 * Lighten (`amount > 0`) or darken a `#rrggbb` toward white or black.
 *
 * Plain arithmetic on purpose — see the note at the gradient that uses it.
 */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const towards = amount > 0 ? 255 : 0
  const k = Math.abs(amount)
  const mix = (c: number) => Math.round(c + (towards - c) * k)
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255)
  return `rgb(${r},${g},${b})`
}

function newCanvas(w: number, h: number): { cv: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  return { cv, x: cv.getContext('2d') as CanvasRenderingContext2D }
}

/**
 * How much dimmer an out-of-focus card is than a sharp one of the same size.
 *
 * A blurred sprite covers several times the area, so at equal opacity it lays
 * down several times the light — that asymmetry is what washed the hero out.
 * But 0.42 went too far the other way and the cards all but vanished; the
 * chips still read while the playing cards did not, which is the wrong half of
 * the composition to lose. 0.7 keeps the correction and the cards.
 */
const BLUR_DIM = 0.7

function cardCanvas(rank: string, suit: string, red: boolean): HTMLCanvasElement {
  const dpr = 2, W = 66 * dpr, H = 92 * dpr, r = 9 * dpr, gm = 26 * dpr, bx = gm, by = gm
  const { cv, x } = newCanvas(W + gm * 2, H + gm * 2)
  x.save(); x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 20 * dpr; x.shadowOffsetY = 5 * dpr; x.fillStyle = '#d3d6da'; roundRect(x, bx, by, W, H, r); x.fill(); x.restore()
  // Muted and *neutral*, not ivory — bright enough to read, dim enough that a big
  // sharp card never flares into a "sun over the hill" flash — but the warmth is
  // gone: measured, the old ivory ran +11 red over blue, and a field of those
  // blurred across the hero cast the whole section brown. The background was
  // never the warm thing; the cards were.
  const g = x.createLinearGradient(0, by, 0, by + H); g.addColorStop(0, '#dcdfe4'); g.addColorStop(1, '#c6cad0')
  roundRect(x, bx, by, W, H, r); x.fillStyle = g; x.fill()
  x.lineWidth = 1 * dpr; x.strokeStyle = 'rgba(0,0,0,.12)'; roundRect(x, bx + 0.5, by + 0.5, W - 1, H - 1, r); x.stroke()
  x.fillStyle = red ? '#c41e3a' : '#16181d'; x.textAlign = 'left'; x.textBaseline = 'top'
  x.font = `700 ${20 * dpr}px Inter, system-ui, sans-serif`; x.fillText(rank, bx + 8 * dpr, by + 7 * dpr)
  x.font = `700 ${17 * dpr}px Georgia, serif`; x.fillText(suit, bx + 8 * dpr, by + 30 * dpr)
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `700 ${46 * dpr}px Georgia, serif`; x.fillText(suit, bx + W / 2, by + H / 2 + 2 * dpr)
  return cv
}

/**
 * A casino chip, in its denomination's colour.
 *
 * Every chip here used to be gold — the same gold gradient, gold rim and gold
 * outer glow, whatever was printed on it. Two things were wrong with that.
 *
 * Gold is this product's accent colour. Spending it on background scenery means
 * it no longer marks the things that matter, and on this page it was being spent
 * four times over on objects drifting past. Real chips are coloured by value —
 * red 5, green 25, black 100 — so they can carry their own colour and the accent
 * goes back to being an accent. The same change was made to the chips on the Pro
 * tile; these were missed, and for a while the page contradicted itself.
 *
 * The outer glow is gone with it. It was a 24px coloured halo baked into the
 * sprite, sitting underneath a scene-wide bloom pass — two glows stacked on one
 * object, which is the thing that reads as cheap.
 */
function chipCanvas(value: string, fill: string, ink: string): HTMLCanvasElement {
  const dpr = 2, D = 64 * dpr, gm = 28 * dpr, cx = gm + D / 2, cy = gm + D / 2, R = D / 2
  const { cv, x } = newCanvas(D + gm * 2, D + gm * 2)

  // A drop shadow, not a glow: it seats the chip in the scene instead of making
  // it emit light.
  x.save()
  x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 18 * dpr; x.shadowOffsetY = 5 * dpr
  x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fillStyle = '#000'; x.fill()
  x.restore()

  const g = x.createRadialGradient(cx - R * 0.34, cy - R * 0.34, R * 0.12, cx, cy, R)
  // Computed here rather than with `color-mix()`: `addColorStop` throws a
  // SyntaxError on any colour the browser cannot parse, so an unsupported
  // function would not degrade — it would take the whole hero down.
  g.addColorStop(0, shade(fill, 0.28))
  g.addColorStop(0.5, fill)
  g.addColorStop(1, shade(fill, -0.28))
  x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fillStyle = g; x.fill()

  x.lineWidth = 3 * dpr; x.strokeStyle = 'rgba(0,0,0,.45)'
  x.beginPath(); x.arc(cx, cy, R - 2 * dpr, 0, 7); x.stroke()

  // Edge spots — the detail that makes a disc read as a chip.
  x.fillStyle = 'rgba(255,255,255,.88)'
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, sx = cx + Math.cos(a) * (R - 6 * dpr), sy = cy + Math.sin(a) * (R - 6 * dpr)
    x.save(); x.translate(sx, sy); x.rotate(a); x.fillRect(-5 * dpr, -2.5 * dpr, 10 * dpr, 5 * dpr); x.restore()
  }

  x.beginPath(); x.arc(cx, cy, R * 0.62, 0, 7)
  x.strokeStyle = 'rgba(255,255,255,.30)'; x.lineWidth = 2 * dpr; x.stroke()

  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle'
  x.font = `800 ${22 * dpr}px Inter, system-ui, sans-serif`
  x.fillText(value, cx, cy + 2 * dpr)
  return cv
}

function blurCopy(src: HTMLCanvasElement, px: number): HTMLCanvasElement {
  const { cv, x } = newCanvas(src.width, src.height)
  x.filter = `blur(${px}px)`; x.drawImage(src, 0, 0)
  return cv
}

function canvasTexture(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Hermite smoothstep — eases 0→1 between edge0 and edge1 (edge0 < edge1). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function spawnX(): number { return (Math.random() * 2 - 1) * 13 + 1.5 }
function spawnY(): number { return (Math.random() * 2 - 1) * 6 + 2 }

export function HeroCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /**
   * Bumped when the GPU hands the context back, which tears this effect down and
   * builds the scene again.
   *
   * Losing the context used to be terminal: the handler hid the canvas and
   * nothing ever brought it back, so a driver reset or a busy first paint left
   * the hero permanently black — the page looked broken and only a reload fixed
   * it. A lost context is a normal thing for a browser to do; not recovering
   * from it is not.
   */
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    } catch {
      return // no WebGL (jsdom / unsupported) — the CSS layers still render.
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    // Cap DPR at 1.5: UnrealBloom runs several full-viewport gaussian passes,
    // and its cost scales with pixel count — dpr 2 on a wide hero can stall the
    // GPU into a context loss. 1.5 stays crisp and keeps the frame budget sane.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    renderer.setPixelRatio(dpr)
    /*
     * Clear to the *linear* form of the page background.
     *
     * Clearing to `BG` directly looks obviously right and is not: the composer
     * renders into a linear target and `OutputPass` converts the result to sRGB
     * on the way out, so a clear of #070809 came back out at roughly #2F3033.
     * Measured against a canvas-off baseline, that put the whole hero 25
     * luminance levels above the page behind it — a pale wash over the entire
     * section that no amount of tuning the cards or the bloom could remove,
     * because it was not coming from them.
     *
     * Converting first means the conversion on the way out lands on the colour
     * that was actually wanted.
     *
     * (A transparent clear also removes the mismatch, and was tried — but with
     * the composer in the path the sprites came out at zero alpha and the hero
     * rendered empty. Opaque and pre-converted keeps both the cards and the
     * colour.)
     */
    renderer.setClearColor(new THREE.Color(BG).convertSRGBToLinear(), 1)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(BG, 8, 40)
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120)

    const disposables: { dispose(): void }[] = []
    const drifters: Drifter[] = DEFS.map((d) => {
      const base = d.t === 'card'
        ? cardCanvas(d.r, d.s, d.red)
        : chipCanvas(d.c, d.fill, d.ink)
      const baseH = d.t === 'card' ? 1.72 : 1.26
      const sx = baseH * (base.width / base.height)
      // One sharp + one blurred sprite, stacked and crossfaded by distance, so
      // the focus pull from soft (far) to crisp (near) is continuous instead of
      // snapping between discrete blur levels.
      const mk = (cv: HTMLCanvasElement): { m: THREE.SpriteMaterial; s: THREE.Sprite } => {
        const tex = canvasTexture(cv)
        const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: true, opacity: 0 })
        disposables.push(tex, m)
        const s = new THREE.Sprite(m)
        s.scale.set(sx, baseH, 1)
        scene.add(s)
        return { m, s }
      }
      const blur = mk(blurCopy(base, 3.5))
      const sharp = mk(base)
      return {
        sharp: sharp.s, blur: blur.s, mSharp: sharp.m, mBlur: blur.m,
        bx: spawnX(), by: spawnY(),
        z: -3 - Math.random() * 38, sp: 2.0 + Math.random() * 1.3,
        rot0: (Math.random() * 2 - 1) * (d.t === 'card' ? 0.28 : 0.5),
        rs: (Math.random() * 2 - 1) * (d.t === 'card' ? 0.06 : 0.16),
      }
    })

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    /*
      No bloom pass.

      It had already been tuned down twice — the previous note here records that
      the original settings lifted the whole frame by 22–38 luminance levels
      over a background meant to sit near 10 — and it ended at strength 0.16
      with a 0.88 threshold. Now that the sprites no longer carry baked coloured
      halos of their own, almost nothing in the scene crosses that threshold, so
      the pass was running several full-viewport gaussian blurs per frame to
      change a handful of pixels.

      Removing it is the honest version of tuning it to nothing, and it takes
      the second half of the double glow with it. A dark scene does not need
      light bleeding off its objects to look expensive; it needs contrast and
      restraint, both of which the halo was working against.
    */
    composer.addPass(new OutputPass())

    const pointer = { x: 0, y: 0 }
    const ptr = { x: 0, y: 0 }
    const onPointer = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onPointer)

    const resize = () => {
      const w = canvas.clientWidth, h = Math.max(1, canvas.clientHeight)
      renderer.setSize(w, h, false)
      composer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', resize)
    resize()

    let raf = 0
    let disposed = false
    let running = false
    let onScreen = true
    let last = performance.now()
    let elapsed = 0

    // If the GPU drops the context (driver reset, or too many contexts after a
    // long hot-reload session), stop cleanly instead of rendering white garbage.
    const onContextLost = (e: Event) => {
      // Preventing the default is what makes the browser willing to give the
      // context back at all; without it there is no restore event to wait for.
      e.preventDefault(); disposed = true; cancelAnimationFrame(raf)
      // Hide the (now frozen/white) canvas so the dark CSS layers show through
      // instead of a white freeze.
      canvas.style.opacity = '0'
    }
    const onContextRestored = () => {
      canvas.style.opacity = ''
      setGeneration(g => g + 1)
    }
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)

    const frame = (now: number) => {
      if (disposed || !onScreen) { running = false; return }
      const dt = Math.min((now - last) / 1000, 0.05); last = now; elapsed += dt
      ptr.x += (pointer.x - ptr.x) * 0.04; ptr.y += (pointer.y - ptr.y) * 0.04
      for (const d of drifters) {
        if (!reduce) {
          d.z += d.sp * dt
          if (d.z > -5) { d.z = -43; d.bx = spawnX(); d.by = spawnY() }
        }
        const dist = -d.z
        // Opacity: emerge from the far dark (smooth fade-in), hold through the
        // mid band, then fade out BEFORE the sprite fills the frame. Narrow
        // window ⇒ only a few objects on screen at once (no bright wash).
        const op = (1 - smoothstep(24, 32, dist)) * smoothstep(9, 15, dist)
        // Focus pull: crossfade blur→sharp.
        //
        // The blurred copy is dimmed rather than carrying the same opacity as
        // the sharp one. Keeping them equal made the two sum to `op` through a
        // single object, which sounds right and is not: the blurred sprite
        // spreads its texture over several times the area, so at equal opacity
        // it deposits several times the light. That is where the pale wash over
        // the whole hero came from — not from any one card being too bright, but
        // from every out-of-focus card being too bright for its size.
        const clarity = 1 - smoothstep(13, 21, dist)
        d.mSharp.opacity = op * clarity
        d.mBlur.opacity = op * (1 - clarity) * BLUR_DIM
        const rot = reduce ? d.rot0 : d.rot0 + elapsed * d.rs
        d.mSharp.rotation = rot; d.mBlur.rotation = rot
        const depth01 = smoothstep(6, 40, dist)
        const par = 1.7 * (0.35 + 0.65 * (1 - depth01))
        const px = d.bx + ptr.x * par, py = d.by - ptr.y * par * 0.6
        d.sharp.position.set(px, py, d.z)
        d.blur.position.set(px, py, d.z)
      }
      composer.render()
      if (!disposed && onScreen && !reduce) raf = requestAnimationFrame(frame)
      else running = false
    }
    const start = () => {
      if (running || disposed || !onScreen) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }

    // Pause the whole render loop whenever the hero scrolls out of view — no
    // point burning GPU on a canvas nobody can see, and it keeps the rest of
    // the (long) landing page scrolling smoothly.
    const io = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting
      if (onScreen) start()
    }, { threshold: 0 })
    io.observe(canvas)
    start()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      io.disconnect()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('resize', resize)
      disposables.forEach((o) => o.dispose())
      composer.dispose()
      renderer.dispose()
      // NB: do NOT call renderer.forceContextLoss() here — it permanently kills
      // the shared <canvas> context, so a StrictMode/HMR remount reuses a dead
      // context and renders white.
    }
  }, [generation])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
