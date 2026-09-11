import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Avatar } from './Avatar'
import { AVATAR_IDS } from '../../services/supabase/profile-avatar'

describe('Avatar', () => {
  it('shows the initial on gold when no preset is chosen', () => {
    const { container } = render(<Avatar id={null} initial="ada" />)
    expect(container.textContent).toBe('A')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('draws every preset as an SVG at the requested size', () => {
    for (const id of AVATAR_IDS) {
      const { container, unmount } = render(<Avatar id={id} initial="a" size={40} />)
      const svg = container.querySelector('svg')
      expect(svg, id).not.toBeNull()
      expect(svg?.getAttribute('width')).toBe('40')
      unmount()
    }
  })

  it('is decorative — the name comes from whatever wraps it', () => {
    const { container } = render(<Avatar id="spade" initial="a" />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
