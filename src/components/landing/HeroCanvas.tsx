import { useEffect, useRef } from 'react'

/**
 * The landing hero's animated background: a Linear-style field of product-surface
 * pills, playing cards and gold chips drifting toward the camera in real 3D
 * (perspective + depth fog + depth-of-field blur + glow + pointer parallax),
 * rendered with raw WebGL so it stays dependency-free. Honours reduced-motion
 * (renders a single calm frame) and falls back to nothing if WebGL is absent.
 */
type Tone = 'gold' | 'green' | 'red' | 'neutral'

type Def =
  | { t: 'pill'; l: string; sub?: string; tone: Tone }
  | { t: 'card'; r: string; s: string; red: boolean }
  | { t: 'chip'; c: string }

interface Drifter {
  texs: WebGLTexture[]
  w: number
  h: number
  x: number
  y: number
  z: number
  sp: number
  rot0: number
  rs: number
}

const cc = String.fromCharCode
const SUIT = { spade: cc(9824), heart: cc(9829), diamond: cc(9830), club: cc(9827) }

const TONES: Record<Tone, { glow: string; border: string; dot: string; dotGlow: string }> = {
  gold: { glow: 'rgba(212,168,71,.78)', border: 'rgba(212,168,71,.46)', dot: '#f0cd82', dotGlow: '#d4a847' },
  green: { glow: 'rgba(55,196,107,.42)', border: 'rgba(255,255,255,.12)', dot: '#37c46b', dotGlow: '#37c46b' },
  red: { glow: 'rgba(229,86,107,.42)', border: 'rgba(255,255,255,.12)', dot: '#e5566b', dotGlow: '#e5566b' },
  neutral: { glow: 'rgba(255,255,255,.10)', border: 'rgba(255,255,255,.11)', dot: '#c9ccd2', dotGlow: 'rgba(0,0,0,0)' },
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
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

function newCanvas(w: number, h: number): { cv: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
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
  x.save(); x.shadowColor = t.glow; x.shadowBlur = 30 * dpr; x.fillStyle = 'rgba(0,0,0,1)'
  roundRect(x, bx, by, w, h, r); x.fill(); x.fill(); x.restore()
  const g = x.createLinearGradient(0, by, 0, by + h)
  g.addColorStop(0, 'rgba(32,35,44,.96)'); g.addColorStop(1, 'rgba(15,17,23,.95)')
  roundRect(x, bx, by, w, h, r); x.fillStyle = g; x.fill()
  x.lineWidth = 1.2 * dpr; x.strokeStyle = t.border; roundRect(x, bx + 0.6, by + 0.6, w - 1.2, h - 1.2, r); x.stroke()
  const cy = by + h / 2, dx = bx + padX + dotR
  x.save(); x.shadowColor = t.dotGlow; x.shadowBlur = 10 * dpr
  x.beginPath(); x.arc(dx, cy, dotR, 0, 7); x.fillStyle = t.dot; x.fill(); x.restore()
  x.textBaseline = 'middle'
  const tx = dx + dotR + gap
  x.font = `600 ${fs}px Inter, system-ui, sans-serif`; x.fillStyle = '#eef0f2'; x.fillText(label, tx, cy + 1)
  if (sub) { x.font = `500 ${fs}px Inter, system-ui, sans-serif`; x.fillStyle = '#9a9ea7'; x.fillText('  ' + sub, tx + tw, cy + 1) }
  return cv
}

function cardCanvas(rank: string, suit: string, red: boolean): HTMLCanvasElement {
  const dpr = 2, W = 66 * dpr, H = 92 * dpr, r = 9 * dpr, gm = 26 * dpr, bx = gm, by = gm
  const { cv, x } = newCanvas(W + gm * 2, H + gm * 2)
  x.save(); x.shadowColor = 'rgba(232,232,238,.30)'; x.shadowBlur = 24 * dpr; x.fillStyle = '#fff'; roundRect(x, bx, by, W, H, r); x.fill(); x.restore()
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
  x.save(); x.shadowColor = 'rgba(212,168,71,.72)'; x.shadowBlur = 26 * dpr; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fillStyle = '#000'; x.fill(); x.restore()
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

const VERT = 'attribute vec2 aPos;attribute vec2 aUV;uniform mat4 uProj;uniform vec3 uC;uniform vec2 uS;uniform float uR;varying vec2 vUV;varying float vZ;void main(){float cs=cos(uR),sn=sin(uR);vec2 rp=vec2(aPos.x*cs-aPos.y*sn,aPos.x*sn+aPos.y*cs);vec3 p=vec3(uC.xy+rp*uS,uC.z);gl_Position=uProj*vec4(p,1.0);vUV=aUV;vZ=uC.z;}'
const FRAG = 'precision mediump float;uniform sampler2D uTex;uniform vec3 uFog;uniform float uOp;varying vec2 vUV;varying float vZ;void main(){vec4 t=texture2D(uTex,vUV);float f=clamp((-vZ-6.0)/34.0,0.0,1.0);vec3 rgb=mix(t.rgb,uFog,f*0.8);float a=t.a*uOp*(1.0-f*0.8);gl_FragColor=vec4(rgb,a);}'

function perspective(fovy: number, asp: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan((fovy * Math.PI) / 360), nf = 1 / (near - far)
  return new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0])
}

