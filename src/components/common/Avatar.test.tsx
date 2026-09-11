import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Avatar } from './Avatar'
import { AVATAR_IDS } from '../../services/avatar-catalog'

describe('Avatar', () => {
  it('shows the initial on gold when no preset is chosen', () => {
    const { container } = render(<Avatar id={null} initial="ada" />)
    expect(container.textContent).toBe('A')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('draws every picture in the catalogue as an SVG at the requested size', () => {
    // All fifty-one: a family that throws on one id would take the whole
    // profile header down with it.
    for (const id of AVATAR_IDS) {
      const { container, unmount } = render(<Avatar id={id} initial="a" size={40} />)
      const svg = container.querySelector('svg')
      expect(svg, id).not.toBeNull()
      expect(svg?.getAttribute('width')).toBe('40')
      unmount()
    }
  })

  it('writes the level on the level pictures', () => {
    expect(render(<Avatar id="level-7" initial="a" />).container.textContent).toContain('7')
    expect(render(<Avatar id="level-12" initial="a" />).container.textContent).toContain('Q')
    expect(render(<Avatar id="level-21" initial="a" />).container.textContent).toContain('21')
  })

  it('is decorative — the name comes from whatever wraps it', () => {
    const { container } = render(<Avatar id="spade" initial="a" />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})
