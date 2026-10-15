// Film the product frame by frame: 1920×1080, exactly 30 frames a second,
// every frame a screenshot taken while the page's clock stands still.
//
//   npm run demo:film              # every scene
//   npm run demo:film -- chart     # one or more scenes by name
//   --rebuild                      # rebuild dist-demo first (after a code change)
//
// Why not `record.mjs`: Playwright's screencast writes a frame when something
// changed, at whatever pace the page happened to repaint, and a mouse moved in
// 28 steps arrives in a tenth of a second. On tape that is a cursor that jumps,
// a scroll that snaps and a card that lands with a hitch — "it stutters". Here
// the clock is ours. Each frame: the camera (cursor, scroll, zoom) is eased to
// where it belongs at that instant, the page's own time is advanced by one
// thirtieth of a second (timers, requestAnimationFrame, performance.now — so
// the app's framer-motion deals and drill timers run at their real pace), CSS
// transitions are slowed to the capture rate, and the frame is written. The
// result is as smooth as the film it is cut into, and reproducible: the same
// scene is the same footage a year from now.
//
// Same offline build, same demo learner and seeds as `record.mjs`; nothing
// here touches the app.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { buildDemoStorage } from './fixture.mjs'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'recordings', 'film')
const PORT = 5176
const BASE = `http://localhost:${PORT}`
const FPS = 30
const SIZE = { width: 1920, height: 1080 }

// ── The browser side: seed, cursor, storage (as in record.mjs) ───────────

function initScript({ seed, storage, ripple = false, cursorScale = 1 }) {
  return `
    (() => {
      // A seed in the URL hash (#seed=123) wins: the seed search reloads one page instead of opening contexts.
      const hs = /seed=(\\d+)/.exec(location.hash);
      let a = (hs ? +hs[1] : ${seed}) >>> 0;
      Math.random = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      try { sessionStorage.setItem('bjt_intro_seen', '1'); } catch {}
      const storage = ${JSON.stringify(storage)};
      try { for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v); } catch {}
      // The cursor: outside #root, so the camera's zoom does not move it.
      const draw = () => {
        if (!document.body || document.getElementById('__demo-cursor')) return;
        const c = document.createElement('div');
        c.id = '__demo-cursor';
        c.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M2 2 L2 24 L8 18 L12 28 L16 26 L12 17 L20 17 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        const k = ${cursorScale};
        Object.assign(c.style, { position: 'fixed', left: '0px', top: '0px', zIndex: '2147483647', pointerEvents: 'none', transformOrigin: '2px 2px', transform: 'translate(-2px,-2px) scale(' + k + ')', transition: 'transform 80ms ease-out', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))' });
        document.body.appendChild(c);
        window.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, { passive: true });
        window.addEventListener('mousedown', e => {
          c.style.transform = 'translate(-2px,-2px) scale(' + (0.82 * k) + ')';
          // A click you can see: a gold ring opening from the tip (Web Animations, so the film's clock drives it).
          if (${ripple}) {
            const r = document.createElement('div');
            Object.assign(r.style, { position: 'fixed', left: (e.clientX - 18) + 'px', top: (e.clientY - 18) + 'px', width: '36px', height: '36px', borderRadius: '50%', border: '3px solid rgba(240,205,130,0.95)', boxShadow: '0 0 12px rgba(240,205,130,0.6)', pointerEvents: 'none', zIndex: '2147483646', boxSizing: 'border-box' });
            document.body.appendChild(r);
            r.animate([{ transform: 'scale(0.4)', opacity: 1 }, { transform: 'scale(2.1)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(0.2,0.8,0.25,1)', fill: 'forwards' }).onfinish = () => r.remove();
          }
        }, true);
        window.addEventListener('mouseup', () => { c.style.transform = 'translate(-2px,-2px) scale(' + k + ')'; }, true);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', draw); else draw();
    })();
  `
}

/** A flat ground to film on (record.mjs's rules at zoom 1), and no smooth scrolling: the camera scrolls. */
function filmStyle() {
  document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style')
    style.textContent =
      'html { scroll-behavior: auto !important; }' +
      '.app-canvas { background-image: none !important; }' +
      'div[aria-hidden].-z-10.pointer-events-none { display: none !important; }'
    document.head.appendChild(style)
  })
}

// ── The server (as in record.mjs, on its own port) ─────────────────────

async function startServer() {
  const dist = path.join(ROOT, 'dist-demo')
  const rebuild = process.argv.includes('--rebuild')
  if (rebuild || !existsSync(path.join(dist, 'index.html'))) {
    console.log('building the app in offline mode …')
    const r = spawnSync('npx', ['vite', 'build', '--mode', 'offline', '--outDir', 'dist-demo', '--logLevel', 'error'], { cwd: ROOT, shell: true, stdio: 'inherit', windowsHide: true })
    if (r.status !== 0) throw new Error('vite build failed')
  }
  const child = spawn('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', String(PORT), '--strictPort'], { cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try { if ((await fetch(`${BASE}/app`)).ok) return child } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 400))
  }
  throw new Error('server did not start on port ' + PORT)
}

