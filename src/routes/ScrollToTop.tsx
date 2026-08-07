import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Start every new page at the top.
 *
 * A single-page app keeps the scroll position across a route change, which is
 * correct for a back button and wrong for everything else. The Terms and
 * Privacy links live in the footer, so following one from the bottom of the
 * landing page dropped you at the bottom of a legal document — past the whole
 * thing you had just asked to read, with no sign that there was anything above.
 *
 * `useLayoutEffect` rather than `useEffect`: this runs before paint, so the new
 * page is never briefly shown at the old offset.
 *
 * Only the document scroller is reset. Screens with their own scroll container
 * — the signed-in app — do not change route when they change view, so there is
 * nothing here for them to do, and reaching into their containers from a
 * router-level component would be guessing at a structure they own.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    // `auto`, never `smooth`: this is arriving somewhere new, not travelling.
    // A smooth scroll would animate the reader away from content they can
    // already see, and it depends on frames that may not run.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [pathname])

  return null
}
