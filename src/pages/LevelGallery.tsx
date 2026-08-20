import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LEVELS } from '../services/level-system'
import type { LevelDefinition } from '../services/level-system'
import { useLevelStore } from '../store/level-store'
import { LevelUpPopup } from '../components/navigation/LevelUpPopup'
import { hasSeenLevelIntro } from '../services/level-intro'

/**
 * All twenty-five levels on one screen, and the real popup on demand.
 *
 * Built because the alternative was levelling an account up twenty-five times
 * to answer "what does level 17 look like" — and because the popup lives behind
 * the login, so it cannot be looked at while working on it. Same reasoning as
 * `/dev/loaders`: what you cannot look at, you cannot judge.
 *
 * Two things to see here, and they are different questions:
 *
 * - **The grid** answers "what does it look like to *be* level N" — the colour,
 *   the glow, the name, the tier, and where the tier boundaries fall. Reading
 *   twenty-five of them side by side is the only way to notice that two
 *   neighbouring levels are nearly the same grey.
 * - **Clicking one** puts the real `LevelUpPopup` on screen through the real
 *   store, so what appears is the actual component, not a copy that could
 *   drift. That is also where the "don't show again" button can be checked.
 *
 * DEV-only: routed behind `import.meta.env.DEV` in `App.tsx`, so it is never in
 * a production bundle.
 */
export function LevelGallery() {
  const { t, i18n } = useTranslation()
  const [from, setFrom] = useState<number | null>(null)
  const showLevelUp = useLevelStore(s => s.showLevelUp)

  /** Put the real popup on screen for `to`, arriving from the level below. */
  const preview = (to: LevelDefinition, jump = 1) => {
    const fromLevel = LEVELS[Math.max(0, to.level - 1 - jump)]
    setFrom(to.level)
    useLevelStore.setState({
      showLevelUp: true,
      levelUpData: {
        oldLevel: fromLevel,
        newLevel: to,
        breakdown: [
          { label: 'Speed drill', amount: 75 },
          { label: 'Daily challenge', amount: 100 },
          { label: 'Achievement', amount: 50 },
        ],
      },
    })
  }

  const introSeen = hasSeenLevelIntro()

  return (
    <div className="app-canvas min-h-screen p-6 md:p-10">
      <LevelUpPopup />

      <header className="max-w-6xl mx-auto mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-gold-gradient">Level gallery</h1>
        <p className="mt-1 text-sm text-content/55 max-w-2xl">
          All {LEVELS.length} levels as the player sees them. Click any card to open the real
          level-up popup for it — same component, same store, so nothing here can drift from
          production.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-contrast/8 text-content/60">
            Language: <b className="text-content">{i18n.language}</b>
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-contrast/8 text-content/60">
            Explainer:{' '}
            <b className={introSeen ? 'text-error' : 'text-success'}>
              {introSeen ? 'hidden (button was pressed)' : 'showing'}
            </b>
          </span>
          {/* The button under the explainer writes to localStorage, so checking
              it twice needs a way back. */}
          <button
            onClick={() => {
              localStorage.removeItem('bjt_level_intro_seen')
              window.location.reload()
            }}
            className="px-2.5 py-1 rounded-lg border border-contrast/20 text-content/70
              hover:text-content hover:border-gold/40 cursor-pointer transition-colors"
          >
            Reset explainer
          </button>
          {!showLevelUp && from !== null && (
            <span className="text-content/40">last previewed: Lv.{from}</span>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto grid gap-3 grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
        {LEVELS.map(l => (
          <button
            key={l.level}
            onClick={() => preview(l)}
            data-testid={`level-card-${l.level}`}
            className="text-left rounded-2xl border p-4 cursor-pointer transition-transform
              hover:-translate-y-0.5"
            style={{
              borderColor: `${l.color}55`,
              background: `linear-gradient(180deg, ${l.glowColor}, var(--color-surface))`,
              boxShadow: `0 0 24px -12px ${l.glowColor}`,
            }}
          >
            <div
              className="text-2xl font-extrabold"
              style={{ color: l.color, textShadow: `0 0 18px ${l.glowColor}` }}
            >
              {t('levels.abbr', { n: l.level })}
            </div>
            <div className="mt-1 font-bold leading-tight" style={{ color: l.color }}>
              {t(l.titleKey)}
            </div>
            <div className="mt-2 flex items-center justify-between text-[0.6875rem]">
              <span
                className="px-2 py-0.5 rounded-full font-semibold tracking-wider uppercase"
                style={{ backgroundColor: `${l.color}22`, color: l.color }}
              >
                {t(`levels.tier.${l.tier}`)}
              </span>
              <span className="text-content/40 tabular-nums">
                {l.xpRequired.toLocaleString(i18n.language)} XP
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* A multi-level jump renders an extra line in the popup, and it is the
          case a fresh account actually hits — several levels in one burst. */}
      <div className="max-w-6xl mx-auto mt-8 flex flex-wrap gap-3">
        <button
          onClick={() => preview(LEVELS[4], 4)}
          data-testid="level-jump-preview"
          className="px-4 py-2 rounded-xl border border-gold/40 text-gold text-sm font-semibold
            hover:bg-gold/10 cursor-pointer transition-colors"
        >
          Preview a 4-level jump (1 &rarr; 5)
        </button>
        <button
          onClick={() => preview(LEVELS[LEVELS.length - 1], 1)}
          className="px-4 py-2 rounded-xl border border-contrast/20 text-content/70 text-sm
            hover:text-content cursor-pointer transition-colors"
        >
          Preview the last level (25)
        </button>
      </div>
    </div>
  )
}