function stopServer(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── The camera ─────────────────────────────────────────────────────────

const easeInOut = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const easeOut = p => 1 - Math.pow(1 - p, 3)

/**
 * One scene's clock and camera. `cursor` is where the pointer is, `scroll`
 * the page's scrollY, `zoom` a scale about a point of the page (document
 * pixels). Tweens run over whole frames; `frame()` writes one picture.
 */
class Film {
  constructor(page, cdp, dir) {
    this.page = page
    this.cdp = cdp
    this.dir = dir
    this.n = 0
    this.cursor = { x: 1100, y: 820 }
    this.scroll = 0
    this.zoom = { z: 1, ox: 960, oy: 540 }
    this.realMs = 120
    this.notes = []
  }

  get seconds() { return this.n / FPS }

  /** Advance the page by one frame and write it. */
  async frame() {
    const t0 = Date.now()
    // CSS transitions (hover tints, the pressed cursor) run on the compositor's own
    // clock; slowing them to the capture pace keeps a 150 ms hover at 150 ms on tape.
    await this.cdp.send('Animation.setPlaybackRate', { playbackRate: Math.min(1, (1000 / FPS) / this.realMs) })
    await this.page.mouse.move(this.cursor.x, this.cursor.y)
    await this.page.evaluate(cam => {
      // The app scrolls an inner element, not the window: scroll whichever one `scroller()` tagged.
      const sc = document.querySelector('[data-film-scroller]') ?? document.scrollingElement ?? document.documentElement
      sc.scrollTop = cam.y
      const root = document.getElementById('root')
      if (root) {
        if (cam.z === 1) { root.style.transform = ''; root.style.transformOrigin = '' } else {
          root.style.transformOrigin = `${cam.ox}px ${cam.oy}px`
          root.style.transform = `scale(${cam.z})`
        }
      }
    }, { y: this.scroll, z: this.zoom.z, ox: this.zoom.ox, oy: this.zoom.oy })
    await this.page.clock.runFor(Math.round(1000 / FPS))
    await this.page.screenshot({ path: path.join(this.dir, `f${String(this.n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90, caret: 'hide' })
    this.n++
    this.realMs = Math.max(20, Date.now() - t0)
  }

  /** `seconds` of frames, `fn(progress)` before each (progress 0 → 1 over the span). */
  async run(seconds, fn) {
    const frames = Math.max(1, Math.round(seconds * FPS))
    for (let i = 0; i < frames; i++) {
      fn?.((i + 1) / frames)
      await this.frame()
    }
  }

  hold(seconds) { return this.run(seconds) }

  /** The pointer glides to a point in a slight arc. */
  async glide(x, y, seconds = 1.0) {
    const from = { ...this.cursor }
    const lift = Math.min(60, Math.hypot(x - from.x, y - from.y) * 0.12)
    await this.run(seconds, p => {
      const k = easeInOut(p)
      this.cursor = { x: from.x + (x - from.x) * k, y: from.y + (y - from.y) * k - Math.sin(p * Math.PI) * lift }
    })
  }

  async scrollTo(y, seconds = 1.6) {
    const from = this.scroll
    await this.run(seconds, p => { this.scroll = Math.round(from + (y - from) * easeInOut(p)) })
  }

  /** Zoom to `z` about a document point; the point stays where it is on screen. */
  async zoomTo(z, ox, oy, seconds = 1.6) {
    const from = this.zoom.z
    const o = { ox: ox ?? this.zoom.ox, oy: oy ?? this.zoom.oy }
    await this.run(seconds, p => { this.zoom = { z: from + (z - from) * easeInOut(p), ...o } })
  }

  /**
   * Tag the element that scrolls the given content (the nearest scrollable ancestor, or the
   * document) so the camera scrolls the right box, and return how far it can scroll.
   */
  async scroller(selector) {
    return this.page.evaluate(sel => {
      document.querySelectorAll('[data-film-scroller]').forEach(e => e.removeAttribute('data-film-scroller'))
      let el = document.querySelector(sel)
      while (el && el !== document.body) {
        const o = getComputedStyle(el).overflowY
        if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 2) break
        el = el.parentElement
      }
      const sc = el && el !== document.body ? el : (document.scrollingElement ?? document.documentElement)
      sc.setAttribute('data-film-scroller', '1')
      return { tag: sc.tagName + (sc.className ? '.' + String(sc.className).split(' ')[0] : ''), max: sc.scrollHeight - sc.clientHeight }
    }, selector)
  }

  /** The top of an element in the scroller's content, in pixels: what `scrollTo` wants. */
  async topOf(selector) {
    return this.page.evaluate(sel => {
      const el = document.querySelector(sel)
      const sc = document.querySelector('[data-film-scroller]')
      if (!el) return null
      const r = el.getBoundingClientRect()
      const base = sc ? sc.getBoundingClientRect().top - sc.scrollTop : -window.scrollY
      return r.top - base
    }, selector)
  }

  /** Where an element is, in viewport pixels (the camera's zoom undone by the browser's hit-testing). */
  async box(selector) {
    const loc = this.page.locator(selector).first()
    await loc.waitFor({ state: 'visible', timeout: 15_000 })
    const b = await loc.boundingBox()
    if (!b) throw new Error(`no box for ${selector}`)
    return b
  }

  /** Glide onto an element and press it; `settle` seconds afterwards. Below the fold, the camera scrolls it up first. */
  async click(selector, { glide = 0.9, hold = 0.25, settle = 0.5, at = [0.5, 0.5] } = {}) {
    let b = await this.box(selector)
    if (b.y < 70 || b.y + b.height > SIZE.height - 40) {
      const sc = await this.scroller(selector)
      const top = await this.topOf(selector)
      await this.scrollTo(Math.min(sc.max, Math.max(0, Math.round(top - SIZE.height * 0.55))), 1.1)
      b = await this.box(selector)
    }
    await this.glide(b.x + b.width * at[0], b.y + b.height * at[1], glide)
    await this.hold(hold)
    await this.page.mouse.down()
    await this.hold(2 / FPS)
    await this.page.mouse.up()
    await this.hold(settle)
  }

  /** Keep filming until the element shows (or `max` seconds pass). */
  async until(selector, max = 8) {
    const loc = this.page.locator(selector).first()
    for (let i = 0; i < max * FPS; i++) {
      if (await loc.isVisible().catch(() => false)) return true
      await this.frame()
    }
    return false
  }

  note(s) { this.notes.push(`${this.seconds.toFixed(2)}s ${s}`) }
}

/**
 * The portrait camera, for the shorts. The page is laid out in a phone-shaped
 * viewport and the camera is a proper one: a focus point of the page held at
 * the frame's centre and a zoom, both eased, applied as translate + scale on
 * #root. The pointer lives in page coordinates and is mapped through the
 * camera every frame, so a glide that runs while the camera zooms still ends
 * exactly on the button it was sent to.
 */
class PortraitFilm extends Film {
  constructor(page, cdp, dir, view) {
    super(page, cdp, dir)
    this.view = view
    this.cam = { z: 1, fx: view.width / 2, fy: view.height / 2 }
    this.pc = { x: view.width * 0.82, y: view.height * 0.9 }
  }

  screen(p) {
    return { x: this.view.width / 2 + (p.x - this.cam.fx) * this.cam.z, y: this.view.height / 2 + (p.y - this.cam.fy) * this.cam.z }
  }

  async frame() {
    const t0 = Date.now()
    await this.cdp.send('Animation.setPlaybackRate', { playbackRate: Math.min(1, (1000 / FPS) / this.realMs) })
    const s = this.screen(this.pc)
    await this.page.mouse.move(s.x, s.y)
    const { z, fx, fy } = this.cam
    await this.page.evaluate(c => {
      const sc = document.querySelector('[data-film-scroller]')
      if (sc) sc.scrollTop = c.y
      const root = document.getElementById('root')
      if (root) {
        root.style.transformOrigin = '0 0'
        root.style.transform = `translate(${c.tx}px, ${c.ty}px) scale(${c.z})`
      }
    }, { y: this.scroll, z, tx: this.view.width / 2 - fx * z, ty: this.view.height / 2 - fy * z })
    await this.page.clock.runFor(Math.round(1000 / FPS))
    await this.page.screenshot({ path: path.join(this.dir, `f${String(this.n).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92, caret: 'hide' })
    this.n++
    this.realMs = Math.max(20, Date.now() - t0)
  }

  /** The page point of an element (its box mapped back through the camera), at a fraction of its box. */
  async pt(selector, at = [0.5, 0.5]) {
    const b = await this.box(selector)
    const sx = b.x + b.width * at[0], sy = b.y + b.height * at[1]
    return { x: this.cam.fx + (sx - this.view.width / 2) / this.cam.z, y: this.cam.fy + (sy - this.view.height / 2) / this.cam.z }
  }

  /**
   * Everything at once, eased together: the pointer to a page point (in a
   * slight arc), the camera to a zoom and a focus point, the inner scroller
   * to a position. Any of them may be left out.
   */
  async move(seconds, { to, z, fx, fy, scroll, ease = easeInOut } = {}) {
    const p0 = { ...this.pc }, c0 = { ...this.cam }, s0 = this.scroll
    const lift = to ? Math.min(40, Math.hypot(to.x - p0.x, to.y - p0.y) * 0.1) : 0
    await this.run(seconds, p => {
      const k = ease(p)
      if (to) this.pc = { x: p0.x + (to.x - p0.x) * k, y: p0.y + (to.y - p0.y) * k - Math.sin(p * Math.PI) * lift }
      this.cam = { z: z === undefined ? c0.z : c0.z + (z - c0.z) * k, fx: fx === undefined ? c0.fx : c0.fx + (fx - c0.fx) * k, fy: fy === undefined ? c0.fy : c0.fy + (fy - c0.fy) * k }
      if (scroll !== undefined) this.scroll = Math.round(s0 + (scroll - s0) * k)
    })
  }

  /** A slow push while nothing else happens: the frame never stands still. */
  drift(seconds, dz = 0.03) { return this.move(seconds, { z: this.cam.z + dz, ease: p => p }) }

  /** Press where the pointer is. */
  async press(settle = 0.3) {
    const s = this.screen(this.pc)
    await this.page.mouse.move(s.x, s.y)
    await this.page.mouse.down()
    await this.hold(2 / FPS)
    await this.page.mouse.up()
    await this.hold(settle)
  }
}

/**
 * Portrait viewports: CSS size and device scale, both giving a 1080×1920 frame —
 * or, with `--4k`, twice the device scale and a 2160×3840 frame (the shorts are
 * rendered in 4K; a 1080 take scaled up reads soft).
 */
const K4 = process.argv.includes('--4k')
const PHONE = { width: 540, height: 960, dsf: K4 ? 4 : 2 }
/** The strategy chart needs 600 CSS px across (it scrolls sideways below that). */
const PHONE_WIDE = { width: 600, height: 1067, dsf: K4 ? 3.6 : 1.8 }

// ── Loading (real time, before the clock is stopped) ───────────────────

async function openApp(page, url = `${BASE}/app`) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('[data-testid="nav-home"], header').first().waitFor({ timeout: 30_000 })
  await page.mouse.move(1100, 820)
  await sleep(400)
}

async function openMode(page, mode) {
  await openApp(page)
  await sleep(300)
  await page.locator(`[data-testid="nav-${mode}"]`).first().click()
  await sleep(700)
}

/** Stop the page's clock: from here every frame advances it by one thirtieth of a second. */
async function freeze(page) {
  await page.clock.pauseAt(Date.now() + 60_000)
}

const hiLo = rank => (['2', '3', '4', '5', '6'].includes(rank) ? 1 : ['7', '8', '9'].includes(rank) ? 0 : -1)

// ── Scenes (virtual seconds in the comments) ───────────────────────────

const SCENES = {
  /**
   * The strategy chart, 22 s: the pointer finds 16 against a 10, the camera
   * pushes into the cell and back out, then glides down through the soft
   * totals and the pairs and home again.
   */
  async chart(film, page) {
    await openMode(page, 'strategyChart')
    await freeze(page)
    const cell = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('div.grid'))
      const row = rows.find(r => r.firstElementChild?.textContent?.trim() === '16')
      const b = row?.querySelectorAll('button')[8]
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, sy: window.scrollY }
    })
    if (!cell) throw new Error('no 16 vs 10 cell')
    const sc = await film.scroller('[data-testid="chart-cell"]')
    await page.evaluate(() => {
      for (const h of document.querySelectorAll('h3')) {
        const txt = h.textContent ?? ''
        if (/soft/i.test(txt) && !document.querySelector('[data-film-soft]')) h.setAttribute('data-film-soft', '1')
        if (/pair/i.test(txt) && !document.querySelector('[data-film-pairs]')) h.setAttribute('data-film-pairs', '1')
      }
    })
    const tops = { soft: await film.topOf('[data-film-soft]'), pairs: await film.topOf('[data-film-pairs]') }
    film.note(`cell ${Math.round(cell.x)},${Math.round(cell.y)} scroller ${sc.tag} max ${sc.max} soft ${tops.soft} pairs ${tops.pairs}`)
    await film.hold(0.8)
    await film.glide(cell.x, cell.y, 1.3)
    await film.hold(0.7)
    await film.zoomTo(1.55, cell.x, cell.y + cell.sy, 1.8)
    await film.hold(2.4)
    await film.zoomTo(1.0, cell.x, cell.y + cell.sy, 1.5)
    await film.hold(0.4)
    const c0 = { ...film.cursor }
    // Down to the soft totals, the pointer drifting aside so it does not sit on the numbers.
    const softY = Math.min(sc.max, Math.max(0, (tops.soft ?? 700) - 110))
    const from = film.scroll
    await film.run(2.0, p => { const k = easeInOut(p); film.scroll = Math.round(from + (softY - from) * k); film.cursor = { x: c0.x + (1480 - c0.x) * k, y: c0.y + (760 - c0.y) * k } })
    await film.hold(1.6)
    await film.scrollTo(Math.min(sc.max, Math.max(0, (tops.pairs ?? 1300) - 110)), 2.0)
    await film.hold(1.9)
    await film.scrollTo(0, 2.4)
    await film.hold(1.5)
  },

  /** The signed-in home, 8 s: the plan and the mode tiles, a slow look around. */
  async home(film, page) {
    await openApp(page)
    await freeze(page)
    const sc = await film.scroller('[data-testid="mode-card-speedDrill"]')
    film.note(`scroller ${sc.tag} max ${sc.max}`)
    await film.hold(1.0)
    const a = await film.box('[data-testid="mode-card-speedDrill"]')
    await film.glide(a.x + a.width * 0.5, a.y + a.height * 0.55, 1.3)
    await film.hold(0.5)
    const b = await film.box('[data-testid="mode-card-casinoSession"]')
    await film.glide(b.x + b.width * 0.5, b.y + b.height * 0.55, 1.2)
    await film.hold(0.6)
    await film.scrollTo(Math.min(sc.max, 420), 2.0)
    await film.hold(1.4)
  },

  /**
   * Flashcards on the learner's weakest hands, 14 s: the setup names them
   * (16 vs 10 first), the drill opens on 16 against a 10, the right answer,
   * the feedback, the next hand.
   */
  async flashcards(film, page) {
    await openMode(page, 'analytics')
    await page.locator('[data-testid="drill-weakest-hands"]').first().click()
    await page.locator('[data-testid="start-training"]').first().waitFor({ timeout: 15_000 })
    await sleep(500)
    await freeze(page)
    await film.hold(1.3)
    await film.click('[data-testid="start-training"]', { settle: 0.3 })
    for (let i = 0; i < 2; i++) {
      if (!(await film.until('[data-testid="player-hand"]', 4))) break
      if (i === 0) {
        // The question card is a compact panel; the camera pushes in so it fills the frame.
        const card = await film.box('[data-testid="player-hand"]')
        await film.zoomTo(1.6, card.x - 60, card.y + 150, 1.2)
      }
      const hand = ((await page.locator('[data-testid="player-hand"]').textContent()) ?? '').trim()
      const dealer = ((await page.locator('[data-testid="dealer-card"]').textContent()) ?? '').trim()
      const tcText = (await page.locator('[data-testid="true-count"]').textContent().catch(() => '0')) ?? '0'
      const tc = parseFloat(tcText.replace(/[^\d.+-]/g, '')) || 0
      // The Illustrious 18 for the hands the fixture calls weak; below the index, basic strategy.
      const action = hand === '16' && dealer === '10' ? (tc >= 0 ? 'stand' : 'hit')
        : hand === '15' && dealer === '10' ? (tc >= 4 ? 'stand' : 'hit')
        : hand === '12' && dealer === '3' ? (tc >= 2 ? 'stand' : 'hit')
        : hand === '11' && dealer === 'A' ? (tc >= 1 ? 'double' : 'hit')
        : hand === 'Any' ? (tc >= 3 ? 'insurance' : 'hit')
        : (tc >= 2 ? 'stand' : 'hit')
      await film.hold(1.7)
      await film.click(`[data-testid="action-${action}"]`, { settle: 0.4 })
      const verdict = ((await page.locator('[data-testid="feedback-result"]').textContent().catch(() => '')) ?? '').trim()
      film.note(`${hand} vs ${dealer} at ${tcText.trim()} → ${action}: ${verdict}`)
      await film.hold(i === 0 ? 2.2 : 2.4)
      if (i === 0) await film.click('[data-testid="next-question"]', { settle: 0.4 })
    }
    await film.hold(0.8)
  },

  /** The speed drill, 10 s: ten cards at normal speed, the pointer parked. */
  async speed(film, page) {
    await openMode(page, 'speedDrill')
    await page.locator('button:has-text("10")').first().click()
    await page.locator('button:has-text("Normal")').first().click()
    await sleep(400)
    await freeze(page)
    await film.hold(0.6)
    await film.click('[data-testid="start-drill"]', { settle: 0.2 })
    // The card is drawn small; the camera pushes in on it while the pointer leaves the frame.
    const c0 = { ...film.cursor }
    const z0 = film.zoom.z
    await film.run(1.0, p => { const k = easeInOut(p); film.cursor = { x: c0.x + (1700 - c0.x) * k, y: c0.y + (1040 - c0.y) * k }; film.zoom = { z: z0 + (1.7 - z0) * k, ox: 960, oy: 430 } })
    await film.hold(8.2)
  },

  /**
   * A casino session, 16 s: a bet, the deal sliding in, the right play, the
   * next hand — the count kept from the table so every line on tape is correct.
   */
  async casino(film, page) {
    await openMode(page, 'casinoSession')
    await page.locator('input[aria-label="Number of hands"]').first().fill('6')
    await sleep(400)
    await freeze(page)
    await film.hold(0.5)
    await film.click('[data-testid="start-session"]', { settle: 0.6 })
    const upValueOf = up => (up === 'A' ? 11 : ['J', 'Q', 'K'].includes(up) ? 10 : Number(up) || 10)
    const seen = () => page.evaluate(() => {
      const rank = el => el?.querySelector('span[class*="top-[3px]"] > span')?.textContent?.trim() ?? null
      const dealerCards = Array.from(document.querySelectorAll('[class*="w-[58px]"]'))
      const up = rank(dealerCards[0])
      const seat = document.querySelector('[data-testid="human-seat"]')
      const totals = Array.from(seat?.querySelectorAll('*') ?? [])
        .map(e => (e.childElementCount === 0 ? e.textContent.trim() : ''))
        .filter(t => /^\d{1,2}$/.test(t)).map(Number).filter(n => n >= 4 && n <= 21)
      const soft = Array.from(seat?.querySelectorAll('span[class*="top-[3px]"] > span') ?? []).some(s => s.textContent.trim() === 'A')
      return { up, total: totals.length ? Math.max(...totals) : null, soft }
    })
    const vis = sel => page.locator(sel).first().isVisible().catch(() => false)
    const enabled = sel => page.locator(sel).first().isEnabled().catch(() => false)
    let hands = 0
    while (film.seconds < 15.2) {
      if (await vis('[data-testid="betting-controls"]')) {
        if (hands >= 2) break
        await film.hold(0.5)
        await film.click('[data-testid="chip-25"]', { settle: 0.3 })
        await film.click('[data-testid="confirm-bet"]', { glide: 0.7, settle: 0.3 })
        hands++
        continue
      }
      if (await vis('[data-testid="insurance-controls"]')) { await film.hold(0.8); await film.click('[data-testid="insurance-no"]', { settle: 0.3 }); continue }
      if (await vis('[data-testid="count-check"]')) {
        // A count check mid-clip would need typing; the film cuts before one is likely, and if it comes we just let it play.
        await film.hold(0.5)
        continue
      }
      if (await vis('[data-testid="action-controls"]')) {
        const s = await seen()
        const upValue = upValueOf(s.up)
        const total = s.total ?? 12
        let action = 'hit'
        if (s.soft && total <= 21) action = total >= 19 ? 'stand' : total === 18 ? (upValue <= 8 ? 'stand' : 'hit') : 'hit'
        else if (total >= 17) action = 'stand'
        else if (total >= 13) action = upValue <= 6 ? 'stand' : 'hit'
        else if (total === 12) action = upValue >= 4 && upValue <= 6 ? 'stand' : 'hit'
        else if (total === 11) action = 'double'
        else if (total === 10) action = upValue <= 9 ? 'double' : 'hit'
        else if (total === 9) action = upValue >= 3 && upValue <= 6 ? 'double' : 'hit'
        if (total === 16 && upValue >= 9 && (await enabled('[data-testid="action-surrender"]'))) action = 'surrender'
        if (total === 15 && upValue === 10 && (await enabled('[data-testid="action-surrender"]'))) action = 'surrender'
        if (action === 'double' && !(await enabled('[data-testid="action-double"]'))) action = 'hit'
        film.note(`hand ${total}${s.soft ? ' soft' : ''} vs ${s.up} → ${action}`)
        await film.hold(1.1)
        await film.click(`[data-testid="action-${action}"]`, { settle: 0.5 })
        continue
      }
      if (await vis('[data-testid="next-hand"]')) {
        await film.hold(1.6)
        await film.click('[data-testid="next-hand"]', { settle: 0.4 })
        continue
      }
      await film.frame()
    }
    await film.glide(1700, 980, 0.8)
    await film.hold(1.0)
  },
}

