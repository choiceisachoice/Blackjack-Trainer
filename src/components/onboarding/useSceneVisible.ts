/**
 * Helpers for scene visibility, fade-in/out, and delayed text appearance.
 */

/** Returns visibility, opacity (with fade-in/out), and progress for a scene. */
export function useSceneVisible(
  currentTime: number,
  start: number,
  end: number,
  fadeInDuration = 0.8
): { visible: boolean; opacity: number; progress: number } {
  const visible = currentTime >= start && currentTime < end
  const progress = visible
    ? Math.min((currentTime - start) / (end - start), 1)
    : 0

  // Fade-in
  const fadeProgress = Math.min((currentTime - start) / fadeInDuration, 1)
  // Fade-out (last 1.5s)
  const fadeOut = currentTime > end - 1.5
    ? Math.max((end - currentTime) / 1.5, 0)
    : 1

  const opacity = visible ? Math.min(fadeProgress, fadeOut) : 0

  return { visible, opacity, progress }
}

/** Returns 0-1 opacity for text that appears at a specific timestamp. */
export function useDelayedVisible(
  currentTime: number,
  appearAt: number
): number {
  const elapsed = currentTime - appearAt
  if (elapsed < 0) return 0
  return Math.min(elapsed / 0.6, 1) // 0.6s fade-in
}
