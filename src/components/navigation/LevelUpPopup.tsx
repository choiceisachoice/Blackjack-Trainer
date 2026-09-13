import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { useLevelStore } from '../../store/level-store'
import { useLiveSessionStore } from '../../store/live-session-store'
import { hasSeenLevelIntro, markLevelIntroSeen } from '../../services/level-intro'
import { levelAvatarId } from '../../services/avatar-catalog'
import { Avatar } from '../common/Avatar'

const TIER_LABEL_KEY: Record<string, string> = {
  beginner: 'levels.tier.beginner',
  mid: 'levels.tier.mid',
  advanced: 'levels.tier.advanced',
  elite: 'levels.tier.elite',
}

const TIER_ICONS: Record<string, string> = {
  beginner: '\uD83C\uDCCF',
  mid: '\u2660\uFE0F',
  advanced: '\uD83D\uDCB0',
  elite: '\uD83C\uDCCF',
}

/** How many of a multi-level run are drawn. The rest is said in words. */
const MAX_PICTURES_SHOWN = 4

/**
 * The pictures this level-up unlocked, and the way to the page that sets one.
 *
 * The button is rendered only inside a router: the popup is also rendered
 * in the dev gallery and in tests without one, and a `useNavigate` outside
 * a router throws. The pictures themselves need no router and always show.
 */
function NewPictures({ from, to, onLeave }: { from: number; to: number; onLeave: () => void }) {
  const { t } = useTranslation()
  const inRouter = useInRouterContext()
  const levels = Array.from({ length: to - from }, (_, i) => from + 1 + i)
  if (levels.length === 0) return null
  const shown = levels.slice(-MAX_PICTURES_SHOWN)
  return (
    <div className="mb-7" data-testid="level-up-pictures">
      <div className="text-xs uppercase tracking-[2px] text-content/50 font-semibold mb-3">
        {levels.length === 1 ? t('levels.newPicture') : t('levels.newPictures', { n: levels.length })}
      </div>
      <div className="flex items-center justify-center gap-2">
        {shown.map(level => (
          <Avatar key={level} id={levelAvatarId(level)} initial="" size={level === to ? 56 : 40} className="rounded-xl" />
        ))}
      </div>
      {inRouter && <ChoosePictureButton onLeave={onLeave} />}
    </div>
  )
}

