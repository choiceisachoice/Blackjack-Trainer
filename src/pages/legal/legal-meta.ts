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
/**
 * The date the Terms and the Privacy Policy were last changed, as an ISO day.
 *
 * The one place the date is written. Every language's "last updated" line is
 * formatted from it (`formatLegalDate`), so the seven versions cannot
 * disagree about when the text changed.
 */
const LAST_UPDATED_ISO = '2026-11-18'

/**
 * The last-updated date, written out the way a given locale writes dates.
 *
 * @param tag - A BCP 47 tag, e.g. `en-GB` → "18 November 2026", `de-CH` → "18. November 2026"
 * @param iso - The day to format; defaults to the documents' last-updated date
 */
export function formatLegalDate(tag: string, iso: string = LAST_UPDATED_ISO): string {
  const [y, m, d] = iso.split('-').map(Number)
  // UTC on both sides: a calendar day must not slip to the 17th for a reader
  // west of Greenwich.
  return new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
}

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

  /**
   * One address that receives support, legal and privacy/data-rights requests.
   *
   * A role address on the company domain, deliberately — not a person's mailbox.
   * It appears on the imprint, in the Terms and Privacy prose and in checkout
   * error messages, so it is the most-published string in the product: it should
   * survive people joining or leaving, and it should not put a private name in
   * front of every visitor.
   */
  contactEmail: 'info@impact-consult.ch',

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
   * Date these documents were last changed, as an ISO day. Update
   * `LAST_UPDATED_ISO` above whenever you edit the Terms or Privacy text —
   * the "last updated" line is legally meaningful.
   */
  lastUpdatedIso: LAST_UPDATED_ISO,

  /** The same date as the English pages print it ("18 November 2026"). */
  lastUpdated: formatLegalDate('en-GB'),
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
