// Record the demo scenes of black-jack-training.com as video files.
//
//   npm run demo:record            # every scene
//   npm run demo:record -- speed   # one or more scenes by name
//
// What this is for: the product videos (the "Alex" coach films) are cut from
// screen recordings of the real app, one clip per scene, and those clips have
// to be reproducible — the same cards, the same pace, the same cursor path
// every time — so a scene can be re-shot in a year without touching the rest.
// A human with a screen recorder cannot promise that. This script can.
//
// How: it starts the app in *offline* mode (no Supabase, every gated mode
// open), seeds the browser with the demo learner from `fixture.mjs`, pins
// `Math.random` to a seed per scene so the shoe and the flashcards deal the
// same way every run, draws a cursor (headless video has none), and drives
// each scene with deliberate pauses. Playwright writes WebM; if ffmpeg is on
// the PATH each clip is also turned into a 1080p30 H.264 MP4.
//
// Nothing here touches the production build: this is a script under
// `scripts/`, it runs against a local dev server, and the app has no idea it
// is being filmed.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { buildDemoStorage } from './fixture.mjs'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'recordings')
const PORT = 5175
const BASE = `http://localhost:${PORT}`
const SIZE = { width: 1920, height: 1080 }

// ── The browser side: seed, cursor, storage ────────────────────────────

/** Runs in every page before the app: deterministic random, no intro, the learner. */
function initScript({ seed, storage }) {
  return `
    (() => {
      // mulberry32 — the same generator the fixture uses, seeded per scene.
      let a = ${seed} >>> 0;
      Math.random = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      // A repeat visit gets no welcome ceremony, and a quick one no bar at all.
      try { sessionStorage.setItem('bjt_intro_seen', '1'); } catch {}
      const storage = ${JSON.stringify(storage)};
      try { for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v); } catch {}

      // The cursor. A headless recording has no pointer, and a product video
      // without one reads as a slideshow. Follows the mouse events Playwright
      // dispatches; a press shrinks it briefly so a click is visible.
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

// ── The dev server ─────────────────────────────────────────────────────

/**
 * A production build in offline mode, served statically.
 *
 * Not the dev server: on a cold start Vite compiles the module graph on the
 * first request and the recording opens on twenty seconds of black and then
 * white. A built bundle loads in under a second, is byte-for-byte what the
 * site ships, and has no HMR client in the page. Built once into
 * `dist-demo` and reused; pass `--rebuild` after a code change.
 */
async function startServer() {
  const dist = path.join(ROOT, 'dist-demo')
  const rebuild = process.argv.includes('--rebuild')
  if (rebuild || !existsSync(path.join(dist, 'index.html'))) {
    console.log('building the app in offline mode …')
    const r = spawnSync('npx', ['vite', 'build', '--mode', 'offline', '--outDir', 'dist-demo', '--logLevel', 'error'], {
      cwd: ROOT, shell: true, stdio: 'inherit', windowsHide: true,
    })
    if (r.status !== 0) throw new Error('vite build failed')
  }
  const child = spawn('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/app`)
      if (res.ok) return child
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 400))
  }
  throw new Error('dev server did not start on port ' + PORT)
}

function stopServer(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}

// ── Driving helpers ────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Move the cursor to an element in a human-looking arc, then click it. */
async function glideClick(page, selector, { settle = 400, hold = 250 } = {}) {
  const loc = page.locator(selector).first()
  await loc.waitFor({ state: 'visible', timeout: 15_000 })
  // Below the fold the box is real but off screen, and a mouse moved there
  // clicks the bottom edge of the viewport instead — which is how the casino
  // take once spent two minutes on the setup page. Bring it up first.
  await loc.scrollIntoViewIfNeeded()
  await sleep(350)
  const box = await loc.boundingBox()
  if (!box) throw new Error(`no box for ${selector}`)
  const x = box.x + box.width * (0.4 + Math.random() * 0.2)
  const y = box.y + box.height * (0.45 + Math.random() * 0.1)
  await page.mouse.move(x, y, { steps: 28 })
  await sleep(hold)
  await page.mouse.down()
  await sleep(70)
  await page.mouse.up()
  await sleep(settle)
}

