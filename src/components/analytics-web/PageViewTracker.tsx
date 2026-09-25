import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { trackPageView, startHeartbeat } from '../../services/analytics/tracker'

/**
 * Records a page view on every route change, and keeps the heartbeat going
 * while the tab is open.
 *
 * Mounted once, inside the router, above the routes. It renders nothing.
 * The pathname it sends is `window.location.pathname`, not the router's:
 * the router runs under a language basename and reports `/learn` for
 * `/de/learn`, and the report should tell the two apart.
 *
 * The modes inside `/app` are state, not routes, so an hour in the casino
 * session is one page view of `/app`; the heartbeat is what makes that hour
 * count as time on site.
 */
export function PageViewTracker() {
  const { pathname } = useLocation()

  useEffect(() => {
    void trackPageView(window.location.pathname)
  }, [pathname])

  useEffect(() => startHeartbeat(), [])

  return null
}
