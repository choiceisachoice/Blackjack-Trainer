import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ExampleTag } from './ExampleTag'

afterEach(cleanup)

describe('ExampleTag', () => {
  it('says, in words, that what it labels is an example', () => {
    render(<ExampleTag />)
    expect(screen.getByTestId('example-tag')).toHaveTextContent('Example')
  })

  it('keeps the caller’s spacing', () => {
    render(<ExampleTag className="ml-2" />)
    expect(screen.getByTestId('example-tag').className).toContain('ml-2')
  })
})