/** Hover an element without clicking — for pointing at something while Alex talks. */
async function glideHover(page, selector, dwell = 900) {
  const loc = page.locator(selector).first()
  await loc.waitFor({ state: 'visible', timeout: 15_000 })
  await loc.scrollIntoViewIfNeeded()
  await sleep(350)
  const box = await loc.boundingBox()
  if (!box) return
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 })
  await sleep(dwell)
}

/**
 * The moment the scene is on screen. Everything before it — the navigation,
 * the chunk, the first paint — is cut from the clip afterwards, so a scene
 * always opens on the app and never on a loading screen.
 */
function markReady(page) {
  page.__readyAt ??= Date.now()
}

/** Load the app, wait until it is really there, park the cursor mid-screen. */
async function openApp(page, url = `${BASE}/app`) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('[data-testid="nav-home"], header').first().waitFor({ timeout: 30_000 })
  await page.mouse.move(SIZE.width * 0.55, SIZE.height * 0.6)
  await sleep(300)
  markReady(page)
}

/** Open the app at a mode through the nav bar. */
async function openMode(page, mode) {
  await openApp(page)
  await sleep(800)
  await glideClick(page, `[data-testid="nav-${mode}"]`, { settle: 900 })
}

/** Hi-Lo value of a rank as the drill prints it. */
const hiLo = rank => (['2', '3', '4', '5', '6'].includes(rank) ? 1 : ['7', '8', '9'].includes(rank) ? 0 : -1)

// ── Scenes ─────────────────────────────────────────────────────────────

