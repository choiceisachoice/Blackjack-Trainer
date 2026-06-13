import type { CSSProperties } from 'react'

interface PlayingCardProps {
  rank: string
  suit: '\u2660' | '\u2665' | '\u2666' | '\u2663'
  faceDown?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  style?: CSSProperties
}

const SIZES = {
  sm:  { w: 60,  h: 84,  font: 14, centerFont: 22, padding: 5 },
  md:  { w: 80,  h: 112, font: 18, centerFont: 30, padding: 7 },
  lg:  { w: 100, h: 140, font: 22, centerFont: 38, padding: 9 },
  xl:  { w: 130, h: 182, font: 28, centerFont: 50, padding: 12 },
} as const

/** Reusable casino-style playing card for the onboarding trailer. */
export function PlayingCard({ rank, suit, faceDown, size = 'md', style }: PlayingCardProps) {
  const s = SIZES[size]

  if (faceDown) {
    return (
      <div style={{
        width: s.w,
        height: s.h,
        borderRadius: 8,
        background: 'linear-gradient(135deg, #1a3a5c 25%, #0d2137 25%, #0d2137 50%, #1a3a5c 50%, #1a3a5c 75%, #0d2137 75%)',
        backgroundSize: '8px 8px',
        border: '2px solid #d4a843',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
        flexShrink: 0,
        ...style,
      }} />
    )
  }

  const isRed = suit === '\u2665' || suit === '\u2666'
  const color = isRed ? '#cc0000' : '#1a1a1a'

  return (
    <div style={{
      width: s.w,
      height: s.h,
      background: '#ffffff',
      borderRadius: 8,
      border: '1px solid rgba(0,0,0,0.15)',
      boxShadow: '0 4px 15px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.2)',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      userSelect: 'none',
      flexShrink: 0,
      ...style,
    }}>
      {/* Top left */}
      <div style={{
        position: 'absolute',
        top: s.padding,
        left: s.padding,
        color,
        lineHeight: 1.1,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: s.font, fontWeight: 700 }}>{rank}</div>
        <div style={{ fontSize: s.font - 2 }}>{suit}</div>
      </div>

      {/* Center suit */}
      <div style={{
        color,
        fontSize: s.centerFont,
        lineHeight: 1,
      }}>
        {suit}
      </div>

      {/* Bottom right (rotated 180°) */}
      <div style={{
        position: 'absolute',
        bottom: s.padding,
        right: s.padding,
        color,
        lineHeight: 1.1,
        textAlign: 'center',
        transform: 'rotate(180deg)',
      }}>
        <div style={{ fontSize: s.font, fontWeight: 700 }}>{rank}</div>
        <div style={{ fontSize: s.font - 2 }}>{suit}</div>
      </div>
    </div>
  )
}