/** Seeds per scene; 0 means "search" (the flashcards must open on 16 against a 10 — the hand the film is about). */
/**
 * A flashcard answered on camera, portrait: the question fills the frame, the
 * pointer glides onto the right button while the camera leans toward the
 * buttons, a visible click, then the camera pushes into the verdict.
 */
/** The widest zoom that still shows the whole of an element across the frame (with a margin). */
async function fitZoom(page, selector, view, margin = 28) {
  const w = await page.evaluate(sel => {
    const el = document.querySelector(sel)
    const box = (el?.closest('.surface') ?? el)?.getBoundingClientRect()
    return box ? box.width : 0
  }, selector)
  return w > 0 ? Math.min(1.5, (view.width - 2 * margin) / w) : 1
}

/** Open the casino with six hands and wait at the betting controls (real time, before the clock stops). */
async function openCasinoBetting(page) {
  await openMode(page, 'casinoSession')
  await page.locator('input[aria-label="Number of hands"]').first().fill('6')
  await page.locator('[data-testid="start-session"]').first().scrollIntoViewIfNeeded()
  await page.locator('[data-testid="start-session"]').first().click()
  await page.locator('[data-testid="betting-controls"]').first().waitFor({ timeout: 10_000 })
  await sleep(600)
  await freeze(page)
}

