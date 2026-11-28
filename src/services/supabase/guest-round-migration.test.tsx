import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The trial round and the accounts that come after it.
 *
 * Until 23 Nov 2026 the trial was ten flashcards, recorded on the device and
 * handed to the account created afterwards; this file followed that round
 * from the first hand to the new account's history. The trial is now ten
 * hands at the casino table, and the table records nothing - so the first
 * half of the file is turned around: a table round leaves nothing on the
 * device and sends nothing anywhere, and a new account starts clean.
 *
 * The second half stays, because devices that played the old round still
 * hold it, stamped. Those rounds are seeded here the way the old round left
 * them (a flashcards session written by the ordinary recording, plus the
 * stamp), and the sign-in merge must still give them only to the account
 * created after them.
 *
 * Everything between the click and the cloud runs for real: the page, the
 * table, the stats store, the storage facade, the sign-in merge and the
 * Supabase storage service. Only the Supabase client is a stand-in - a table
 * in a Map, keyed by id the way the real one is - and the auth store, which
 * says who is signed in.
 */

type Row = { id: string; user_id: string } & Record<string, unknown>

const cloud = vi.hoisted(() => ({
  rows: new Map<string, { id: string; user_id: string } & Record<string, unknown>>(),
  /** Every upsert that reached "the network", as the list of ids it carried. */
  upserts: [] as string[][],
  userId: 'new-user',
  createdAt: '2026-11-22T10:00:00.000Z',
  status: 'signedOut' as string,
}))

vi.mock('./client', () => {
  const upsert = (payload: Row | Row[]) => {
    const rows = Array.isArray(payload) ? payload : [payload]
    cloud.upserts.push(rows.map(r => r.id))
    rows.forEach(r => cloud.rows.set(r.id, r))
    return Promise.resolve({ error: null })
  }
  const read = () => Promise.resolve({
    data: [...cloud.rows.values()].filter(r => r.user_id === cloud.userId), error: null,
  })
  const anything = (): unknown => new Proxy(() => {}, {
    get: (_t, key) => key === 'then'
      ? (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res)
      : () => anything(),
  })
  const from = (table: string) => table === 'training_sessions'
    ? {
        upsert,
        // The paged read: `.eq().order().order().range(from, to)`.
        select: () => {
          const q = {
            eq: () => q,
            order: () => q,
            range: (from: number, to: number) => read()
              .then(r => ({ ...r, data: r.data.slice(from, to + 1) })),
          }
          return q
        },
      }
    : anything()
  return {
    isSupabaseConfigured: true,
    supabase: null,
    requireSupabase: () => ({
      from,
      auth: {
        getSession: async () => ({
          data: {
            session: cloud.status === 'signedIn'
              ? { user: { id: cloud.userId, created_at: cloud.createdAt } }
              : null,
          },
        }),
      },
    }),
  }
})

vi.mock('../../store/auth-store', () => ({
  useAuthStore: Object.assign(
    () => cloud.status,
    {
      getState: () => ({
        status: cloud.status,
        user: cloud.status === 'signedIn' ? { id: cloud.userId } : null,
        signOut: async () => {},
      }),
      setState: vi.fn(),
      // The table's saved-session store listens for sign-outs when it loads.
      subscribe: () => () => {},
    },
  ),
  isSupabaseConfigured: true,
}))

vi.mock('./profiles-sync', () => ({
  pushProfileScalars: vi.fn(),
  pushProfileScalarsNow: vi.fn(async () => {}),
  syncProfileOnSignIn: vi.fn(async () => {}),
  resetProfileSync: vi.fn(),
}))
vi.mock('./achievements-sync', () => ({
  syncAchievementsOnSignIn: vi.fn(async () => {}),
  pushNewUnlocks: vi.fn(),
  clearCloudAchievements: vi.fn(async () => {}),
}))
// The sounds of a right and a wrong answer; jsdom has no audio to play them on.
vi.mock('../sound-engine', () => ({
  // Every sound the table can make, as a no-op.
  soundEngine: new Proxy({}, { get: () => () => {}, set: () => true }),
}))
vi.mock('framer-motion', async () => {
  const strip = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([k]) => k.startsWith('data-') || k.startsWith('aria-') || ['className', 'style', 'onClick', 'id', 'role'].includes(k)))
  return {
    motion: new Proxy({}, {
      get: (_t, tag: string) => ({ children, ...p }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement(tag, strip(p), children),
    }),
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    MotionConfig: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useReducedMotion: () => false,
  }
})
vi.mock('../../components/table/ShoeProgress', () => ({ ShoeHousing: () => <div />, DiscardTray: () => <div /> }))

import { TryPage } from '../../pages/TryPage'
import { useStatsStore } from '../../store/stats-store'
import { useLevelStore } from '../../store/level-store'
import { levelSystem } from '../level-system'
import { localStorageService } from '../storage/storage-service'
import { resetPendingSessions } from '../storage/pending-sessions'
import { getLocalOwner, setLocalOwner } from '../storage/local-owner'
import { guestRoundSince, GUEST_ROUND_HANDS, GUEST_SINCE_KEY } from '../guest-trial'
import { handleSignedIn, signOutAndClearLocal } from './cloud-sync'
import { useCloudSyncStore } from '../../store/cloud-sync-store'
import { useAppStore } from '../../store/app-store'
import { usePlanPriceStore } from '../../store/plan-price-store'
import { Shoe } from '../../engine/shoe/shoe'
import { Rank, Suit, type Card } from '../../engine/shoe/types'

