import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { cardImageUrl, type CardSuitName } from '../cards/card-suits'

/**
 * The landing hero's animated background: playing cards and casino chips
 * drifting toward the camera in real 3D
 * (Three.js — perspective + depth fog +
 * pointer parallax). The canvas is opaque (clears to the app background); the CSS
 * scrim/ambient/vignette layers sit on top. Honours
 * reduced-motion (one static frame) and no-ops where WebGL is unavailable.
 */
type Def =
  | { t: 'card'; r: string; s: string; red: boolean }
  | { t: 'chip'; c: string; fill: string; ink: string }

interface Drifter {
  sharp: THREE.Sprite
  mSharp: THREE.SpriteMaterial
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
  // No black 100s here: a black chip on a black ground is a dark smudge with
  // eight specks round it. Purple 500 is the same convention and can be seen.
  { t: 'chip', c: '500', fill: '#6d28d9', ink: '#ffffff' },
  { t: 'chip', c: '25', fill: '#15803d', ink: '#ffffff' },
  { t: 'chip', c: '5', fill: '#c41e3a', ink: '#ffffff' },
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

const SUIT_NAME: Record<string, CardSuitName> = {
  [SUIT.spade]: 'Spades', [SUIT.heart]: 'Hearts', [SUIT.diamond]: 'Diamonds', [SUIT.club]: 'Clubs',
}

/**
 * A playing card, drawn as the table draws it.
 *
 * These used to be a grey box with a letter and a font's suit glyph — which is
 * what the cards drifting past the headline looked like: placeholders. They
 * are now the product's own card (`components/cards/CardFace`, the same suit
 * paths and pip positions) painted onto a canvas: corner indices, real pips,
 * framed court cards. 250 × 350 units at 2×, so a card that comes close stays
 * sharp.
 */
/** The texture made from each card canvas, so a face that loads later can be shown. */
const PAINTED = new WeakMap<HTMLCanvasElement, THREE.CanvasTexture>()

function cardCanvas(rank: string, suitChar: string): HTMLCanvasElement {
  const k = 2, W = 250 * k, H = 350 * k, gm = 40 * k
  const suit = SUIT_NAME[suitChar] ?? 'Spades'
  const { cv, x } = newCanvas(W + gm * 2, H + gm * 2)
  x.translate(gm, gm); x.scale(k, k)

  // The card: white, a hairline edge, a shadow that seats it in the dark.
  x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 26; x.shadowOffsetY = 8
  x.fillStyle = '#f4f5f7'; roundRect(x, 0, 0, 250, 350, 20); x.fill(); x.restore()
  x.lineWidth = 2; x.strokeStyle = '#c9ced6'; roundRect(x, 1, 1, 248, 348, 19); x.stroke()

  // The face is the standard deck's own card — the same image the product
  // shows everywhere. It is painted when it arrives; until then the card is
  // a blank white one, which is what a card turning over looks like anyway.
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    x.save()
    roundRect(x, 0, 0, 250, 350, 20); x.clip()
    x.drawImage(img, 0, 0, 250, 350)
    x.restore()
    const tex = PAINTED.get(cv)
    if (tex) tex.needsUpdate = true
  }
  img.src = cardImageUrl(rank, suit)
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
        ? cardCanvas(d.r, d.s)
        : chipCanvas(d.c, d.fill, d.ink)
      const baseH = d.t === 'card' ? 1.72 : 1.26
      const sx = baseH * (base.width / base.height)
      const mk = (cv: HTMLCanvasElement): { m: THREE.SpriteMaterial; s: THREE.Sprite } => {
        const tex = canvasTexture(cv)
        PAINTED.set(cv, tex)
        const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: true, opacity: 0 })
        disposables.push(tex, m)
        const s = new THREE.Sprite(m)
        s.scale.set(sx, baseH, 1)
        scene.add(s)
        return { m, s }
      }
      const sharp = mk(base)
      return {
        sharp: sharp.s, mSharp: sharp.m,
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
        const op = (1 - smoothstep(26, 36, dist)) * smoothstep(6, 11, dist)
        // Sharp at every distance. The out-of-focus copy that used to carry
        // the far half of the approach is what read as smudges in the dark
        // (Darius, 15 Nov 2026: "körnig", "schlechte Qualität"); the fog and
        // the fade already say "far away" without it.
        d.mSharp.opacity = op
        const rot = reduce ? d.rot0 : d.rot0 + elapsed * d.rs
        d.mSharp.rotation = rot
        const depth01 = smoothstep(6, 40, dist)
        const par = 1.7 * (0.35 + 0.65 * (1 - depth01))
        const px = d.bx + ptr.x * par, py = d.by - ptr.y * par * 0.6
        d.sharp.position.set(px, py, d.z)
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
