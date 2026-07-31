import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/**
 * The landing hero's animated background: a Linear-style field of product-surface
 * pills, playing cards and gold chips drifting toward the camera in real 3D
 * (Three.js — perspective + depth fog + depth-of-field blur + UnrealBloom glow +
 * pointer parallax). The canvas is opaque (clears to the app background) so bloom
 * composites cleanly; the CSS scrim/ambient/vignette layers sit on top. Honours
 * reduced-motion (one static frame) and no-ops where WebGL is unavailable.
 */
type Tone = 'gold' | 'green' | 'red' | 'neutral'

type Def =
  | { t: 'pill'; l: string; sub?: string; tone: Tone }
  | { t: 'card'; r: string; s: string; red: boolean }
  | { t: 'chip'; c: string }

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

const TONES: Record<Tone, { glow: string; border: string; dot: string; dotGlow: string }> = {
  gold: { glow: 'rgba(212,168,71,.7)', border: 'rgba(212,168,71,.46)', dot: '#f0cd82', dotGlow: '#d4a847' },
  green: { glow: 'rgba(55,196,107,.4)', border: 'rgba(255,255,255,.12)', dot: '#37c46b', dotGlow: '#37c46b' },
  red: { glow: 'rgba(229,86,107,.4)', border: 'rgba(255,255,255,.12)', dot: '#e5566b', dotGlow: '#e5566b' },
  neutral: { glow: 'rgba(255,255,255,.08)', border: 'rgba(255,255,255,.11)', dot: '#c9ccd2', dotGlow: 'rgba(0,0,0,0)' },
}

const DEFS: Def[] = [
  { t: 'pill', l: 'Awards', tone: 'gold' },
  { t: 'pill', l: 'Analytics', tone: 'green' },
  { t: 'pill', l: 'Strategy Chart', tone: 'gold' },
  { t: 'pill', l: 'Learn', tone: 'neutral' },
  { t: 'pill', l: 'True Count', sub: '+3', tone: 'gold' },
  { t: 'pill', l: 'Skill Radar', tone: 'green' },
  { t: 'pill', l: 'Weakest Hands', tone: 'red' },
  { t: 'pill', l: 'Illustrious 18', tone: 'gold' },
  { t: 'card', r: 'A', s: SUIT.spade, red: false },
  { t: 'card', r: 'K', s: SUIT.heart, red: true },
  { t: 'card', r: '10', s: SUIT.diamond, red: true },
  { t: 'card', r: 'Q', s: SUIT.spade, red: false },
  { t: 'card', r: '9', s: SUIT.heart, red: true },
  { t: 'card', r: 'J', s: SUIT.diamond, red: true },
  { t: 'chip', c: SUIT.spade },
  { t: 'chip', c: '25' },
  { t: 'chip', c: SUIT.heart },
  { t: 'chip', c: SUIT.club },
]

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath()
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath()
}

function newCanvas(w: number, h: number): { cv: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  return { cv, x: cv.getContext('2d') as CanvasRenderingContext2D }
}

