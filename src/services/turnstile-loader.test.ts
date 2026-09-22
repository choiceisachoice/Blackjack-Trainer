import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadTurnstile } from './turnstile-loader'

describe('loadTurnstile', () => {
  afterEach(() => { delete window.turnstile; vi.restoreAllMocks() })

  it('appends the script once and resolves to the global once it has run', async () => {
    const appended: HTMLScriptElement[] = []
    const original = document.head.appendChild.bind(document.head)
    vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
      if (node instanceof HTMLScriptElement) { appended.push(node); return node }
      return original(node)
    })
    const a = loadTurnstile()
    const b = loadTurnstile()
    expect(a).toBe(b)
    expect(appended).toHaveLength(1)
    expect(appended[0].src).toContain('challenges.cloudflare.com')
    const api = { render: () => 'w', reset: () => {}, remove: () => {} }
    window.turnstile = api
    appended[0].onload?.(new Event('load'))
    await expect(a).resolves.toBe(api)
  })

  it('short-circuits when the global is already there', async () => {
    const api = { render: () => 'w', reset: () => {}, remove: () => {} }
    window.turnstile = api
    const spy = vi.spyOn(document.head, 'appendChild')
    await expect(loadTurnstile()).resolves.toBe(api)
    expect(spy).not.toHaveBeenCalled()
  })
})