/** Goes to the account page, through the live-session guard like the nav bar does. */
function ChoosePictureButton({ onLeave }: { onLeave: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const requestLeaveApp = useLiveSessionStore(s => s.requestLeaveApp)
  const go = () => {
    onLeave()
    if (requestLeaveApp({ kind: 'route', path: '/account' })) void navigate('/account')
  }
  return (
    <button
      onClick={go}
      data-testid="level-up-choose-picture"
      className="mt-3 text-xs text-gold hover:text-gold-bright underline underline-offset-4 cursor-pointer transition-colors"
    >
      {t('levels.choosePicture')}
    </button>
  )
}

/**
 * Full-screen level-up celebration popup.
 *
 * Shows old level → new level transition with glow effects and tier badge.
 * Auto-displayed when a level-up occurs, dismissed via Continue button.
 */
export function LevelUpPopup() {
  const { t } = useTranslation()
  const showLevelUp = useLevelStore(s => s.showLevelUp)
  const levelUpData = useLevelStore(s => s.levelUpData)
  const dismissLevelUp = useLevelStore(s => s.dismissLevelUp)

  // Whether to show the explainer.
  //
  // It shows on every level-up **until the reader says they have got it**, and
  // that is the whole point of the button below. The earlier version hid it
  // after one showing, decided by the app — which assumes the text was read.
  // Somebody whose eye went straight to "Lv.3 Card Player" never saw it again.
  //
  // Answered when the popup *opens*, then held for as long as it is open:
  //
  // - Held, because pressing the button marks it hidden. Re-reading on every
  //   render would make the text vanish underneath somebody mid-sentence.
  // - Re-read per opening, because this component is mounted once in
  //   `TrainerApp` and stays there for the whole session, rendering null in
  //   between. A `useState` initialiser answers at app start and never again,
  //   so the text came back on a second level-up even after being switched off.
  //
  // Adjusted during render rather than in an effect: an effect would paint one
  // frame with the wrong answer first. This is React's documented pattern for
  // "reset state when something changes", and both pieces of state are declared
  // BEFORE any conditional return so hook order stays fixed (a hook after the
  // early `return null` once caused "rendered fewer hooks than expected").
  const [showIntro, setShowIntro] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)
  if (showLevelUp !== wasOpen) {
    setWasOpen(showLevelUp)
    if (showLevelUp) setShowIntro(!hasSeenLevelIntro())
  }

  // Dismiss on Escape / Enter for keyboard accessibility
  useEffect(() => {
    if (!showLevelUp) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') dismissLevelUp()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showLevelUp, dismissLevelUp])

  if (!showLevelUp || !levelUpData) return null

  const { oldLevel, newLevel, breakdown } = levelUpData
  const totalXP = breakdown.reduce((sum, b) => sum + b.amount, 0)

  // Closing is NOT the same as "I have understood this". It used to be, which
  // made the explainer a one-shot nobody could keep. Only the button below
  // records that.
  const dismiss = () => dismissLevelUp()

  const hideIntroForGood = () => {
    markLevelIntroSeen()
    // Hidden immediately rather than only from the next level-up: the popup
    // stays open afterwards, and a control that appears to do nothing reads as
    // broken.
    setShowIntro(false)
  }

  // Overlay pattern copied from UpgradeModalHost, which gets this right in the
  // same app: `grid place-items-center p-4 overflow-y-auto` + `my-auto` so a
  // tall card on a short (landscape phone) window scrolls to reach the button
  // instead of trapping it off-screen, and a backdrop click dismisses. The old
  // version was `flex items-center` with 48px padding and no scroll — on a
  // small viewport "Continue" was unreachable and the modal locked the app.
  return (
    <div
      data-testid="level-up-popup"
      role="dialog"
      aria-modal="true"
      aria-label={t('levels.upTo', { n: newLevel.level, name: t(newLevel.titleKey) })}
      className="fixed inset-0 z-[9999] grid place-items-center p-4 overflow-y-auto"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)', animation: 'levelFadeIn 0.3s ease' }}
      onClick={dismiss}
    >
      <div
        className="text-center w-full max-w-[440px] my-auto p-8 sm:p-10"
        onClick={e => e.stopPropagation()}
        style={{
          borderRadius: '24px',
          backgroundColor: 'var(--color-surface-2)',
          border: `2px solid ${newLevel.color}`,
          boxShadow: `0 0 60px ${newLevel.glowColor}, 0 0 120px ${newLevel.glowColor}`,
          animation: 'levelScaleIn 0.5s ease',
        }}
      >
        {/* LEVEL UP text */}
        <div
          className="text-base tracking-[6px] uppercase mb-4 text-gold"
        >
          {t('levels.levelUp')}
        </div>

        {/* Old level */}
        <div
          className="text-sm mb-2"
          style={{ color: oldLevel.color, opacity: 0.6 }}
        >
          {t('levels.short', { n: oldLevel.level })} {t(oldLevel.titleKey)}
        </div>

        <div className="text-2xl text-content/30 mb-2" aria-hidden>
          &#8595;
        </div>

        {/* A multi-level jump is otherwise invisible — the old and new numbers
            just differ by more than one with no explanation. */}
        {newLevel.level - oldLevel.level > 1 && (
          <div className="text-xs text-content/45 mb-2" data-testid="level-up-jump">
            {t('levels.jumped', { n: newLevel.level - oldLevel.level })}
          </div>
        )}

        {/* New level number */}
        <div
          className="font-extrabold mb-2"
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            color: newLevel.color,
            textShadow: `0 0 30px ${newLevel.glowColor}, 0 0 60px ${newLevel.glowColor}`,
          }}
        >
          {t('levels.abbr', { n: newLevel.level })}
        </div>

        {/* New title */}
        <div
          className="font-bold mb-6"
          style={{
            fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
            color: newLevel.color,
            textShadow: `0 0 20px ${newLevel.glowColor}`,
          }}
        >
          {t(newLevel.titleKey)}
        </div>

        {/*
          The one thing a level does unlock: its picture.

          Levels change nothing in the training — that is what Pro does — and
          the explainer below says so. But since the catalogue exists, every
          level-up hands out a profile picture, and a reward nobody is told
          about is a reward that does not exist. A multi-level burst shows the
          whole run, newest last, so the picture that matches the new level is
          the one beside the button.
        */}
        <NewPictures from={oldLevel.level} to={newLevel.level} onLeave={dismiss} />

        {/*
          What this actually is, in plain words.

          The popup used to show only numbers and titles — "Lv.1 Rookie →
          Lv.3 Card Player, BEGINNER" — which means nothing to someone seeing
          it for the first time. It is also deliberately honest about the
          limit: levels change nothing in the training (that is what Pro does).
          Implying a reward that does not exist would be worse than silence.
        */}
        {/* Where the XP came from. A jump with no explanation is a mystery;
            "Speed drill +75, Daily challenge +100" is something a beginner can
            actually connect to what they just did. */}
        {breakdown.length > 0 && (
          <div
            className="mx-auto max-w-[300px] mb-7 rounded-xl border border-contrast/10 bg-black/20 divide-y divide-contrast/8"
            data-testid="level-up-breakdown"
          >
            {breakdown.map((b, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                <span className="text-content/60 text-left">{t(b.labelKey, b.labelParams)}</span>
                <span className="tabular-nums font-semibold text-gold">+{b.amount}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
              <span className="text-content/45 uppercase tracking-wider text-[0.7rem] font-bold">{t('levels.total')}</span>
              <span className="tabular-nums font-bold text-content">+{totalXP} XP</span>
            </div>
          </div>
        )}

        {showIntro && (
          <p
            className="text-sm text-content/55 leading-relaxed mb-7 mx-auto max-w-[38ch] text-left"
            data-testid="level-up-explainer"
          >
            <Trans i18nKey="levels.whatIsThis" components={{ b: <b className="text-content/80" /> }} />
          </p>
        )}

        {/* Deliberately quiet, and deliberately NOT next to "Continue": one is
            "I am done reading this forever", the other is "close this popup".
            Two buttons that look alike would get pressed interchangeably. */}
        {showIntro && (
          <button
            onClick={hideIntroForGood}
            data-testid="level-up-intro-hide"
            className="block mx-auto -mt-4 mb-7 text-xs text-content/40 hover:text-content/70
              underline underline-offset-4 cursor-pointer transition-colors"
          >
            {t('levels.hideExplainer')}
          </button>
        )}

        {/* Tier badge */}
        <div
          className="inline-block px-4 py-1 rounded-xl text-xs font-semibold tracking-[2px] uppercase mb-8"
          style={{
            backgroundColor: `${newLevel.color}20`,
            color: newLevel.color,
          }}
        >
          {TIER_ICONS[newLevel.tier] || ''} {TIER_LABEL_KEY[newLevel.tier] ? t(TIER_LABEL_KEY[newLevel.tier]) : newLevel.tier}
        </div>

        {/* Continue button */}
        <div>
          <button
            onClick={dismiss}
            data-testid="level-up-dismiss"
            className="px-8 py-3 rounded-lg text-base font-semibold cursor-pointer transition-all duration-200 hover:brightness-125"
            style={{
              border: `1px solid ${newLevel.color}`,
              backgroundColor: `${newLevel.color}20`,
              color: newLevel.color,
            }}
          >
            {t('common.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
