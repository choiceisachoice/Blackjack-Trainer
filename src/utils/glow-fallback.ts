/**
 * Fallback for browsers that don't support CSS @property.
 * Animates --glow-angle-1 and --glow-angle-2 via requestAnimationFrame.
 */
export function initGlowFallback(): void {
  if (typeof CSS !== 'undefined' && typeof CSS.registerProperty === 'function') return;

  let angle1 = 0;
  let angle2 = 180;

  function update() {
    angle1 = (angle1 + 0.45) % 360;
    angle2 = (angle2 + 0.45) % 360;
    const root = document.documentElement.style;
    root.setProperty('--glow-angle-1', `${angle1}deg`);
    root.setProperty('--glow-angle-2', `${angle2}deg`);
    requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}
