import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PRERENDER_FIT, STAGE_FLOOR_REM, STAGE_HEIGHT, STAGE_MIN_HEIGHT, TRY_WIDE_QUERY, arrivalStageTop } from './stage-layout'
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

describe('arrivalStageTop — fitting the stage under /try’s heading', () => {
  it('keeps the floor it reasons about in step with the class that draws it', () => {
    expect(STAGE_HEIGHT.split(' ')).toContain(`min-h-[${STAGE_FLOOR_REM}rem]`)
  })

  it('counts from the stage’s place on the page when the stage still has its floor there', () => {
    // 2000×720, root font 19.8px: the stage under a compact heading at 269px
    // has 720 − 269 − 19.8 = 431px, above the 416px floor.
    expect(arrivalStageTop(269, 720, 19.8)).toBe(269)
    // 1440×900, root font 17.67px.
    expect(arrivalStageTop(307.4, 900, 17.67)).toBe(307)
  })

  it('gives up where the fit cannot happen, so the table is not shrunk for nothing', () => {
    // The heading as it was, at 720px: 344px leaves 356px, under the floor.
    expect(arrivalStageTop(344, 720, 19.8)).toBeNull()
    // A phone held sideways.
    expect(arrivalStageTop(230, 390, 16)).toBeNull()
  })

  it('treats a measurement that is not a number as no measurement', () => {
    expect(arrivalStageTop(Number.NaN, 720, 19.8)).toBeNull()
    expect(arrivalStageTop(269, 720, 0)).toBeNull()
  })
})

describe('TRY_WIDE_QUERY — when /try puts the words beside the table', () => {
  // The layout switches in CSS (the `try-wide` variant, so the prerendered page
  // has it) and the script asks the same question with `matchMedia`. Two copies
  // of one media query: this keeps them one.
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
  const variant = (name: string) => new RegExp(`@custom-variant ${name} \\(@media (.+)\\);`).exec(css)?.[1]

  it('is the query the try-wide variant uses', () => {
    expect(variant('try-wide')).toBe(TRY_WIDE_QUERY)
  })

  it('is left out of the short stacked variant, so the two never apply at once', () => {
    expect(variant('try-short')).toContain(`not (${TRY_WIDE_QUERY})`)
  })

  it('asks for a wide window as well as a wide shape', () => {
    expect(TRY_WIDE_QUERY).toMatch(/min-width: \d+px/)
    expect(TRY_WIDE_QUERY).toMatch(/min-aspect-ratio: \d+\/\d+/)
  })
})
