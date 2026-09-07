import { useId } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/* ─────────────────────────────────────────────────────────────
   Shared dark-luxury UI primitives (Blackjack 2.0)
   Used across all screens for a consistent look & feel.
   ───────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-2.5 text-sm',
  lg: 'px-8 py-3 text-base',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
}

/**
 * Primary/secondary/ghost button with the signature gold gradient + lift-glow.
 */
export function Button({ variant = 'primary', size = 'md', icon: Icon, className = '', children, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
  const variantClass =
    variant === 'primary'
      ? 'lift-glow text-on-gold bg-gradient-to-b from-gold-bright to-gold border border-gold/50 shadow-[0_10px_30px_-12px_var(--color-gold)]'
      : variant === 'secondary'
      ? 'bg-contrast/10 text-content hover:bg-contrast/15 border border-contrast/10'
      : 'text-content/60 hover:text-content'
  return (
    <button className={`${base} ${SIZE_CLASSES[size]} ${variantClass} ${className}`} {...props}>
      {Icon && <Icon size={17} />}
      {children}
    </button>
  )
}

/** Small rounded icon tile in the gold accent style. */
export function IconTile({ icon: Icon, size = 44 }: { icon: LucideIcon; size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-xl text-gold bg-gold/10 border border-gold/20 shrink-0"
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  )
}

/** Elevated surface panel with an optional icon + title header. */
export function Panel({ icon, title, subtitle, className = '', children }: {
  icon?: LucideIcon
  title?: string
  subtitle?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`surface p-5 ${className}`}>
      {(title || icon) && (
        <div className="flex items-center gap-3 mb-4">
          {icon && <IconTile icon={icon} size={40} />}
          <div>
            {title && <h3 className="text-sm font-semibold tracking-wide text-content">{title}</h3>}
            {subtitle && <p className="text-sm text-content/50">{subtitle}</p>}
          </div>
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  )
}

/** Label-left / control-right row. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-content/60">{label}</span>
      {children}
    </div>
  )
}

interface SegOption<T> { label: string; value: T }
/** Segmented control — replaces native selects / radios for small option sets. */
export function Segmented<T extends string | number>({ options, value, onChange, ariaLabel, fluid = false }: {
  options: SegOption<T>[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
  fluid?: boolean
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={`inline-flex p-0.5 rounded-lg bg-contrast/5 border border-contrast/10 ${fluid ? 'w-full' : ''}`}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 cursor-pointer ${fluid ? 'flex-1' : ''}
              ${active ? 'bg-gold text-on-gold shadow-[0_2px_10px_-4px_var(--color-gold)]' : 'text-content/60 hover:text-content'}`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/** iOS-style toggle switch — replaces native checkboxes. */
export function Toggle({ checked, onChange, label, testId }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  testId?: string
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="text-sm text-content/80">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer shrink-0
          ${checked ? 'bg-gold' : 'bg-contrast/15'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
          ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </label>
  )
}

/**
 * A progress bar.
 *
 * Twelve of these were hand-rolled across the app as a track div wrapping a
 * `style={{ width }}` div, and they had drifted: some animated the width with
 * `transition-all duration-200`, some with a bare `transition-all`, and
 * `AchievementsPage.tsx` had none, so one bar in the app jumped while the rest
 * eased. `fill` takes any CSS background so the gradient bars keep their look.
 */
export function ProgressBar({
  value,
  max = 100,
  fill = 'linear-gradient(180deg, var(--color-gold-bright), var(--color-gold))',
  height = 8,
  className = '',
  label,
  active = false,
  testId,
  glow = 'color-mix(in srgb, var(--color-gold) 45%, transparent)',
}: {
  value: number
  max?: number
  /** Any CSS background — a token, or a `linear-gradient(...)` for the ramp bars. */
  fill?: string
  height?: number
  className?: string
  /** Screen-reader name. Without it the bar is decoration, which is usually wrong. */
  label?: string
  /** Travelling stripes, for a bar that is genuinely filling right now. */
  active?: boolean
  /** Lands on the *fill* element, where the hand-rolled bars carried it. */
  testId?: string
  /**
   * Colour of the low bloom under the fill. Defaults to gold; pass the bar's
   * own hue when `fill` is not gold, or `'transparent'` to switch it off.
   */
  glow?: string
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div
      role={label ? 'progressbar' : undefined}
      aria-label={label}
      aria-valuenow={label ? Math.round(pct) : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      className={`relative w-full rounded-full overflow-hidden bg-contrast/10 ${className}`}
      style={{ height, boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.45)' }}
    >
      <div
        data-testid={testId}
        className="relative h-full rounded-full transition-[width] duration-300 ease-out"
        style={{
          width: `${pct}%`,
          background: fill,
          // Two shadows doing different jobs. The dark one gives the leading
          // edge a head instead of a hard vertical cut. The coloured one is a
          // low bloom in the bar's own hue — the same device as `.lift-glow`
          // and the gold button's `shadow-[0_2px_10px_-4px_var(--color-gold)]`,
          // so the bar belongs to the app's existing light rather than
          // introducing a new one. Held at a tenth of the fill's opacity: on a
          // near-black ground that reads as warmth, not as a neon edge.
          boxShadow: pct > 0
            ? `2px 0 6px -1px rgba(0,0,0,0.45), 0 0 ${Math.round(height * 1.6)}px -2px ${glow}`
            : undefined,
        }}
      >
        {/*
          Gloss. A flat fill of one colour is what a progress bar looks like
          when nobody decided how it should look — the top half catches light,
          the bottom does not, and that alone is the difference between a
          coloured rectangle and something with a surface.
        */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.04) 52%, rgba(0,0,0,0.12))' }}
        />
        {active && (
          // The striped-loader idea, rebuilt on our own tokens rather than
          // imported: 45° bands travelling one 24px cycle. Only for bars that
          // are genuinely working — a static value with moving stripes is a lie.
          <span
            aria-hidden
            className="absolute inset-0 rounded-full pointer-events-none motion-safe:[animation:bar-stripes_0.8s_linear_infinite]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.20) 0 6px, rgba(255,255,255,0) 6px 12px)',
              backgroundSize: '24px 100%',
            }}
          />
        )}
      </div>
    </div>
  )
}

/**
 * A text input that keeps the app's focus ring.
 *
 * Twenty raw `<input>` elements carry the same three-part class chain, and every
 * one of them ends in `focus:outline-none focus:border-gold/60` — which switches
 * off the global `*:focus-visible` gold outline from `index.css` and replaces it
 * with a one-pixel border change. That is a real regression for keyboard use, and
 * it was copied twenty times. This keeps the ring and adds the border tint, and
 * gives the invalid state a colour, which nothing had.
 */
export function Input({ invalid = false, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`px-3 py-2 rounded-lg bg-input-bg border text-content text-sm
        transition-colors duration-150
        placeholder:text-content/30
        hover:border-gold/40 focus:border-gold/60
        disabled:opacity-40 disabled:cursor-not-allowed
        ${invalid ? 'border-error/70' : 'border-contrast/20'} ${className}`}
      {...props}
    />
  )
}

/**
 * A loading placeholder shaped like the thing that is coming.
 *
 * The word "skeleton" appeared three times in the codebase and all three were
 * comments. The analytics dashboard — eight panels of charts — announced itself
 * with a single centred sentence, so the screen sat empty and then snapped into
 * a full page. A placeholder that matches the layout stops the jump and tells
 * the reader how much is on its way.
 */
export function Skeleton({ className = '', rounded = 'rounded-lg' }: { className?: string; rounded?: string }) {
  return <div aria-hidden className={`motion-safe:animate-pulse bg-contrast/10 ${rounded} ${className}`} />
}

/**
 * A tooltip.
 *
 * `--color-tooltip-bg` and `--color-tooltip-border` have been in `index.css`
 * since the theme was written and were referenced by nothing; the three places
 * that needed a hint used the native `title` attribute instead. That has two
 * problems beyond looking like the browser rather than the product: it never
 * appears on a touch device, and it cannot be reached from the keyboard.
 *
 * This one opens on hover **and** on focus, so a keyboard user gets it too, and
 * it is wired with `aria-describedby` rather than being decorative text that a
 * screen reader announces out of nowhere. It stays CSS-only — no positioning
 * library, no portal — which means it cannot escape a clipping ancestor. For
 * the hints in this app, which sit in open layout, that trade is worth the
 * absence of a dependency.
 */
export function Tooltip({ label, children, side = 'top', className = '', focusable = true }: {
  label: string
  children: ReactNode
  side?: 'top' | 'bottom'
  className?: string
  /**
   * Whether the wrapper takes keyboard focus. Default yes, because a hint no
   * keyboard user can reach is half a control. Set false when the tooltip wraps
   * many repeated items — fifty achievement cards would otherwise add fifty tab
   * stops to a page whose real controls are elsewhere, which is worse for
   * keyboard use than the hint is good.
   */
  focusable?: boolean
}) {
  const id = useId()
  const place = side === 'top'
    ? 'bottom-full left-1/2 -translate-x-1/2 mb-2'
    : 'top-full left-1/2 -translate-x-1/2 mt-2'
  return (
    <span
      className={`relative inline-flex group ${className}`}
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={id}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute ${place} z-50 whitespace-nowrap
          rounded-lg border px-2.5 py-1.5 text-xs font-medium text-content shadow-lg
          opacity-0 translate-y-0.5 transition-[opacity,transform] duration-150
          group-hover:opacity-100 group-hover:translate-y-0
          group-focus-visible:opacity-100 group-focus-visible:translate-y-0`}
        style={{
          backgroundColor: 'var(--color-tooltip-bg)',
          borderColor: 'var(--color-tooltip-border)',
        }}
      >
        {label}
      </span>
    </span>
  )
}

/**
 * The screen for when there is nothing yet.
 *
 * The copy for these already existed and is translated into all seven
 * languages — `analytics.noSessions`, `analytics.trendEmpty`,
 * `awards.noneUnlocked` and half a dozen more. What was missing was any shape:
 * every one of them rendered as a line of `text-content/40` floating in a
 * panel, which reads as *something failed to load* rather than *you have not
 * done this yet*. The two states look identical to a reader and mean opposite
 * things — one is an error, the other is an invitation.
 *
 * So the mark carries a muted icon tile, real hierarchy between the headline
 * and the sentence under it, and where it makes sense the one action that ends
 * the emptiness. The tile is deliberately **not** gold: gold is this app's
 * accent for things that happened, and spending it on an absence would put the
 * loudest colour on the least important state.
 */
export function EmptyState({ icon: Icon, title, body, action, compact = false, className = '' }: {
  icon?: LucideIcon
  title: string
  body?: string
  /** The one thing that would end the empty state. Omit when there isn't one. */
  action?: { label: string; onClick: () => void }
  /** For an empty panel inside a populated page, rather than a whole screen. */
  compact?: boolean
  className?: string
}) {
  return (
    <div className={`grid place-items-center text-center ${compact ? 'py-6 gap-2' : 'py-12 gap-3'} ${className}`}>
      {Icon && (
        <span
          className={`grid place-items-center rounded-xl bg-contrast/[0.07] border border-contrast/10 text-content/35
            ${compact ? 'w-9 h-9' : 'w-12 h-12'}`}
        >
          <Icon size={compact ? 17 : 22} />
        </span>
      )}
      <p className={compact ? 'text-sm text-content/55' : 'text-lg font-medium text-content/75'}>{title}</p>
      {body && <p className={`text-content/40 ${compact ? 'text-xs' : 'text-sm max-w-sm'}`}>{body}</p>}
      {action && (
        <Button size="sm" className="mt-1" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

/** Compact stat display used on result / summary screens. */
export function StatCard({ label, value, accent = false, className = '', testId }: {
  label: string
  value: ReactNode
  accent?: boolean
  className?: string
  /** Lands on the value, where the hand-rolled copies of this card carried it. */
  testId?: string
}) {
  return (
    <div className={`rounded-xl px-4 py-3 text-center bg-contrast/5 border border-contrast/10 ${className}`}>
      <div className="text-xs text-content/50">{label}</div>
      <div className={`text-xl font-bold ${accent ? 'text-gold' : 'text-content'}`} data-testid={testId}>{value}</div>
    </div>
  )
}