const SCENES = {
  /** The signed-in home: the plan, the mode tiles, a slow look around. */
  async home(page) {
    await openApp(page)
    await sleep(1800)
    await glideHover(page, '[data-testid="mode-card-speedDrill"]', 1000)
    await glideHover(page, '[data-testid="mode-card-deviationTraining"]', 900)
    await glideHover(page, '[data-testid="mode-card-casinoSession"]', 1200)
    await page.mouse.wheel(0, 500)
    await sleep(1600)
    await page.mouse.wheel(0, 500)
    await sleep(1800)
  },

  /** Ten cards at normal speed, then the count typed in — and it is right. */
  async speed(page) {
    await openMode(page, 'speedDrill')
    await sleep(900)
    await glideClick(page, 'button:has-text("10")')
    await glideClick(page, 'button:has-text("Normal")')
    await sleep(500)
    await glideClick(page, '[data-testid="start-drill"]', { settle: 200 })

    // Read every card as it appears so the answer can be the real count.
    const seen = []
    let last = ''
    const input = page.locator('[data-testid="count-input"]')
    while (!(await input.isVisible().catch(() => false))) {
      const rank = await page.locator('.text-4xl.font-bold').first().textContent().catch(() => null)
      if (rank && rank !== last) { seen.push(rank.trim()); last = rank }
      await sleep(40)
    }
    const count = seen.reduce((s, r) => s + hiLo(r), 0)
    await sleep(1400)
    // The stepper, not the keyboard: typing into the number field appended to
    // its 0 and read "02" on tape, and a click per point is what a person
    // counting "plus one, plus one" looks like anyway.
    const stepper = count >= 0 ? 'button[aria-label="Increase count"]' : 'button[aria-label="Decrease count"]'
    for (let i = 0; i < Math.abs(count); i++) await glideClick(page, stepper, { settle: 260, hold: 120 })
    await sleep(700)
    await glideClick(page, '[data-testid="submit-answer"]', { settle: 2600 })
  },

  /** Flashcards on deviations. The seed is chosen so the first hand is 16 against a 10. */
  async flashcards(page) {
    await openMode(page, 'deviationTraining')
    await sleep(700)
    await glideClick(page, 'button:has-text("Deviations")')
    await glideClick(page, 'button:has-text("10")')
    await sleep(400)
    await glideClick(page, '[data-testid="start-training"]', { settle: 1200 })

    for (let i = 0; i < 4; i++) {
      const hand = (await page.locator('[data-testid="player-hand"]').textContent()) ?? ''
      const tcText = (await page.locator('[data-testid="true-count"]').textContent().catch(() => '0')) ?? '0'
      const tc = parseFloat(tcText.replace(/[^\d.+-]/g, '')) || 0
      // Two seconds of thinking, as the script asks for.
      await sleep(2000)
      // 16 v 10: stand from TC 0. Insurance: take it from +3. Otherwise a
      // sensible default, and the feedback screen explains the rest.
      const action = hand.trim() === '16' ? (tc >= 0 ? 'stand' : 'hit')
        : hand.trim() === 'Any' ? (tc >= 3 ? 'insurance' : 'hit')
        : (tc >= 2 ? 'stand' : 'hit')
      await glideClick(page, `[data-testid="action-${action}"]`, { settle: 2600 })
      await glideClick(page, '[data-testid="next-question"]', { settle: 900 })
    }
    await sleep(600)
  },

  /** Analytics: the insight, the trend, the weakest hands, and the hand-off to the drill. */
  async analytics(page) {
    await openMode(page, 'analytics')
    await sleep(2200)
    await page.mouse.wheel(0, 420)
    await sleep(1800)
    await page.mouse.wheel(0, 520)
    await sleep(1400)
    await glideHover(page, '[data-testid="weakest-hands"]', 2200)
    await glideClick(page, '[data-testid="drill-weakest-hands"]', { settle: 2400 })
  },

  /** A casino session: the table setup, a dozen hands, count checks, the summary. */
  async casino(page) {
    await openMode(page, 'casinoSession')
    await sleep(1400)
    // Six hands: enough to see betting, a count check and a review, and the
    // summary still lands inside the clip.
    const hands = page.locator('input[aria-label="Number of hands"]')
    await glideClick(page, 'input[aria-label="Number of hands"]', { settle: 200 })
    await hands.fill('6')
    await sleep(500)
    await glideClick(page, '[data-testid="start-session"]', { settle: 2200 })

    // The recorder keeps the count too, from the cards on the table, so the
    // count check on tape is answered correctly. Every card of a finished hand
    // is face up at settlement; the hand is folded into the totals when the
    // table is cleared for the next bet.
    const readTable = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="felt-table"] span[class*="top-[3px]"] > span:first-child'))
        .map(s => s.textContent.trim()).filter(r => /^(A|K|Q|J|10|[2-9])$/.test(r)))
    let countedRC = 0
    let countedCards = 0
    let pending = null

    const started = Date.now()
    const MAX_MS = 210_000
    while (Date.now() - started < MAX_MS) {
      if (await page.locator('[data-testid="play-again"]').isVisible().catch(() => false)) break
      if (await page.locator('[data-testid="betting-controls"]').isVisible().catch(() => false)) {
        if (pending) {
          countedRC += pending.reduce((s, r) => s + hiLo(r), 0)
          countedCards += pending.length
          pending = null
        }
        // The table minimum: the right bet while the count is flat, so the
        // review line reads "Bet: Correct" rather than scolding the film.
        await sleep(600)
        await glideClick(page, '[data-testid="chip-25"]', { settle: 400 })
        await glideClick(page, '[data-testid="confirm-bet"]', { settle: 600 })
        continue
      }
      if (await page.locator('[data-testid="insurance-controls"]').isVisible().catch(() => false)) {
        await sleep(900)
        await glideClick(page, '[data-testid="insurance-no"]', { settle: 500 })
        continue
      }
      if (await page.locator('[data-testid="count-check"]').isVisible().catch(() => false)) {
        // Two phases share this panel: the inputs, then the feedback with no
        // inputs. Only the first one is answered; the second just plays out.
        if (!(await page.locator('[data-testid="rc-input"]').isVisible().catch(() => false))) { await sleep(300); continue }
        pending = await readTable()
        const rc = countedRC + pending.reduce((s, r) => s + hiLo(r), 0)
        const decksLeft = Math.max(0.5, 6 - (countedCards + pending.length) / 52)
        const tc = Math.round((rc / decksLeft) * 2) / 2
        await sleep(900)
        await glideClick(page, '[data-testid="rc-input"]', { settle: 200 })
        await page.keyboard.type(String(rc), { delay: 140 })
        await glideClick(page, '[data-testid="tc-input"]', { settle: 200 })
        await page.keyboard.type(String(tc), { delay: 140 })
        await sleep(400)
        await glideClick(page, '[data-testid="submit-count"]', { settle: 2400 })
        continue
      }
      if (await page.locator('[data-testid="action-controls"]').isVisible().catch(() => false)) {
        // Basic strategy from what is on the table, so the review line reads
        // "Play: Correct". The dealer's upcard is the first face-up dealer-size
        // card; the hand total is the number the seat prints under the cards.
        const seen = await page.evaluate(() => {
          const rank = el => el?.querySelector('span[class*="top-[3px]"] > span')?.textContent?.trim() ?? null
          const dealerCards = Array.from(document.querySelectorAll('[class*="w-[58px]"]'))
          const up = rank(dealerCards[0])
          const seat = document.querySelector('[data-testid="human-seat"]')
          const totals = Array.from(seat?.querySelectorAll('*') ?? [])
            .map(e => e.childElementCount === 0 ? e.textContent.trim() : '')
            .filter(t => /^\d{1,2}$/.test(t)).map(Number).filter(n => n >= 4 && n <= 21)
          const soft = Array.from(seat?.querySelectorAll('span[class*="top-[3px]"] > span') ?? []).some(s => s.textContent.trim() === 'A')
          return { up, total: totals.length ? Math.max(...totals) : null, soft }
        })
        const upValue = seen.up === 'A' ? 11 : ['J', 'Q', 'K'].includes(seen.up) ? 10 : Number(seen.up) || 10
        const total = seen.total ?? 12
        const enabled = async id => page.locator(`[data-testid="action-${id}"]`).isEnabled().catch(() => false)
        let action = 'hit'
        if (seen.soft && total <= 21) {
          // Soft totals: 19+ stand, 18 stand against 2–8, else hit.
          action = total >= 19 ? 'stand' : total === 18 ? (upValue <= 8 ? 'stand' : 'hit') : 'hit'
        } else if (total >= 17) action = 'stand'
        else if (total >= 13) action = upValue <= 6 ? 'stand' : 'hit'
        else if (total === 12) action = upValue >= 4 && upValue <= 6 ? 'stand' : 'hit'
        else if (total === 11) action = 'double'
        else if (total === 10) action = upValue <= 9 ? 'double' : 'hit'
        else if (total === 9) action = upValue >= 3 && upValue <= 6 ? 'double' : 'hit'
        if (total === 16 && upValue >= 9 && (await enabled('surrender'))) action = 'surrender'
        if (total === 15 && upValue === 10 && (await enabled('surrender'))) action = 'surrender'
        if (action === 'double' && !(await enabled('double'))) action = 'hit'
        await sleep(1100)
        await glideClick(page, `[data-testid="action-${action}"]`, { settle: 700 })
        continue
      }
      if (await page.locator('[data-testid="next-hand"]').isVisible().catch(() => false)) {
        // Settlement or review: the finished hand is fully face up. Read it
        // now; it is folded into the count when the next bet is asked for.
        pending = await readTable()
        await sleep(1600)
        await glideClick(page, '[data-testid="next-hand"]', { settle: 500 })
        continue
      }
      await sleep(200)
    }
    // Leave the summary on screen long enough to read it.
    await sleep(3500)
  },

  /** The strategy chart: S17 to H17, a cell, the deviation layer. */
  async strategy(page) {
    await openMode(page, 'strategyChart')
    await sleep(1600)
    await glideHover(page, '[data-testid="chart-cell"]', 600)
    await page.mouse.wheel(0, 260)
    await sleep(1200)
    await glideClick(page, 'button:has-text("H17")', { settle: 1400 })
    await glideClick(page, 'button:has-text("S17")', { settle: 1000 })
    await glideClick(page, '[data-testid="toggle-deviations"]', { settle: 1800 })
    await page.mouse.wheel(0, 500)
    await sleep(1800)
  },

  /** The landing page, for the closing shot. */
  async landing(page) {
    await openApp(page, `${BASE}/`)
    await sleep(2500)
    await page.mouse.wheel(0, 700)
    await sleep(2000)
    await page.mouse.wheel(0, 900)
    await sleep(2200)
  },
}

