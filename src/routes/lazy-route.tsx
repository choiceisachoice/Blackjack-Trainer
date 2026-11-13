import { lazy, useState, type ComponentType } from 'react'

/** A route component that can be fetched ahead of the render that needs it. */
export type PreloadableRoute = ComponentType & {
  /** Fetch the chunk. Resolves when the page can render without suspending. */
  preload: () => Promise<void>
}

/**
 * `React.lazy`, with a way to have the chunk in hand before the first render.
 *
 * `lazy` always suspends once: even when the module is already in the browser's
 * cache its promise resolves a microtask later, React commits the Suspense
 * fallback, and only then the page. For a client-side navigation that is
 * invisible, because the router wraps navigations in a transition and React
 * keeps the old page up. For the *first* render there is no old page — the
 * fallback is committed, and on a prerendered route it is committed over the
 * page the visitor is already reading. That blank frame, held for React's
 * 300 ms fallback throttle, is the flash this function exists to remove.
 *
 * After `preload()` has resolved the component renders the page directly,
 * with no `lazy` in between, so the first commit *is* the page.
 *
 * The choice is made once per mounted instance (`useState`), not per render.
 * Switching from the lazy element to the direct one on a later render would
 * change the element type under a live page and remount it — losing its state
 * and replaying its effects — the first time anything above it re-rendered
 * after the chunk arrived.
 *
 * @param factory - The dynamic import, mapped to `{ default: Component }`
 */
export function lazyRoute(factory: () => Promise<{ default: ComponentType }>): PreloadableRoute {
  let resolved: ComponentType | null = null
  let pending: Promise<void> | null = null
  const Lazy = lazy(factory)

  function Route() {
    const [Direct] = useState(() => resolved)
    return Direct ? <Direct /> : <Lazy />
  }

  const preload = () => {
    pending ??= factory().then(
      mod => { resolved = mod.default },
      // A chunk that fails to load is the lazy element's problem to report:
      // it will throw the same rejection inside the error boundary, which
      // recognises a stale chunk and offers the reload. Swallowed here so a
      // failed preload cannot hold up the first render.
      () => { pending = null },
    )
    return pending
  }

  return Object.assign(Route, { preload })
}
