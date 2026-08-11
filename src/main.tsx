import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
// Imported for its side effect and before the app: i18next has to be
// initialised before the first component calls `useTranslation`, or that call
// renders raw keys for one frame.
import './i18n'
import App from './App.tsx'
import { initGlowFallback } from './utils/glow-fallback'

initGlowFallback()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
