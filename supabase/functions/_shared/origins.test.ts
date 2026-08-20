import { describe, it, expect } from 'vitest'
import { withWwwSibling, parseExtraOrigins, buildAllowlist, resolveAllowOrigin } from './origins'

/**
 * Who is allowed to call the payment functions from a browser.
 *
 * This is a security boundary, not plumbing. Echoing back whatever `Origin` a
 * request carries is the same as `Access-Control-Allow-Origin: *`, and with
 * credentials in play that lets any site on the internet start a checkout in a
 * signed-in user's name. It was the one guard on the money path with no test.
 */

describe('withWwwSibling', () => {
  it('accepts the apex and its www twin, because the site answers on both', () => {
    // Whichever of the two is not APP_URL would otherwise have its preflight
    // refused, and the user sees "Failed to send a request to the Edge
    // Function" — a message that points at the function while the fault is in
    // the header.
    expect(withWwwSibling('https://black-jack-training.com')).toEqual([
      'https://black-jack-training.com',
      'https://www.black-jack-training.com',
    ])
  })

  it('works the other way round too', () => {
    expect(withWwwSibling('https://www.example.com')).toEqual([
      'https://www.example.com',
      'https://example.com',
    ])
  })

  it('keeps the port, so localhost development is not silently excluded', () => {
    expect(withWwwSibling('http://localhost:5173')).toContain('http://localhost:5173')
  })

  it('does not invent a sibling for something that is not a URL', () => {
    expect(withWwwSibling('not a url')).toEqual(['not a url'])
  })

  it('drops the path, because an Origin header never has one', () => {
    // A browser sends scheme + host + port and nothing else. Keeping a path
    // here would produce an entry no request can ever match.
    expect(withWwwSibling('https://example.com/app')).toEqual([
      'https://example.com',
      'https://www.example.com',
    ])
  })
})

describe('parseExtraOrigins', () => {
  it('is empty when unset, which is the production case', () => {
    expect(parseExtraOrigins(undefined)).toEqual([])
    expect(parseExtraOrigins('')).toEqual([])
  })

  it('splits a comma-separated list and ignores the spaces people type', () => {
    expect(parseExtraOrigins('http://localhost:5173, http://localhost:4173')).toEqual([
      'http://localhost:5173',
      'http://localhost:4173',
    ])
  })

  it('strips trailing slashes, which an Origin header never carries', () => {
    // A single stray slash makes an entry that looks right in the dashboard and
    // matches nothing — the worst kind of configuration error.
    expect(parseExtraOrigins('http://localhost:5173/')).toEqual(['http://localhost:5173'])
  })

  it('drops empty entries from a trailing comma', () => {
    expect(parseExtraOrigins('http://localhost:5173,,')).toEqual(['http://localhost:5173'])
  })
})

describe('buildAllowlist', () => {
  it('contains the app, its www twin, and nothing else by default', () => {
    const list = buildAllowlist('https://black-jack-training.com')
    expect([...list].sort()).toEqual([
      'https://black-jack-training.com',
      'https://www.black-jack-training.com',
    ])
  })

  it('adds the development origins when they are configured', () => {
    const list = buildAllowlist('https://black-jack-training.com', 'http://localhost:5173')
    expect(list.has('http://localhost:5173')).toBe(true)
  })

  it('ignores a trailing slash on APP_URL', () => {
    expect(buildAllowlist('https://example.com/').has('https://example.com')).toBe(true)
  })
})

describe('resolveAllowOrigin', () => {
  const list = buildAllowlist('https://black-jack-training.com')
  const APP = 'https://black-jack-training.com'

  it('echoes an origin that is on the list', () => {
    expect(resolveAllowOrigin('https://www.black-jack-training.com', list, APP))
      .toBe('https://www.black-jack-training.com')
  })

  it('refuses to echo one that is not', () => {
    // The whole point. Echoing without checking is `*` with extra steps.
    expect(resolveAllowOrigin('https://evil.example', list, APP)).toBe(APP)
  })

  it('is not fooled by a lookalike host', () => {
    expect(resolveAllowOrigin('https://black-jack-training.com.evil.example', list, APP)).toBe(APP)
    expect(resolveAllowOrigin('https://notblack-jack-training.com', list, APP)).toBe(APP)
  })

  it('answers with the canonical origin rather than omitting the header', () => {
    // The browser refuses either way, but a present-and-mismatched value is far
    // easier to diagnose in a network panel than a missing one.
    expect(resolveAllowOrigin(null, list, APP)).toBe(APP)
    expect(resolveAllowOrigin('', list, APP)).toBe(APP)
  })

  it('treats the scheme as part of the identity', () => {
    // http://…com is a different origin from https://…com, and accepting the
    // first would allow a downgraded page to call the payment functions.
    expect(resolveAllowOrigin('http://black-jack-training.com', list, APP)).toBe(APP)
  })
})
