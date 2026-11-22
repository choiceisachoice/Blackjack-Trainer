import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The trial round, from the first hand to the new account's history.
 *
 * Everything between the click and the cloud runs for real: the page, the
 * flashcards component, the session recording, the stats store, the storage
 * facade, the sign-in merge and the Supabase storage service. Only the
 * Supabase client is a stand-in — a table in a Map, keyed by id the way the
 * real one is — and the auth store, which says who is signed in.
 *
 * What this cannot show: that the real Supabase behaves like the stand-in,
 * and that the browser a confirmation mail is opened in is the browser the
 * round was played in.
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
    ? { upsert, select: () => ({ eq: () => ({ order: read }) }) }
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
  // Every sound the round can make — an answer, a streak, the level reached
  // with the first session's XP — as a no-op.
  soundEngine: new Proxy({}, { get: () => () => {} }),
}))

import { TryPage } from '../../pages/TryPage'
import { useStatsStore } from '../../store/stats-store'
import { useLevelStore } from '../../store/level-store'
import { levelSystem } from '../level-system'
import { localStorageService } from '../storage/storage-service'
import { resetPendingSessions } from '../storage/pending-sessions'
import { getLocalOwner, setLocalOwner } from '../storage/local-owner'
import { guestRoundSince, GUEST_ROUND_HANDS } from '../guest-trial'
import { handleSignedIn, signOutAndClearLocal } from './cloud-sync'
import { useCloudSyncStore } from '../../store/cloud-sync-store'

/** Play the whole round as a visitor: any answer, then on to the next hand. */
function playRound() {
  render(<MemoryRouter initialEntries={['/try']}><TryPage /></MemoryRouter>)
  fireEvent.click(screen.getByTestId('try-start'))
  for (let i = 0; i < GUEST_ROUND_HANDS; i++) {
    fireEvent.click(screen.getByTestId('action-hit'))
    fireEvent.click(screen.getByTestId('next-question'))
  }
  expect(screen.getByTestId('try-summary')).toBeInTheDocument()
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
  cloud.rows.clear()
  cloud.upserts.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('a trial round, then a new account', () => {
  it('is recorded on the device without a single request', async () => {
    playRound()
    const sessions = await localSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ mode: 'deviationFlashCards', totalQuestions: GUEST_ROUND_HANDS })
    expect(cloud.upserts).toHaveLength(0)
    expect(getLocalOwner()).toBeNull()
    expect(guestRoundSince()).not.toBeNull()
  })

  it('arrives in the account created afterwards — once', async () => {
    playRound()
    const [played] = await localSessions()

    await signInAs('new-user', minutesFromNow(3))

    expect(cloud.rows.size).toBe(1)
    expect(cloud.rows.get(played.id)).toMatchObject({ user_id: 'new-user', mode: 'deviationFlashCards' })
    expect(getLocalOwner()).toBe('new-user')
    // The new account's history shows the round it was promised.
    expect(useStatsStore.getState().sessions.map(s => s.id)).toEqual([played.id])
    // Claimed: the stamp has done its work.
    expect(guestRoundSince()).toBeNull()

    // The next page load runs the merge again. Same id, same row.
    await handleSignedIn()
    expect(cloud.rows.size).toBe(1)
    expect(useStatsStore.getState().sessions).toHaveLength(1)
  })
})

describe('a trial round on a device that is not the new customer’s alone', () => {
  it('is not filed in an account that existed before it was played', async () => {
    // A shared computer: a visitor plays, leaves, and somebody else signs in
    // to the account they have had for a year.
    playRound()
    expect(await localSessions()).toHaveLength(1)

    await signInAs('old-user', daysAgo(365))

    expect(cloud.upserts).toHaveLength(0)
    expect(cloud.rows.size).toBe(0)
    expect(await localSessions()).toHaveLength(0)
    expect(useStatsStore.getState().sessions).toHaveLength(0)
    expect(getLocalOwner()).toBe('old-user')
    expect(guestRoundSince()).toBeNull()
  })

  it('is played but not recorded where an account’s data is still on the device', async () => {
    // A session that expired without a sign-out: the owner record and the
    // account's local history are still here, and nobody is signed in.
    setLocalOwner('previous-user')
    playRound()

    expect(await localSessions()).toHaveLength(0)
    expect(guestRoundSince()).toBeNull()

    // That account signing in again uploads nothing it did not play…
    await signInAs('previous-user', daysAgo(90))
    expect(cloud.rows.size).toBe(0)
  })

  it('…and a new account on that device gets a clean one', async () => {
    setLocalOwner('previous-user')
    playRound()
    await signInAs('new-user', minutesFromNow(3))
    expect(cloud.rows.size).toBe(0)
    expect(getLocalOwner()).toBe('new-user')
  })
})