/** The bet on camera: in on the chips, the 25 chip, Deal. */
async function betOnCamera(film, page) {
  const chip = await film.pt('[data-testid="chip-25"]')
  const deal = await film.pt('[data-testid="confirm-bet"]')
  film.cam = { z: 1.7, fx: (chip.x + deal.x) / 2, fy: (chip.y + deal.y) / 2 }
  await film.move(0.8, { to: chip, z: 1.75 })
  await film.press(0.2)
  await film.move(0.55, { to: deal })
  await film.press(0.1)
}

/**
 * Where to hold the camera on the table: between the dealer's cards (the top
 * fifth of the felt) and the player's own seat, leaning toward the seat.
 */
async function tableFocus(film, page) {
  const felt = await film.box('[data-testid="felt-table"]')
  const seat = await film.pt('[data-testid="human-seat"]')
  const top = await film.pt('[data-testid="felt-table"]', [0.5, 0.06])
  const W = film.view.width
  // From just above the dealer's cards to just below the seat, with a margin: the zoom that fits it.
  const y0 = top.y, y1 = seat.y + 70
  const z = Math.min(1.95, (film.view.height * 0.9) / (y1 - y0))
  return { fx: (W / 2 + seat.x) / 2, fy: (y0 + y1) / 2, z, dealerY: top.y + 40, felt }
}

