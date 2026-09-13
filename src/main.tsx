import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
// Imported for its side effect and before the app: i18next has to be
// initialised before the first component calls `useTranslation`, or that call
// renders raw keys for one frame.
import { setLocale } from './i18n'
import { localeFromPath } from './i18n/locales'
import App from './App.tsx'
import { initGlowFallback } from './utils/glow-fallback'

initGlowFallback()

/*
  A language in the URL wins.

  `/de/learn` is the German page — prerendered that way, linked that way from
  every search result and hreflang tag — so the app has to open in German
  there whatever the browser or storage says, and the router has to treat
  `/de` as its root so that every link inside the app stays under it. The
  choice is remembered like any other, so the next plain `/` visit is German
  too. With no prefix, nothing changes: the stored or browser language applies.
*/
const prefix = localeFromPath(window.location.pathname)
if (prefix) void setLocale(prefix.locale)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={prefix?.basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
