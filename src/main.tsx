import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
// Imported for its side effect and before the app: i18next has to be
// initialised before the first component calls `useTranslation`, or that call
// renders raw keys for one frame. It also decides the starting language —
// the one in the URL if there is one — and starts fetching it.
import { localeReady } from './i18n'
import { localeFromPath, unprefixedPath } from './i18n/locales'
import App from './App.tsx'
import { initGlowFallback } from './utils/glow-fallback'
import { isAppPath, routeFor } from './routes/pages'
import { beginPrerenderedBoot, endPrerenderedBoot, releaseBootHold } from './boot/prerendered-boot'

initGlowFallback()

/*
  The router treats a language prefix as its root, so every link inside the
  app stays under it: `/de/learn` is the German page and its links are German.
*/
const pathname = window.location.pathname
const prefix = localeFromPath(pathname)
const path = unprefixedPath(pathname)
const container = document.getElementById('root')!

/*
  Whether the document arrived with the page already in it.

  `scripts/prerender.mjs` marks the root of every page it writes. Over such a
  page the first render must not be a fallback: React clears the container on
  its first commit, and a commit that holds a blank placeholder is the visitor
  watching the page they were reading disappear.
*/
const prerendered = container.dataset.prerendered !== undefined && container.childElementCount > 0

const tree = (
  <StrictMode>
    <BrowserRouter basename={prefix?.basename}>
      <App />
    </BrowserRouter>
  </StrictMode>
)

let mounted = false

function mount() {
  if (mounted) return
  mounted = true
  const root = createRoot(container)

  if (!prerendered) {
    root.render(tree)
    releaseBootHold()
    return
  }

  /*
    One synchronous commit, flagged for its whole length.

    `flushSync` so the markup is replaced inside this call and not in a task
    the browser may paint before; the flag so that what mounts in it stays
    still (`Reveal`, `ScrollToTop`). The scroll position is put back
    afterwards in case the new document measured a pixel differently — the
    visitor may have been reading for a second already.
  */
  const scrollY = window.scrollY
  beginPrerenderedBoot()
  try {
    flushSync(() => root.render(tree))
  } finally {
    endPrerenderedBoot()
  }
  if (window.scrollY !== scrollY) window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' })
  releaseBootHold()
}

/** Resolves after `ms`, for capping a wait that must not hold the screen. */
const after = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms) })

/*
  What the first render waits for, and for how long.

  - A prerendered page: the language and the page's chunk, with no cap. The
    page is on screen and usable as a document the whole time, so there is
    nothing to hurry for; rendering early is what used to blank it.
  - The app (`/app`, `/account`): the language only, briefly. The loading
    screen or the skeleton has to be up at once, and both carry words.
  - The other shell routes (`/login`, `/reset-password`): the language and the
    chunk, capped, so the form is the first thing drawn instead of a spinner
    in front of it. Past the cap the ordinary fallback takes over.

  Neither promise rejects: a language that fails to load leaves English up,
  and a chunk that fails is reported by the route's own boundary.
*/
const route = routeFor(path)
if (prerendered) {
  void Promise.all([localeReady, route?.preload()]).then(mount)
} else if (isAppPath(path)) {
  void Promise.race([localeReady, after(400)]).then(mount)
} else {
  void Promise.race([Promise.all([localeReady, route?.preload()]), after(1500)]).then(mount)
}
