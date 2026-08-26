import { useMemo } from 'react'
import { useAppStore } from '../store/app-store'
import { levelPalette } from '../services/level-palette'
import type { LevelDefinition } from '../services/level-system'

/**
 * A level definition with colours that read on the active theme.
 *
 * `LEVELS` holds one colour per level, tuned for the dark theme. Everything
 * that paints a level — the badge, the dashboard header, the achievements
 * header, the level-up popup — read that colour directly, so on the light
 * theme the top of the ladder rendered at barely above 1:1. Rather than each
 * of those four learning the rule, they take the level through here.
 *
 * Deliberately a hook rather than a change inside the level store: the colour
 * depends on the theme, and the theme can change while a level is on screen.
 *
 * @param level - A level definition, typically from `useLevelStore`
 * @returns The same level, with `color` and `glowColor` fit for the theme
 */
export function useLevelPalette(level: LevelDefinition): LevelDefinition {
  const theme = useAppStore(s => s.theme)
  return useMemo(() => levelPalette(level, theme), [level, theme])
}