async function flashOnCamera(film, page, action) {
  const W = film.view.width
  // The question panel exactly fills the frame's width; the camera never cuts a line of it.
  const z = await fitZoom(page, '[data-testid="player-hand"]', film.view)
  const panel = await film.pt('[data-testid="player-hand"]')
  film.cam = { z, fx: W / 2, fy: panel.y + 90 }
  await film.drift(0.9, 0.02)
  const btn = await film.pt(`[data-testid="action-${action}"]`)
  await film.move(1.0, { to: btn, z: z + 0.05, fy: btn.y - 60 })
  await film.hold(0.2)
  await film.press(0.25)
  const verdict = ((await page.locator('[data-testid="feedback-result"]').textContent().catch(() => '')) ?? '').trim()
  film.note(`answered ${action}: ${verdict} (zoom ${z.toFixed(2)})`)
  const zv = await fitZoom(page, '[data-testid="feedback-result"]', film.view)
  const res = await film.pt('[data-testid="feedback-result"]')
  await film.move(0.8, { to: { x: W * 0.84, y: res.y + 330 }, z: zv, fx: W / 2, fy: res.y + 110, ease: easeOut })
  await film.drift(2.6, 0.04)
}

/** Open the flashcards at basic level and start; the seed decides the first hand. */
async function openFlashBasic(page) {
  await openMode(page, 'deviationTraining')
  await page.locator('[data-testid="start-training"]').first().click()
  await page.locator('[data-testid="player-hand"]').first().waitFor({ timeout: 10_000 })
  await sleep(500)
}

