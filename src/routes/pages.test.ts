import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  routeFor, isAppPath,
  LandingPage, LoginPage, TrainerApp, AccountPage, LearnPublicPage, LearnTopicPage, StrategyChartPublicPage,
} from './pages'
import { PUBLIC_PATHS, unprefixedPath } from '../i18n/locales'

describe('routeFor', () => {
  it('names the page each path opens', () => {
    expect(routeFor('/')).toBe(LandingPage)
    expect(routeFor('/login')).toBe(LoginPage)
    expect(routeFor('/app')).toBe(TrainerApp)
    expect(routeFor('/account')).toBe(AccountPage)
    expect(routeFor('/learn')).toBe(LearnPublicPage)
    expect(routeFor('/learn/true-count')).toBe(LearnTopicPage)
    expect(routeFor('/strategy-chart')).toBe(StrategyChartPublicPage)
  })

  it('forgives a trailing slash, which is how a prerendered directory is often requested', () => {
    expect(routeFor('/learn/')).toBe(LearnPublicPage)
    expect(routeFor('/learn/true-count/')).toBe(LearnTopicPage)
  })

  it('answers null for a path the router would redirect', () => {
    expect(routeFor('/nope')).toBeNull()
    expect(routeFor('/learn/a/b')).toBeNull()
  })

  it('covers every prerendered page — the ones whose first render must not be a fallback', () => {
    for (const path of PUBLIC_PATHS) expect(routeFor(path), path).not.toBeNull()
  })

  it('covers every route App.tsx declares', () => {
    // The table mirrors `<Routes>`. A route added there and forgotten here
    // would silently go back to blanking its page on the first render.
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')
    const declared = [...app.matchAll(/<Route path="([^"]+)"/g)]
      .map(m => m[1])
      .filter(p => p !== '*' && !p.startsWith('/dev'))
    expect(declared.length).toBeGreaterThan(8)
    for (const path of declared) expect(routeFor(path.replace(':slug', 'hi-lo')), path).not.toBeNull()
  })

  it('works on a path with the language prefix removed', () => {
    expect(routeFor(unprefixedPath('/de'))).toBe(LandingPage)
    expect(routeFor(unprefixedPath('/de/learn/true-count'))).toBe(LearnTopicPage)
    expect(routeFor(unprefixedPath('/de/app'))).toBe(TrainerApp)
  })
})

describe('unprefixedPath', () => {
  it('removes a language prefix and nothing else', () => {
    expect(unprefixedPath('/de/learn')).toBe('/learn')
    expect(unprefixedPath('/de')).toBe('/')
    expect(unprefixedPath('/de/')).toBe('/')
    expect(unprefixedPath('/learn')).toBe('/learn')
    expect(unprefixedPath('/')).toBe('/')
  })

  it('does not read a two-letter word, or English, as a prefix', () => {
    // `/deck` is not German, and English lives at the root.
    expect(unprefixedPath('/deck')).toBe('/deck')
    expect(unprefixedPath('/en/learn')).toBe('/en/learn')
  })
})

describe('isAppPath', () => {
  it('is true inside the signed-in app', () => {
    for (const p of ['/app', '/app/', '/account', '/admin/analytics']) expect(isAppPath(p), p).toBe(true)
  })

  it('is false for every public page and for the forms in front of the app', () => {
    for (const p of [...PUBLIC_PATHS, '/login', '/reset-password', '/apple']) expect(isAppPath(p), p).toBe(false)
  })
})
