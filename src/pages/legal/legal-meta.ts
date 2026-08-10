/**
 * The single source of truth for the legal pages' fill-in facts.
 *
 * These are the details only the operator can supply, and they must be REAL —
 * a policy that invents its own facts looks valid and isn't. They live here as
 * clearly-marked values to set once, rather than scattered through the Terms
 * and Privacy prose, so filling them in is a five-minute job in one file.
 *
 * Anything still starting with "[SET" is a placeholder that MUST be replaced
 * before the site takes real customers. `hasUnsetPlaceholders` below lets the
 * pages surface a visible warning while any remain, so a draft never ships
 * silently as if it were final.
 */
export const LEGAL_META = {
  /** The product's public name. */
  productName: 'Blackjack Card Counting Trainer',

  /**
   * The person or registered company legally responsible for the service —
   * the "data controller" in privacy law. A company puts its registered name;
   * add the commercial-register number (UID/CHE) here too for a complete
   * Swiss imprint if you have one.
   */
  operator: 'Impact Trading & Consulting GmbH',

  /**
   * Where the operator is established. This decides which privacy law primarily
   * governs (Switzerland → revDSG; the GDPR also applies to EU/EEA visitors).
   */
  operatorLocation: 'Neuhausweg 5, 8810 Horgen, Switzerland',

  /** One address that receives support, legal and privacy/data-rights requests. */
  contactEmail: 'ralf.koehler@impact-consult.ch',

  /**
   * The region where Supabase (database + auth) processes the data. Find it in
   * the Supabase dashboard → Project Settings → General → Region.
   */
  hostingRegion: 'EU (Frankfurt)',

  /** Minimum age to use the service. Card-counting content → 18 is prudent. */
  minimumAge: 18,

  /** Governing law for the Terms of Use. */
  governingLaw: 'Switzerland',

  /**
   * Date these documents were last changed. Update it whenever you edit the
   * Terms or Privacy text — the "last updated" line is legally meaningful.
   */
  lastUpdated: '10 August 2026',
} as const

/**
 * True while any `[SET: …]` placeholder is still in place.
 *
 * Takes a loose record, not `typeof LEGAL_META`: the `as const` above narrows
 * every field to a string literal, which would reject a filled-in object (plain
 * `string`) — exactly what the test passes to check the "all set" case.
 */
export function hasUnsetPlaceholders(meta: Record<string, unknown> = LEGAL_META): boolean {
  return Object.values(meta).some(v => typeof v === 'string' && v.startsWith('[SET'))
}
