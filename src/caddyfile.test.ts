import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { routeFor, isAppPath } from './routes/pages'
import { PRERENDER_ROUTES } from './entry-prerender'

const caddy = readFileSync(path.join(process.cwd(), 'Caddyfile'), 'utf8')

/**
 * The Caddyfile's routing (28 Nov 2026): the client-side routes get the app
 * shell with 200, prerendered pages are files, everything else is a real 404.
 * Caddy is not installed here, so the regular expression is lifted out of the
 * file and run against the same paths the router knows.
 */
describe('the Caddyfile routing', () => {
  const source = /@shell path_regexp shell (\S+)/.exec(caddy)?.[1]
  const shell = new RegExp(source ?? '^$')

  it('names one shell matcher', () => {
    expect(source).toBeTruthy()
  })

  const clientRoutes = ['/login', '/reset-password', '/app', '/app/', '/app/speed', '/app/casino/setup', '/account', '/admin/analytics']

  it('sends every client-side route to the shell, with or without a language prefix', () => {
    for (const p of clientRoutes) {
      // Each of these is a page the router knows and the prerender does not write.
      expect(routeFor(p), p).not.toBeNull()
      expect(PRERENDER_ROUTES.some(r => r.path === p)).toBe(false)
      for (const prefix of ['', '/de', '/tr']) expect(shell.test(`${prefix}${p}`), `${prefix}${p}`).toBe(true)
    }
  })

  it('covers every path the app treats as its own', () => {
    for (const p of ['/app', '/app/stats', '/account', '/admin/analytics']) {
      expect(isAppPath(p)).toBe(true)
      expect(shell.test(p)).toBe(true)
    }
  })

  it('does not hand the shell to unknown paths, which must 404', () => {
    for (const p of ['/nonexistent-page', '/learn/foo', '/applications', '/login/x', '/xx/login', '/accounts', '/dev', '/admin']) {
      expect(shell.test(p), p).toBe(false)
    }
  })

  it('no longer falls back to the shell for every missing file', () => {
    expect(caddy).not.toMatch(/try_files[^\n]*\/shell\.html/)
    expect(caddy).toMatch(/handle_errors \{[\s\S]*?import security_headers[\s\S]*?rewrite \* \/shell\.html[\s\S]*?file_server/)
  })
})

describe('the Caddyfile caching and compression', () => {
  it('compresses with zstd, then gzip, and leaves fonts alone', () => {
    expect(caddy).toMatch(/encode zstd gzip \{/)
    const block = /encode zstd gzip \{([\s\S]*?)\n\t\}/.exec(caddy)?.[1] ?? ''
    expect(block).toContain('header Content-Type text/*')
    expect(block).not.toMatch(/font\//)
    expect(block).not.toMatch(/image\/(webp|avif|jpeg|png)|audio\//)
  })

  it('keeps the unhashed static files for a week, never as immutable', () => {
    expect(caddy).toContain('@static path /fonts/* /cards/* /sounds/* /og-card.jpg')
    expect(caddy).toContain('header @static Cache-Control "public, max-age=604800, stale-while-revalidate=86400"')
    expect(caddy).toContain('@pages not path /assets/* /fonts/* /cards/* /sounds/* /og-card.jpg')
    expect(caddy).toContain('header @pages Cache-Control "no-cache"')
    expect(caddy).toContain('header @assets Cache-Control "public, max-age=31536000, immutable"')
  })

  it('applies the security headers to every response, error pages included', () => {
    expect(caddy.match(/import security_headers/g)).toHaveLength(2)
    expect(caddy).toMatch(/\(security_headers\) \{[\s\S]*Content-Security-Policy "default-src 'self'; script-src 'self' https:\/\/challenges\.cloudflare\.com;/)
  })
})