function spawnX(): number { return (Math.random() * 2 - 1) * 13 + 1.5 }
function spawnY(): number { return (Math.random() * 2 - 1) * 6 + 2 }

export function HeroCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false })
    if (!gl) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

    const compile = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type) as WebGLShader
      gl.shaderSource(s, src); gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram() as WebGLProgram
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog); gl.useProgram(prog)

    const aPos = gl.getAttribLocation(prog, 'aPos')
    const aUV = gl.getAttribLocation(prog, 'aUV')
    const uProj = gl.getUniformLocation(prog, 'uProj')
    const uC = gl.getUniformLocation(prog, 'uC')
    const uS = gl.getUniformLocation(prog, 'uS')
    const uR = gl.getUniformLocation(prog, 'uR')
    const uFog = gl.getUniformLocation(prog, 'uFog')
    const uOp = gl.getUniformLocation(prog, 'uOp')

    const quad = new Float32Array([-0.5, -0.5, 0, 0, 0.5, -0.5, 1, 0, -0.5, 0.5, 0, 1, 0.5, 0.5, 1, 1])
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(aUV); gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8)
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST)
    gl.uniform3f(uFog, 7 / 255, 8 / 255, 9 / 255); gl.uniform1i(uTexUnit(gl, prog), 0)

    const texFrom = (cv: HTMLCanvasElement): WebGLTexture => {
      const t = gl.createTexture() as WebGLTexture
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return t
    }
    const blurCopy = (src: HTMLCanvasElement, px: number): HTMLCanvasElement => {
      const { cv, x } = newCanvas(src.width, src.height)
      x.filter = `blur(${px}px)`; x.drawImage(src, 0, 0)
      return cv
    }

    const textures: WebGLTexture[] = []
    const objs: Drifter[] = DEFS.map((d) => {
      const base = d.t === 'pill' ? pillCanvas(d.l, d.sub, d.tone) : d.t === 'card' ? cardCanvas(d.r, d.s, d.red) : chipCanvas(d.c)
      const baseH = d.t === 'pill' ? 0.98 : d.t === 'card' ? 1.72 : 1.26
      const texs = [texFrom(base), texFrom(blurCopy(base, 2.2)), texFrom(blurCopy(base, 5.5))]
      texs.forEach((t) => textures.push(t))
      return {
        texs, w: baseH * (base.width / base.height), h: baseH,
        x: spawnX(), y: spawnY(), z: -3 - Math.random() * 38, sp: 2.0 + Math.random() * 1.3,
        rot0: d.t === 'pill' ? 0 : (Math.random() * 2 - 1) * (d.t === 'card' ? 0.28 : 0.5),
        rs: d.t === 'pill' ? 0 : (Math.random() * 2 - 1) * (d.t === 'card' ? 0.06 : 0.16),
      }
    })

    const pointer = { x: 0, y: 0 }
    const ptr = { x: 0, y: 0 }
    const onPointer = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onPointer)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth, h = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniformMatrix4fv(uProj, false, perspective(52, w / Math.max(1, h), 0.1, 120))
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
      gl.clearColor(7 / 255, 8 / 255, 9 / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT)
      objs.sort((a, b) => a.z - b.z)
      for (const p of objs) {
        if (!reduce) {
          p.z += p.sp * dt
          if (p.z > -1.6) { p.z = -43; p.x = spawnX(); p.y = spawnY() }
        }
        const f = Math.max(0, Math.min(1, (-p.z - 6) / 34))
        const lvl = f < 0.34 ? 0 : f < 0.64 ? 1 : 2
        const par = 1.7 * (0.35 + 0.65 * (1 - f))
        gl.bindTexture(gl.TEXTURE_2D, p.texs[lvl])
        gl.uniform3f(uC, p.x + ptr.x * par, p.y - ptr.y * par * 0.6, p.z)
        gl.uniform2f(uS, p.w, p.h)
        gl.uniform1f(uR, reduce ? p.rot0 : p.rot0 + elapsed * p.rs)
        gl.uniform1f(uOp, 1.0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
      if (!reduce) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('resize', resize)
      textures.forEach((t) => gl.deleteTexture(t))
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

/** The single sampler uniform, resolved lazily to keep the setup terse. */
function uTexUnit(gl: WebGLRenderingContext, prog: WebGLProgram): WebGLUniformLocation | null {
  return gl.getUniformLocation(prog, 'uTex')
}