const PORTRAIT = {
  /** 16 against a 10 (the weakest-hands drill opens on it), answered Hit. */
  async 'p-sixteen'(film, page) {
    await openMode(page, 'analytics')
    await page.locator('[data-testid="drill-weakest-hands"]').first().click()
    await page.locator('[data-testid="start-training"]').first().click()
    await page.locator('[data-testid="player-hand"]').first().waitFor({ timeout: 10_000 })
    await sleep(500)
    await freeze(page)
    await flashOnCamera(film, page, 'hit')
  },
  /** 11 against a 6, answered Double. */
  async 'p-double'(film, page) {
    await openFlashBasic(page)
    await freeze(page)
    await flashOnCamera(film, page, 'double')
  },
  /** A,7 against a 9, answered Hit. */
  async 'p-soft'(film, page) {
    await openFlashBasic(page)
    await freeze(page)
    await flashOnCamera(film, page, 'hit')
  },
  /** The chart, close: hard totals, a glide down to the soft hands and pairs, one cell tapped. */
  async 'p-chart'(film, page) {
    await openMode(page, 'strategyChart')
    await sleep(400)
    await freeze(page)
    const sc = await film.scroller('[data-testid="chart-cell"]')
    const W = film.view.width
    const hard = await film.pt('[data-testid="chart-cell"]')
    film.cam = { z: 1.0, fx: W / 2, fy: hard.y + 60 }
    await film.drift(0.7, 0.03)
    await page.evaluate(() => {
      for (const h of document.querySelectorAll('h3')) if (/soft/i.test(h.textContent ?? '')) { h.setAttribute('data-film-soft', '1'); break }
    })
    const softTop = await film.topOf('[data-film-soft]')
    await film.move(1.6, { scroll: Math.min(sc.max, Math.max(0, Math.round(softTop - 120))), z: 1.04, fx: W / 2 })
    // A,7 against a 9: the soft hand the short is about, if this is the soft short — any cell reads as "every hand".
    const cell = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('div.grid'))
      const row = rows.find(r => r.firstElementChild?.textContent?.trim() === 'A,7')
      const b = row?.querySelectorAll('button')[7]
      if (!b) return null
      b.setAttribute('data-film-cell', '1')
      return true
    })
    if (cell) {
      const p = await film.pt('[data-film-cell]')
      await film.move(0.9, { to: p, z: 1.55, fx: W / 2 + (p.x - W / 2) * 0.4, fy: p.y })
      await film.hold(0.15)
      await film.press(0.3)
    }
    await film.move(0.7, { to: { x: W * 0.88, y: film.pc.y + 220 }, z: 1.08, fx: W / 2, ease: easeOut })
    await film.drift(1.6, 0.04)
  },
  /** A casino hand, close: the chip, the deal, the dealer's card and your seat filling the frame. */
  async 'p-casino'(film, page) {
    await openCasinoBetting(page)
    const W = film.view.width
    await betOnCamera(film, page)
    await film.hold(0.2)
    const f = await tableFocus(film, page)
    await film.move(1.0, { to: { x: W * 0.9, y: f.fy + 260 }, z: f.z, fx: f.fx, fy: f.fy })
    await film.drift(2.4, 0.04)
  },
  /** The dealer shows an ace: the insurance question at a real table, answered No. */
  async 'p-insurance'(film, page) {
    await openCasinoBetting(page)
    const W = film.view.width
    await betOnCamera(film, page)
    await film.hold(0.2)
    const f = await tableFocus(film, page)
    await film.move(1.0, { to: { x: W * 0.9, y: f.fy + 260 }, z: f.z, fx: f.fx, fy: f.fy })
    if (!(await film.until('[data-testid="insurance-controls"]', 6))) film.note('no insurance question - wrong seed?')
    await film.hold(0.5)
    const no = await film.pt('[data-testid="insurance-no"]')
    await film.move(1.0, { to: no, z: 1.45, fx: W / 2, fy: (f.dealerY + no.y) / 2 })
    await film.hold(0.2)
    await film.press(0.35)
    await film.drift(1.8, 0.03)
  },
  /** The rules a trainer should teach on: Blackjack pays switched from 6:5 to 3:2, close. */
  async 'p-rules'(film, page) {
    await openMode(page, 'casinoSession')
    const pays = '[role="group"][aria-label="Blackjack pays"]'
    await page.locator(`${pays} button:has-text("6:5")`).first().click()
    await sleep(400)
    await freeze(page)
    const W = film.view.width
    const sc = await film.scroller(pays)
    const top = await film.topOf(pays)
    film.scroll = Math.min(sc.max, Math.max(0, Math.round(top - film.view.height * 0.45)))
    await film.hold(0.05)
    // The label and the two buttons in one frame, then in on the buttons.
    const g = await film.pt(pays)
    film.cam = { z: 1.12, fx: W / 2, fy: g.y }
    await film.drift(0.8, 0.02)
    const three = await film.pt(`${pays} button:has-text("3:2")`)
    await film.move(1.1, { to: three, z: 1.9, fx: g.x - 10, fy: g.y })
    await film.hold(0.2)
    await film.press(0.5)
    await film.move(0.8, { to: { x: three.x + 70, y: three.y + 120 }, z: 2.0, ease: easeOut })
    await film.drift(1.6, 0.03)
  },
}

