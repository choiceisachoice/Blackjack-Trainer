import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { JsonLd } from './JsonLd'

describe('JsonLd', () => {
  it('emits a script of type application/ld+json with the data', () => {
    const { container } = render(<JsonLd data={{ '@type': 'FAQPage', name: 'x' }} />)
    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    expect(JSON.parse(script!.textContent ?? '')).toEqual({ '@type': 'FAQPage', name: 'x' })
  })

  it('cannot be closed early by a </script> inside the data', () => {
    const { container } = render(<JsonLd data={{ a: '</script><b>' }} />)
    const text = container.querySelector('script')!.textContent ?? ''
    expect(text).not.toContain('</script>')
    expect(JSON.parse(text)).toEqual({ a: '</script><b>' })
  })
})
