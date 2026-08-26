import type { ButtonHTMLAttributes, ReactNode } from 'react'
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

/** Compact stat display used on result / summary screens. */
export function StatCard({ label, value, accent = false, className = '' }: {
  label: string
  value: ReactNode
  accent?: boolean
  className?: string
}) {
  return (
    <div className={`rounded-xl px-4 py-3 text-center bg-contrast/5 border border-contrast/10 ${className}`}>
      <div className="text-xs text-content/50">{label}</div>
      <div className={`text-xl font-bold ${accent ? 'text-gold' : 'text-content'}`}>{value}</div>
    </div>
  )
}
