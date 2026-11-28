import { activeLocale } from '../../i18n'

/**
 * A dollar amount in the reader's digits, signed when asked to.
 *
 * @param n - The amount in whole dollars
 * @param signed - Prefix gains with "+"
 */
export function introDollars(n: number, signed = false): string {
  const sign = n < 0 ? '-' : signed && n > 0 ? '+' : ''
  return `${sign}$${Math.abs(n).toLocaleString(activeLocale(), { maximumFractionDigits: 0 })}`
}

/**
 * A bankroll axis tick: "$1.5K", "$12K", compact, in the reader's language.
 *
 * The logs printed `$${(v / 1000).toFixed(0)}k`, which turns a $1,000 to
 * $2,000 axis into "$1k, $2k, $2k": two ticks with the same label.
 *
 * @param v - The tick value in dollars
 */
export function axisDollars(v: number): string {
  return `$${new Intl.NumberFormat(activeLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`
}
