import { useSyncExternalStore } from 'react'

/**
 * The media query for a phone, either way up: narrower than Tailwind's `sm`,
 * or a wide box with almost no height (the `short` variant in `index.css`).
 */
export const COMPACT_TABLE_QUERY = '(max-width: 639px), (max-height: 520px) and (orientation: landscape)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mq = window.matchMedia(COMPACT_TABLE_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function snapshot(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(COMPACT_TABLE_QUERY).matches
}

/**
 * Whether the casino table is on a phone-sized screen.
 *
 * For the few things CSS cannot do: a drawn chip has its size in pixels, so
 * the bet panel needs to know to ask for a smaller one. Everything that is
 * only layout stays in classes (`max-sm:`, `short:`).
 *
 * @returns true on a phone, upright or sideways; false where `matchMedia` is missing
 */
export function useCompactTable(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