const c = (rank: Rank, suit: Suit = Suit.Spades): Card => ({ rank, suit })
/** 10,6 against a 10 that stands on 17, every hand. */
const SIXTEEN_VS_TEN = [c(Rank.Ten), c(Rank.Ten, Suit.Hearts), c(Rank.Six), c(Rank.Seven, Suit.Hearts)]
const tick = () => act(() => { vi.advanceTimersByTime(10_000) })

/** Sit down at /try as a visitor and play all ten hands to the summary. */
function playTable() {
  vi.useFakeTimers()
  let n = 0
  vi.spyOn(Shoe.prototype, 'deal').mockImplementation(() => SIXTEEN_VS_TEN[n++ % SIXTEEN_VS_TEN.length])
  render(<MemoryRouter initialEntries={['/try']}><TryPage /></MemoryRouter>)
  fireEvent.click(screen.getByTestId('try-start'))
  for (let i = 0; i < GUEST_ROUND_HANDS; i++) {
    tick()
    fireEvent.click(screen.getByTestId('action-stand'))
    tick()
    fireEvent.click(screen.getByTestId('next-hand'))
  }
  tick()
  expect(screen.getByTestId('try-summary')).toBeInTheDocument()
  vi.useRealTimers()
}

/**
 * The flashcard round as it was left on devices before 23 Nov 2026: a
 * session written by the ordinary recording, with nobody signed in, and the
 * stamp of when the round began.
 */
async function oldRoundOnDevice(at = Date.now()) {
  localStorage.setItem(GUEST_SINCE_KEY, String(at))
  await useStatsStore.getState().recordSession({
    mode: 'deviationFlashCards',
    startTime: at,
    totalQuestions: GUEST_ROUND_HANDS,
    correctAnswers: 8,
    bestStreak: 5,
    details: { type: 'deviationFlashCards', deviationSet: 'all', perDeviation: {} },
  })
}

/** The visitor signs up (or somebody signs in) and the app runs its sign-in merge. */
async function signInAs(userId: string, createdAt: string) {
  cloud.userId = userId
  cloud.createdAt = createdAt
  cloud.status = 'signedIn'
  await handleSignedIn()
}

const localSessions = () => localStorageService.getAllSessionResults()
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString()
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()

beforeEach(async () => {
  // A device nobody has signed in on. The sign-out resets the merge's own
  // bookkeeping between tests, as it does between people.
  cloud.status = 'signedOut'
  await signOutAndClearLocal({ discardUnsaved: true })
  localStorage.clear()
  resetPendingSessions()
  levelSystem.reload()
  useLevelStore.getState().refresh()
  useStatsStore.setState({ sessions: [], lifetimeStats: null, isLoading: false })
  useCloudSyncStore.setState({ status: 'idle' })
  useAppStore.setState({ dealingSpeed: 'fast' })
  usePlanPriceStore.setState({ status: 'error', plans: [], load: async () => {} })
  cloud.rows.clear()
  cloud.upserts.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('a round at the guest table', () => {
  it('leaves nothing on the device and sends nothing anywhere', async () => {
    playTable()
    expect(await localSessions()).toHaveLength(0)
    expect(cloud.upserts).toHaveLength(0)
    expect(getLocalOwner()).toBeNull()
    expect(guestRoundSince()).toBeNull()
  })

  it('gives the account created afterwards a clean start - the summary promised nothing else', async () => {
    playTable()
    await signInAs('new-user', minutesFromNow(3))
    expect(cloud.rows.size).toBe(0)
    expect(useStatsStore.getState().sessions).toHaveLength(0)
    expect(getLocalOwner()).toBe('new-user')
  })

  it('leaves nothing for an account whose data is still on the device', async () => {
    setLocalOwner('previous-user')
    playTable()
    expect(await localSessions()).toHaveLength(0)
    await signInAs('previous-user', daysAgo(90))
    expect(cloud.rows.size).toBe(0)
  })
})

describe('a flashcard round played before the table, then a new account', () => {
  it('arrives in the account created afterwards - once', async () => {
    await oldRoundOnDevice()
    const [played] = await localSessions()

    await signInAs('new-user', minutesFromNow(3))

    expect(cloud.rows.size).toBe(1)
    expect(cloud.rows.get(played.id)).toMatchObject({ user_id: 'new-user', mode: 'deviationFlashCards' })
    expect(getLocalOwner()).toBe('new-user')
    expect(useStatsStore.getState().sessions.map(s => s.id)).toEqual([played.id])
    // Claimed: the stamp has done its work.
    expect(guestRoundSince()).toBeNull()

    // The next page load runs the merge again. Same id, same row.
    await handleSignedIn()
    expect(cloud.rows.size).toBe(1)
    expect(useStatsStore.getState().sessions).toHaveLength(1)
  })

  it('is not filed in an account that existed before it was played', async () => {
    // A shared computer: a visitor played, left, and somebody else signs in
    // to the account they have had for a year.
    await oldRoundOnDevice()
    expect(await localSessions()).toHaveLength(1)

    await signInAs('old-user', daysAgo(365))

    expect(cloud.upserts).toHaveLength(0)
    expect(cloud.rows.size).toBe(0)
    expect(await localSessions()).toHaveLength(0)
    expect(useStatsStore.getState().sessions).toHaveLength(0)
    expect(getLocalOwner()).toBe('old-user')
    expect(guestRoundSince()).toBeNull()
  })
})