/**
 * Find a seed under which the basic flashcards open on the wanted hand: one
 * page, reloaded with the seed in the hash, so a try costs a page load.
 */
async function findBasicSeed(browser, storage, view, want) {
  const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-US' })
  await context.addInitScript(initScript({ seed: 1, storage }))
  const page = await context.newPage()
  try {
    for (let seed = 1; seed < 3000; seed++) {
      await page.goto(`${BASE}/app?s=${seed}#seed=${seed}`, { waitUntil: 'domcontentloaded' })
      await page.locator('[data-testid="nav-deviationTraining"]').first().click()
      await page.locator('[data-testid="start-training"]').first().click()
      const hand = ((await page.locator('[data-testid="player-hand"]').first().textContent({ timeout: 5000 }).catch(() => '')) ?? '').trim()
      const dealer = ((await page.locator('[data-testid="dealer-card"]').first().textContent().catch(() => '')) ?? '').trim()
      if (hand === want.hand && dealer === want.dealer) return seed
    }
  } finally {
    await context.close()
  }
  throw new Error(`no seed opens the basic flashcards on ${want.hand} vs ${want.dealer}`)
}

const SEEDS = { chart: 3, home: 11, flashcards: 0, speed: 4242, casino: 90210, 'p-sixteen': 20, 'p-double': 57, 'p-soft': 186, 'p-chart': 3, 'p-casino': 90210, 'p-insurance': 20, 'p-rules': 90210 }
const PORTRAIT_VIEW = { 'p-sixteen': PHONE, 'p-double': PHONE, 'p-soft': PHONE, 'p-chart': PHONE_WIDE, 'p-casino': PHONE, 'p-insurance': PHONE, 'p-rules': PHONE }
const BASIC_WANT = { 'p-double': { hand: '11', dealer: '6' }, 'p-soft': { hand: 'A,7', dealer: '9' } }

/**
 * Find a seed under which the first casino hand shows a dealer ace (the
 * insurance question): one page, reloaded with the seed in the hash.
 */
