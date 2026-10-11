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

function initScript({ seed, storage }) {
  return `
    (() => {
      let a = ${seed} >>> 0;
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
        Object.assign(c.style, { position: 'fixed', left: '0px', top: '0px', zIndex: '2147483647', pointerEvents: 'none', transform: 'translate(-2px,-2px)', transition: 'transform 80ms ease-out', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))' });
        document.body.appendChild(c);
        window.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, { passive: true });
        window.addEventListener('mousedown', () => { c.style.transform = 'translate(-2px,-2px) scale(0.82)'; }, true);
        window.addEventListener('mouseup', () => { c.style.transform = 'translate(-2px,-2px) scale(1)'; }, true);
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
const SEEDS = { chart: 3, home: 11, flashcards: 0, speed: 4242, casino: 90210 }

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
  for (const n of wanted) if (!SCENES[n]) throw new Error(`unknown scene "${n}" — have: ${Object.keys(SCENES).join(', ')}`)
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
      const dir = path.join(OUT, `.frames-${name}`)
      await rm(dir, { recursive: true, force: true })
      await mkdir(dir, { recursive: true })
      const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-US' })
      await context.addInitScript(initScript({ seed: SEEDS[name], storage }))
      await context.addInitScript(filmStyle)
      const page = await context.newPage()
      await page.clock.install()
      const cdp = await context.newCDPSession(page)
      await cdp.send('Animation.enable')
      const film = new Film(page, cdp, dir)
      const t0 = Date.now()
      try {
        await SCENES[name](film, page)
      } catch (e) {
        console.error(`scene ${name} failed after ${film.n} frames:`, e.message)
      }
      await context.close()
      const mp4 = path.join(OUT, `${name}.mp4`)
      const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit', shell: true })
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
