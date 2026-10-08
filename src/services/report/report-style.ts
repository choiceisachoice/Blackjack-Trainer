/**
 * The report's look, shared by the PDF, the Word file and the workbook so the
 * three read as one document: the site's near-black and gold, on paper.
 * Hex without `#`; each renderer adds what its format wants.
 */
export const REPORT_COLORS = {
  /** Header band and table heads. */
  ink: '0B0D10',
  /** Accent: rules, table-head text, the brand. */
  gold: 'D4A847',
  /** Key-figure tiles. */
  goldSoft: 'F6F1E2',
  /** Every other table row. */
  zebra: 'F7F7F5',
  /** Hairlines. */
  rule: 'E5E1D6',
  /** Labels and secondary text. */
  muted: '6B6F76',
  /** Body text. */
  text: '1C1E22',
} as const

/** The name on the header band. A brand, so not translated. */
export const REPORT_BRAND = 'BLACKJACK TRAINER'
