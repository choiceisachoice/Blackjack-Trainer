import { describe, it, expect } from 'vitest'
import { PRERENDER_FIT, STAGE_HEIGHT, STAGE_MIN_HEIGHT } from './stage-layout'
import { stackedTableSize } from '../casino-session/helpers'

describe('the guest table’s height', () => {
  it('is the screen less the header above and the cookie bar below, capped, on every layout', () => {
    for (const variant of ['h-[min(', 'md:h-[min(', 'short:h-[calc(']) {
      const cls = STAGE_HEIGHT.split(' ').find(c => c.startsWith(variant))
      expect(cls, variant).toBeDefined()
      expect(cls).toContain('100dvh')
      expect(cls).toContain('var(--stage-top')
      expect(cls).toContain('var(--cookie-bar,0px)')
    }
  })

  it('gives the summary the same floor, so the page does not jump up when the felt gives way', () => {
    const floor = STAGE_MIN_HEIGHT.split(' ').map(c => c.replace(/^(md:)?min-h-/, '$1h-'))
    for (const c of floor) expect(STAGE_HEIGHT.split(' ')).toContain(c)
  })
})

describe('PRERENDER_FIT', () => {
  it('is the upright table, small enough for a 360px phone before anything is measured', () => {
    expect(PRERENDER_FIT.stacked).toBe(true)
    const size = stackedTableSize(0, 1)
    expect(PRERENDER_FIT.sceneWidth).toBe(size.width)
    expect(PRERENDER_FIT.sceneHeight).toBe(size.height)
    expect(PRERENDER_FIT.sceneWidth * PRERENDER_FIT.scale).toBeLessThanOrEqual(344)
  })
})
