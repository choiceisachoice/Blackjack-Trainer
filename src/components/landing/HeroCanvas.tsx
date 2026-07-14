import { useEffect, useRef } from 'react'
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
  sprite: THREE.Sprite
  mat: THREE.SpriteMaterial
  texs: THREE.CanvasTexture[]
  bx: number
  by: number
  z: number
  sp: number
  rot0: number
  rs: number
  lvl: number
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

function cardCanvas(rank: string, suit: string, red: boolean): HTMLCanvasElement {
  const dpr = 2, W = 66 * dpr, H = 92 * dpr, r = 9 * dpr, gm = 26 * dpr, bx = gm, by = gm
  const { cv, x } = newCanvas(W + gm * 2, H + gm * 2)
  x.save(); x.shadowColor = 'rgba(232,232,238,.28)'; x.shadowBlur = 22 * dpr; x.fillStyle = '#fff'; roundRect(x, bx, by, W, H, r); x.fill(); x.restore()
  const g = x.createLinearGradient(0, by, 0, by + H); g.addColorStop(0, '#fdfdfc'); g.addColorStop(1, '#eceae4')
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

function spawnX(): number { return (Math.random() * 2 - 1) * 13 + 1.5 }
function spawnY(): number { return (Math.random() * 2 - 1) * 6 + 2 }

export function HeroCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

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
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    renderer.setPixelRatio(dpr)
    renderer.setClearColor(BG, 1)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(BG, 6, 44)
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120)

    const disposables: { dispose(): void }[] = []
    const drifters: Drifter[] = DEFS.map((d) => {
      const base = d.t === 'pill' ? pillCanvas(d.l, d.sub, d.tone) : d.t === 'card' ? cardCanvas(d.r, d.s, d.red) : chipCanvas(d.c)
      const texs = [canvasTexture(base), canvasTexture(blurCopy(base, 2.2)), canvasTexture(blurCopy(base, 5.5))]
      texs.forEach((t) => disposables.push(t))
      const baseH = d.t === 'pill' ? 0.98 : d.t === 'card' ? 1.72 : 1.26
      const mat = new THREE.SpriteMaterial({ map: texs[0], transparent: true, depthTest: false, depthWrite: false, fog: true })
      disposables.push(mat)
      const sprite = new THREE.Sprite(mat)
      sprite.scale.set(baseH * (base.width / base.height), baseH, 1)
      scene.add(sprite)
      return {
        sprite, mat, texs, bx: spawnX(), by: spawnY(),
        z: -3 - Math.random() * 38, sp: 2.0 + Math.random() * 1.3,
        rot0: d.t === 'pill' ? 0 : (Math.random() * 2 - 1) * (d.t === 'card' ? 0.28 : 0.5),
        rs: d.t === 'pill' ? 0 : (Math.random() * 2 - 1) * (d.t === 'card' ? 0.06 : 0.16),
        lvl: 0,
      }
    })

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 0.82)
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
    let last = performance.now()
    let elapsed = 0
    const frame = (now: number) => {
      if (disposed) return
      const dt = Math.min((now - last) / 1000, 0.05); last = now; elapsed += dt
      ptr.x += (pointer.x - ptr.x) * 0.04; ptr.y += (pointer.y - ptr.y) * 0.04
      for (const d of drifters) {
        if (!reduce) {
          d.z += d.sp * dt
          if (d.z > -1.6) { d.z = -43; d.bx = spawnX(); d.by = spawnY() }
        }
        const f = Math.max(0, Math.min(1, (-d.z - 6) / 34))
        const lvl = f < 0.34 ? 0 : f < 0.64 ? 1 : 2
        if (lvl !== d.lvl) { d.lvl = lvl; d.mat.map = d.texs[lvl] }
        // Fade in from the fog AND fade out as a sprite passes very close, so a
        // near white card can't bloom into a giant blob.
        const near = Math.min(1, Math.max(0, (-d.z - 2) / 7))
        d.mat.opacity = (1 - f * 0.65) * near
        d.mat.rotation = reduce ? d.rot0 : d.rot0 + elapsed * d.rs
        const par = 1.7 * (0.35 + 0.65 * (1 - f))
        d.sprite.position.set(d.bx + ptr.x * par, d.by - ptr.y * par * 0.6, d.z)
      }
      composer.render()
      if (!reduce) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('resize', resize)
      disposables.forEach((o) => o.dispose())
      bloom.dispose()
      composer.dispose()
      renderer.dispose()
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