function pillCanvas(label: string, sub: string | undefined, tone: Tone): HTMLCanvasElement {
  const dpr = 2, fs = 17 * dpr, padX = 18 * dpr, padY = 11 * dpr, dotR = 5 * dpr, gap = 11 * dpr, gm = 30 * dpr
  const t = TONES[tone]
  const m = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
  m.font = `600 ${fs}px Inter, system-ui, sans-serif`
  const tw = m.measureText(label).width
  const subw = sub ? m.measureText('  ' + sub).width : 0
  const w = Math.ceil(dotR * 2 + gap + tw + subw + padX * 2)
  const h = Math.ceil(fs + padY * 2)
  const { cv, x } = newCanvas(w + gm * 2, h + gm * 2)
  const bx = gm, by = gm, r = h / 2
  x.save(); x.shadowColor = t.glow; x.shadowBlur = 26 * dpr; x.fillStyle = 'rgba(0,0,0,1)'; roundRect(x, bx, by, w, h, r); x.fill(); x.restore()
  const g = x.createLinearGradient(0, by, 0, by + h)
  g.addColorStop(0, 'rgba(32,35,44,.96)'); g.addColorStop(1, 'rgba(15,17,23,.95)')
  roundRect(x, bx, by, w, h, r); x.fillStyle = g; x.fill()
  x.lineWidth = 1.2 * dpr; x.strokeStyle = t.border; roundRect(x, bx + 0.6, by + 0.6, w - 1.2, h - 1.2, r); x.stroke()
  const cy = by + h / 2, dx = bx + padX + dotR
  x.save(); x.shadowColor = t.dotGlow; x.shadowBlur = 10 * dpr; x.beginPath(); x.arc(dx, cy, dotR, 0, 7); x.fillStyle = t.dot; x.fill(); x.restore()
  x.textBaseline = 'middle'
  const tx = dx + dotR + gap
  x.font = `600 ${fs}px Inter, system-ui, sans-serif`; x.fillStyle = '#eef0f2'; x.fillText(label, tx, cy + 1)
  if (sub) { x.font = `500 ${fs}px Inter, system-ui, sans-serif`; x.fillStyle = '#9a9ea7'; x.fillText('  ' + sub, tx + tw, cy + 1) }
  return cv
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
  // Muted and *neutral*, not ivory. Still below the bloom threshold so a big
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

function chipCanvas(center: string): HTMLCanvasElement {
  const dpr = 2, D = 64 * dpr, gm = 28 * dpr, cx = gm + D / 2, cy = gm + D / 2, R = D / 2
  const { cv, x } = newCanvas(D + gm * 2, D + gm * 2)
  x.save(); x.shadowColor = 'rgba(212,168,71,.6)'; x.shadowBlur = 24 * dpr; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fillStyle = '#000'; x.fill(); x.restore()
  const g = x.createRadialGradient(cx - R * 0.32, cy - R * 0.32, R * 0.15, cx, cy, R)
  g.addColorStop(0, '#f6dc98'); g.addColorStop(0.55, '#d8ad4e'); g.addColorStop(1, '#a9781f')
  x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fillStyle = g; x.fill()
  x.lineWidth = 3 * dpr; x.strokeStyle = 'rgba(120,84,20,.7)'; x.beginPath(); x.arc(cx, cy, R - 2 * dpr, 0, 7); x.stroke()
  x.fillStyle = 'rgba(255,248,226,.85)'
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, sx = cx + Math.cos(a) * (R - 6 * dpr), sy = cy + Math.sin(a) * (R - 6 * dpr)
    x.save(); x.translate(sx, sy); x.rotate(a); x.fillRect(-5 * dpr, -2.5 * dpr, 10 * dpr, 5 * dpr); x.restore()
  }
  x.beginPath(); x.arc(cx, cy, R * 0.62, 0, 7); x.strokeStyle = 'rgba(120,84,20,.55)'; x.lineWidth = 2 * dpr; x.stroke()
  x.fillStyle = '#4a3410'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `800 ${22 * dpr}px Georgia, serif`; x.fillText(center, cx, cy + 2 * dpr)
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
      const base = d.t === 'pill' ? pillCanvas(d.l, d.sub, d.tone) : d.t === 'card' ? cardCanvas(d.r, d.s, d.red) : chipCanvas(d.c)
      const baseH = d.t === 'pill' ? 0.98 : d.t === 'card' ? 1.72 : 1.26
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
        rot0: d.t === 'pill' ? 0 : (Math.random() * 2 - 1) * (d.t === 'card' ? 0.28 : 0.5),
        rs: d.t === 'pill' ? 0 : (Math.random() * 2 - 1) * (d.t === 'card' ? 0.06 : 0.16),
      }
    })

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    // Strength and threshold both pulled well down. Measured against a
    // canvas-off baseline, the old settings lifted the whole hero by 22–38
    // luminance levels over a background that should sit near 10 — a wash
    // across the entire frame rather than a glow on anything in particular.
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.4, 0.88)
    composer.addPass(bloom)
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
      bloom.dispose()
      composer.dispose()
      renderer.dispose()
      // NB: do NOT call renderer.forceContextLoss() here — it permanently kills
      // the shared <canvas> context, so a StrictMode/HMR remount reuses a dead
      // context and renders white.
    }
  }, [generation])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
