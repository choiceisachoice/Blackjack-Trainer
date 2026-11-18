import { supabase } from '../supabase/client'

/**
 * The operator's list of client failures: what `client_failures_recent`
 * returns (migration `20261118120000_client_failures.sql`).
 *
 * The rows are written by `services/failure-report.ts` from the browsers of
 * visitors; this module only reads them for the admin page.
 */

/** The migration that creates the table and its functions. */
export const CLIENT_FAILURES_MIGRATION = '20261118120000_client_failures.sql'

export interface ClientFailure {
  id: number
  /** ISO instant, stamped by the server when the report arrived. */
  occurred_at: string
  /** The call site: `checkout`, `billing-portal`, … */
  place: string
  message: string
  /** The pathname the visitor was on, or null. */
  path: string | null
  /** Whether the report came with a verified sign-in. */
  signed_in: boolean
  app_build: string | null
}

/**
 * Either the rows, or the one situation the page words differently from an
 * error: the function does not exist because the migration was not pushed.
 */
export type ClientFailuresResult =
  | { kind: 'ok'; rows: ClientFailure[] }
  | { kind: 'missing-migration' }

/**
 * Fetch the latest failures, newest first.
 *
 * Throws on any other failure, including "not an admin" — the page shows one
 * sentence for all of them.
 *
 * @param limit - How many rows; the server clamps it to 1..200
 */
export async function fetchClientFailures(limit = 50): Promise<ClientFailuresResult> {
  if (!supabase) throw new Error('Failures are unavailable in this environment.')
  const { data, error } = await supabase.rpc('client_failures_recent', { p_limit: limit })
  if (error) {
    if (error.code === 'PGRST202') return { kind: 'missing-migration' }
    throw error
  }
  return { kind: 'ok', rows: (data ?? []) as ClientFailure[] }
}