/** Seeds per scene. The flashcards seed was searched for by `findSeed` (see below). */
const SEEDS = { home: 11, speed: 4242, flashcards: 0, analytics: 7, casino: 90210, strategy: 3, landing: 5 }

/**
 * Find a seed that makes the flashcards open on a given hand.
 *
 * The seed pins `Math.random`, so the first question is a function of it;
 * trying seeds until the wanted hand comes up is cheaper than reaching into
 * the engine, and the result is written into `SEEDS` for the next run.
 */
async function findSeed(browser, storage, want = { hand: '16', dealer: '10' }) {
  for (let seed = 1; seed < 400; seed++) {
    const context = await browser.newContext({ viewport: SIZE })
    await context.addInitScript(initScript({ seed, storage }))
    const page = await context.newPage()
    await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="nav-deviationTraining"]').click()
    await page.locator('button:has-text("Deviations")').click()
    await page.locator('[data-testid="start-training"]').click()
    const hand = (await page.locator('[data-testid="player-hand"]').textContent()) ?? ''
    const dealer = (await page.locator('[data-testid="dealer-card"]').textContent()) ?? ''
    await context.close()
    if (hand.trim() === want.hand && dealer.trim() === want.dealer) return seed
  }
  throw new Error('no seed found for the wanted hand')
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const wanted = process.argv.slice(2).filter(a => !a.startsWith('-'))
  const names = wanted.length ? wanted : Object.keys(SCENES)
  for (const n of names) if (!SCENES[n]) throw new Error(`unknown scene "${n}" — have: ${Object.keys(SCENES).join(', ')}`)

  await mkdir(OUT, { recursive: true })
  const storage = buildDemoStorage()
  const server = await startServer()
  const browser = await chromium.launch({ headless: true })
  try {
    if (names.includes('flashcards') && SEEDS.flashcards === 0) {
      SEEDS.flashcards = await findSeed(browser, storage)
      console.log(`flashcards: seed ${SEEDS.flashcards} opens on 16 vs 10`)
    }
    const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', shell: true }).status === 0

    for (const name of names) {
      const index = String(Object.keys(SCENES).indexOf(name) + 1).padStart(2, '0')
      const tmp = path.join(OUT, `.tmp-${name}`)
      await rm(tmp, { recursive: true, force: true })
      const context = await browser.newContext({
        viewport: SIZE,
        deviceScaleFactor: 1,
        recordVideo: { dir: tmp, size: SIZE },
        colorScheme: 'dark',
        locale: 'en-US',
      })
      await context.addInitScript(initScript({ seed: SEEDS[name], storage }))
      const page = await context.newPage()
      const t0 = Date.now()
      try {
        await SCENES[name](page)
      } catch (e) {
        console.error(`scene ${name} failed:`, e.message)
      }
      // The recording starts with the context, so the load is on tape; the
      // clip starts where the scene marked itself ready.
      const lead = Math.max(0, ((page.__readyAt ?? t0) - t0) / 1000 - 0.15)
      const video = page.video()
      await context.close()
      const src = await video.path()
      const webm = path.join(OUT, `${index}_${name}.webm`)
      await rename(src, webm)
      await rm(tmp, { recursive: true, force: true })
      let line = `${index}_${name}.webm  ${((Date.now() - t0) / 1000).toFixed(1)}s (lead ${lead.toFixed(1)}s cut)`
      if (ffmpeg) {
        const mp4 = webm.replace(/\.webm$/, '.mp4')
        const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', lead.toFixed(2), '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-an', mp4], { stdio: 'inherit', shell: true })
        line += r.status === 0 ? '  → mp4' : '  (mp4 failed)'
      }
      console.log(line)
    }
  } finally {
    await browser.close()
    stopServer(server)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
