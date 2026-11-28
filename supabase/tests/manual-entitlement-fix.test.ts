// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { migratedDb, createUser, scalar } from './pg-harness'

/**
 * The hand correction documented in docs/STRIPE-SETUP.md §9, run for real.
 *
 * The SQL editor runs as the database owner, and `protect_entitlement_columns`
 * lets entitlement columns change only when `auth.role()` — the JWT claim, not
 * the database role — says `service_role`. A plain UPDATE there reports one row
 * changed and changes nothing, which is exactly when someone is fixing a
 * customer's access by hand. This pins both halves: the plain write is put
 * back, the documented one lands.
 */

let db: PGlite
let userId: string

beforeAll(async () => {
  db = await migratedDb()
  userId = await createUser(db, 'buyer@example.com')
})

afterAll(async () => {
  await db.close()
})

const status = () =>
  scalar<string>(db, 'select subscription_status from public.profiles where id = $1', [userId])

describe('correcting an entitlement in the SQL editor', () => {
  it('quietly ignores a plain update by the owner', async () => {
    await db.query(`update public.profiles set subscription_status = 'active' where id = $1`, [userId])
    expect(await status()).toBe('free')
  })

  it('applies the documented correction', async () => {
    await db.exec(`
      begin;
      select set_config('request.jwt.claim.role', 'service_role', true);
      update public.profiles set subscription_status = 'active' where id = '${userId}';
      commit;
    `)
    expect(await status()).toBe('active')
    // The claim was local to the transaction: the next plain write is guarded again.
    await db.query(`update public.profiles set subscription_status = 'canceled' where id = $1`, [userId])
    expect(await status()).toBe('active')
  })
})
