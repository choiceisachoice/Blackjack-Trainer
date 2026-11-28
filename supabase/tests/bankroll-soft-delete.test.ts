// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { migratedDb, migrationFiles, asCaller, createUser, scalar, type Caller } from './pg-harness'

/**
 * Migration 20261129120000: tombstones and a server clock on the real-money
 * bankroll log. Run for real, as the roles the browser and the operator have.
 */

let db: PGlite
let alice: string
let bob: string

const as = (sub: string): Caller => ({ role: 'authenticated', sub })
const ROW_ID = '11111111-1111-4111-8111-111111111111'

/** The upsert PostgREST sends for `upsert(rows, { onConflict: 'id' })` without the new columns. */
async function upsertAs(caller: Caller, userId: string, result: number) {
  await asCaller(db, caller, () => db.query(
    `insert into public.bankroll_sessions (id, user_id, played_on, result)
     values ($1, $2, '2026-11-01', $3)
     on conflict (id) do update set user_id = excluded.user_id, played_on = excluded.played_on, result = excluded.result`,
    [ROW_ID, userId, result],
  ))
}

const row = () => db.query<{ result: string; updated_at: Date; deleted_at: Date | null }>(
  'select result, updated_at, deleted_at from public.bankroll_sessions where id = $1', [ROW_ID],
).then(r => r.rows[0])

beforeAll(async () => {
  db = await migratedDb()
  alice = await createUser(db, 'alice@example.com')
  bob = await createUser(db, 'bob@example.com')
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec('delete from public.bankroll_sessions;')
})

describe('bankroll_sessions soft delete', () => {
  it('adds deleted_at (nullable) and updated_at (not null, default now())', async () => {
    const cols = await db.query<{ column_name: string; is_nullable: string; column_default: string | null }>(
      `select column_name, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'bankroll_sessions'
         and column_name in ('deleted_at', 'updated_at') order by column_name`,
    )
    expect(cols.rows).toEqual([
      { column_name: 'deleted_at', is_nullable: 'YES', column_default: null },
      { column_name: 'updated_at', is_nullable: 'NO', column_default: 'now()' },
    ])
  })

  it('sets updated_at on update from the server clock, ignoring the client', async () => {
    await upsertAs(as(alice), alice, 100)
    const first = await row()
    expect(first.deleted_at).toBeNull()
    await new Promise(r => setTimeout(r, 5))
    await asCaller(db, as(alice), () => db.query(
      `update public.bankroll_sessions set result = 200, updated_at = '2000-01-01' where id = $1`, [ROW_ID]))
    const second = await row()
    expect(Number(second.result)).toBe(200)
    expect(second.updated_at.getTime()).toBeGreaterThan(first.updated_at.getTime())
    expect(second.updated_at.getUTCFullYear()).toBeGreaterThan(2000)
  })

  it('a later upsert without deleted_at leaves the tombstone in place', async () => {
    await upsertAs(as(alice), alice, 100)
    await asCaller(db, as(alice), () => db.query(
      `update public.bankroll_sessions set deleted_at = now() where id = $1`, [ROW_ID]))
    await upsertAs(as(alice), alice, 999)
    expect((await row()).deleted_at).not.toBeNull()
  })

  it('a client cannot lift a tombstone; service_role can', async () => {
    await upsertAs(as(alice), alice, 100)
    await asCaller(db, as(alice), () => db.query(
      `update public.bankroll_sessions set deleted_at = now() where id = $1`, [ROW_ID]))
    await asCaller(db, as(alice), () => db.query(
      `update public.bankroll_sessions set deleted_at = null where id = $1`, [ROW_ID]))
    expect((await row()).deleted_at).not.toBeNull()
    await asCaller(db, { role: 'service_role', sub: alice }, () => db.query(
      `update public.bankroll_sessions set deleted_at = null where id = $1`, [ROW_ID]))
    expect((await row()).deleted_at).toBeNull()
  })

  it('RLS still isolates users: another account can neither read, tombstone nor overwrite the row', async () => {
    await upsertAs(as(alice), alice, 100)
    const seen = await asCaller(db, as(bob), () =>
      db.query('select id from public.bankroll_sessions'))
    expect(seen.rows).toHaveLength(0)
    const tomb = await asCaller(db, as(bob), () => db.query(
      `update public.bankroll_sessions set deleted_at = now() where id = $1`, [ROW_ID]))
    expect(tomb.affectedRows ?? 0).toBe(0)
    expect((await row()).deleted_at).toBeNull()
    // An upsert onto Alice's id under Bob's user id is refused outright.
    await expect(upsertAs(as(bob), bob, 5)).rejects.toThrow()
    // And a row filed under someone else's id is refused on insert.
    await expect(asCaller(db, as(bob), () => db.query(
      `insert into public.bankroll_sessions (user_id, played_on) values ($1, '2026-11-01')`, [alice]))).rejects.toThrow()
    expect(Number((await row()).result)).toBe(100)
  })

  it('anon sees nothing', async () => {
    await upsertAs(as(alice), alice, 100)
    const seen = await asCaller(db, { role: 'anon' }, () => db.query('select id from public.bankroll_sessions'))
    expect(seen.rows).toHaveLength(0)
  })

  it('keeps the existing policy, and only it', async () => {
    const policies = await db.query<{ policyname: string; cmd: string }>(
      `select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'bankroll_sessions'`)
    expect(policies.rows).toEqual([{ policyname: 'own bankroll_sessions', cmd: 'ALL' }])
  })

  it('can be applied a second time without failing or touching data', async () => {
    await upsertAs(as(alice), alice, 100)
    await asCaller(db, as(alice), () => db.query(
      `update public.bankroll_sessions set deleted_at = now() where id = $1`, [ROW_ID]))
    const file = migrationFiles().find(f => f.includes('20261129120000'))
    expect(file).toBeDefined()
    await db.exec(readFileSync(file!, 'utf8'))
    await db.exec(readFileSync(file!, 'utf8'))
    expect((await row()).deleted_at).not.toBeNull()
    expect(await scalar<number>(db,
      `select count(*)::int from pg_trigger where tgname = 'bankroll_sessions_touch'`)).toBe(1)
  })
})
