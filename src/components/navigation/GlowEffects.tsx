import { useEffect, useRef, useState } from 'react'

// ═══════════════════════════════════════════════════════
// CURSOR SPOTLIGHT
// ═══════════════════════════════════════════════════════

export function CursorSpotlight() {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [visible, setVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const parent = containerRef.current?.parentElement
    if (!parent) return

    function onEnter() { setVisible(true) }
    function onLeave() { setVisible(false) }
    function onMove(e: MouseEvent) {
      const rect = parent!.getBoundingClientRect()
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }

    parent.addEventListener('mouseenter', onEnter)
    parent.addEventListener('mouseleave', onLeave)
    parent.addEventListener('mousemove', onMove)

    return () => {
      parent.removeEventListener('mouseenter', onEnter)
      parent.removeEventListener('mouseleave', onLeave)
      parent.removeEventListener('mousemove', onMove)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: '3px',
        borderRadius: '17px',
        zIndex: 3,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease',
        background: `radial-gradient(
          500px circle at ${pos.x}px ${pos.y}px,
          rgba(212, 168, 67, 0.12),
          rgba(255, 107, 0, 0.06) 25%,
          transparent 50%
        )`,
      }}
    />
  )
}

// ═══════════════════════════════════════════════════════
// GLOW TITLE
// ═══════════════════════════════════════════════════════

export function GlowTitle({ children }: { children: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
      <h1 style={{
        fontSize: 'clamp(1.8rem, 5vw, 3.2rem)',
        fontWeight: 800,
        fontStyle: 'italic',
        lineHeight: 1.2,
        color: 'var(--color-gold)',
        textShadow: '0 0 40px rgba(212, 168, 67, 0.6), 0 0 80px rgba(255, 107, 0, 0.3), 0 0 120px rgba(255, 107, 0, 0.15)',
      }}>
        {children}
      </h1>
    </div>
  )
}
