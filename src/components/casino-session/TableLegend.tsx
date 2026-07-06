interface TableLegendProps {
  /** Blackjack payout multiplier (1.5 = 3:2, 1.2 = 6:5). */
  blackjackPays: number
  /** Whether the dealer hits soft 17 (H17) or stands (S17). */
  dealerHitsSoft17: boolean
}

/** Curved box around the two lower lines (Variant B). */
const BOX_PATH = 'M 165 120 Q 400 192 635 120 Q 653 165 622 172 Q 400 246 178 172 Q 147 165 165 120 Z'

/**
 * The curved gold table legend printed on the felt, following the table's rim.
 *
 * Layout (Variant B): "BLACKJACK PAYS …" sits above, outside a curved box that
 * frames the dealer rule + insurance line. All wording is derived from the
 * active session rules, exactly like a real casino layout.
 */
export function TableLegend({ blackjackPays, dealerHitsSoft17 }: TableLegendProps) {
  const payLine = `BLACKJACK PAYS ${blackjackPays >= 1.5 ? '3 TO 2' : '6 TO 5'}`
  const dealerLine = `DEALER MUST ${dealerHitsSoft17 ? 'HIT' : 'STAND ON'} SOFT 17`

  return (
    <svg
      viewBox="0 74 800 144"
      className="w-full h-auto overflow-visible"
      aria-hidden="true"
      data-testid="table-legend"
    >
      <defs>
        <path id="tl-top" d="M 180 96 Q 400 170 620 96" fill="none" />
        <path id="tl-mid" d="M 205 140 Q 400 210 595 140" fill="none" />
        <path id="tl-bot" d="M 200 162 Q 400 230 600 162" fill="none" />
      </defs>

      {/* Box around the two lower lines */}
      <path d={BOX_PATH} fill="rgba(0,0,0,0.05)" stroke="rgba(212,168,71,0.6)" strokeWidth={1.8} />

      <text textAnchor="middle" style={{ fontWeight: 800, fontSize: 22, letterSpacing: '3px', fill: '#ecc873' }}>
        <textPath href="#tl-top" startOffset="50%">{payLine}</textPath>
      </text>
      <text textAnchor="middle" style={{ fontWeight: 600, fontSize: 12, letterSpacing: '1px', fill: 'rgba(233,197,113,0.85)' }}>
        <textPath href="#tl-mid" startOffset="50%">{dealerLine}</textPath>
      </text>
      <text textAnchor="middle" style={{ fontWeight: 800, fontSize: 15, letterSpacing: '2px', fill: '#ecc873' }}>
        <textPath href="#tl-bot" startOffset="50%">INSURANCE PAYS 2 TO 1</textPath>
      </text>
    </svg>
  )
}
