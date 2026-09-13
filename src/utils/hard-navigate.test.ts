import { describe, it, expect, vi } from 'vitest'
import { hardNavigate } from './hard-navigate'

describe('hardNavigate', () => {
  it('hands the URL to the browser', () => {
    const assign = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { value: { ...original, assign }, writable: true, configurable: true })
    hardNavigate('/de/learn')
    expect(assign).toHaveBeenCalledWith('/de/learn')
    Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true })
  })
})