async function findInsuranceSeed(browser, storage, view) {
  const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-US' })
  await context.addInitScript(initScript({ seed: 1, storage }))
  const page = await context.newPage()
  try {
    for (let seed = 1; seed < 400; seed++) {
      await page.goto(`${BASE}/app?s=${seed}#seed=${seed}`, { waitUntil: 'domcontentloaded' })
      await page.locator('[data-testid="nav-casinoSession"]').first().click()
      await page.locator('input[aria-label="Number of hands"]').first().fill('6')
      await page.locator('[data-testid="start-session"]').first().click()
      await page.locator('[data-testid="chip-25"]').first().click({ timeout: 8000 })
      await page.locator('[data-testid="confirm-bet"]').first().click()
      const ins = page.locator('[data-testid="insurance-controls"]').first()
      const act = page.locator('[data-testid="action-controls"], [data-testid="next-hand"]').first()
      await Promise.race([ins.waitFor({ timeout: 6000 }), act.waitFor({ timeout: 6000 })]).catch(() => {})
      if (await ins.isVisible().catch(() => false)) return seed
    }
  } finally {
    await context.close()
  }
  throw new Error('no seed opens the casino on a dealer ace')
}

/**
 * Find a seed under which the weakest-hands drill opens on the wanted hand.
 * The focus drill draws from three hands, so a handful of tries is enough.
 */
async function findFlashcardsSeed(browser, storage, want = { hand: '16', dealer: '10', maxTc: -0.5 }) {
  for (let seed = 1; seed < 200; seed++) {
    const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-US' })
    await context.addInitScript(initScript({ seed, storage }))
    const page = await context.newPage()
    try {
      await openMode(page, 'analytics')
      await page.locator('[data-testid="drill-weakest-hands"]').first().click()
      await page.locator('[data-testid="start-training"]').first().click()
      await page.locator('[data-testid="player-hand"]').first().waitFor({ timeout: 10_000 })
      const hand = ((await page.locator('[data-testid="player-hand"]').textContent()) ?? '').trim()
      const dealer = ((await page.locator('[data-testid="dealer-card"]').textContent()) ?? '').trim()
      const tcText = (await page.locator('[data-testid="true-count"]').textContent().catch(() => '0')) ?? '0'
      const tc = parseFloat(tcText.replace(/[^\d.+-]/g, '')) || 0
      // Below the index: the answer on tape is the one the film teaches (hit), not the deviation.
      if (hand === want.hand && dealer === want.dealer && (want.maxTc === undefined || tc <= want.maxTc)) return seed
    } catch { /* try the next */ } finally {
      await context.close()
    }
  }
  throw new Error('no seed opens the flashcards on the wanted hand')
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const names = process.argv.slice(2).filter(a => !a.startsWith('-'))
  const wanted = names.length ? names : Object.keys(SCENES)
  for (const n of wanted) if (!SCENES[n] && !PORTRAIT[n]) throw new Error(`unknown scene "${n}" — have: ${[...Object.keys(SCENES), ...Object.keys(PORTRAIT)].join(', ')}`)
  await mkdir(OUT, { recursive: true })
  const storage = buildDemoStorage()
  const server = await startServer()
  const browser = await chromium.launch({ headless: true })
  try {
    if (wanted.includes('flashcards') && !SEEDS.flashcards) {
      SEEDS.flashcards = await findFlashcardsSeed(browser, storage)
      console.log(`flashcards: seed ${SEEDS.flashcards} opens on 16 vs 10`)
    }
    for (const name of wanted) {
      if (name === 'p-insurance' && !SEEDS[name]) {
        SEEDS[name] = await findInsuranceSeed(browser, storage, PORTRAIT_VIEW[name])
        console.log(`${name}: seed ${SEEDS[name]} opens on a dealer ace`)
      }
      if (BASIC_WANT[name] && !SEEDS[name]) {
        SEEDS[name] = await findBasicSeed(browser, storage, PORTRAIT_VIEW[name], BASIC_WANT[name])
        console.log(`${name}: seed ${SEEDS[name]} opens on ${BASIC_WANT[name].hand} vs ${BASIC_WANT[name].dealer}`)
      }
      const portrait = PORTRAIT_VIEW[name]
      const dir = path.join(OUT, `.frames-${name}`)
      await rm(dir, { recursive: true, force: true })
      await mkdir(dir, { recursive: true })
      const context = await browser.newContext({
        viewport: portrait ? { width: portrait.width, height: portrait.height } : SIZE,
        deviceScaleFactor: portrait ? portrait.dsf : 1, colorScheme: 'dark', locale: 'en-US',
      })
      await context.addInitScript(initScript({ seed: SEEDS[name], storage, ripple: !!portrait, cursorScale: portrait ? 1.25 : 1 }))
      await context.addInitScript(filmStyle)
      const page = await context.newPage()
      await page.clock.install()
      const cdp = await context.newCDPSession(page)
      await cdp.send('Animation.enable')
      const film = portrait ? new PortraitFilm(page, cdp, dir, portrait) : new Film(page, cdp, dir)
      const t0 = Date.now()
      try {
        await (portrait ? PORTRAIT : SCENES)[name](film, page)
      } catch (e) {
        console.error(`scene ${name} failed after ${film.n} frames:`, e.message)
      }
      await context.close()
      const mp4 = path.join(OUT, `${name}${portrait && K4 ? '-4k' : ''}.mp4`)
      // A portrait frame is 1080×1920 (a 1.8× screenshot of 600×1067 comes out a pixel taller: cropped); 2160×3840 with --4k.
      const vf = portrait ? ['-vf', K4 ? 'scale=2160:-2,crop=2160:3840:0:0' : 'scale=1080:-2,crop=1080:1920:0:0'] : []
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.jpg'), ...vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit', shell: true })
      if (r.status === 0) await rm(dir, { recursive: true, force: true })
      console.log(`${name}.mp4  ${film.seconds.toFixed(1)} s of film, ${film.n} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s real${r.status === 0 ? '' : '  (ffmpeg failed; frames kept)'}`)
      for (const n of film.notes) console.log('   ' + n)
    }
  } finally {
    await browser.close()
    stopServer(server)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
