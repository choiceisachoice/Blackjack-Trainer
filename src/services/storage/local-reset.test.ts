import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearLocalAppData,
  getLocalOwner,
  setLocalOwner,
  LOCAL_OWNER_KEY,
} from './local-reset'
import { achievementEngine } from '../achievements/achievement-engine'
import { levelSystem } from '../level-system'
import { useBankrollTrackerStore } from '../../store/bankroll-tracker-store'

describe('local-reset — account isolation', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('tracks which user the local caches belong to', () => {
    expect(getLocalOwner()).toBeNull()
    setLocalOwner('user-a')
    expect(getLocalOwner()).toBe('user-a')
  })

  it('wipes every user-data key but keeps device preferences', () => {
    // User data — must all go.
    localStorage.setItem('bjt_sessions', '[{"id":"1"}]')
    localStorage.setItem('bjt_achievements', '[{"achievementId":"first_hand"}]')
    localStorage.setItem('bjt_level_xp', '68000')
    localStorage.setItem('bjt_sim_count', '7')
    localStorage.setItem('bjt_bankroll_tracker', '{"state":{"sessions":[{"result":500}]}}')
    localStorage.setItem('bjt_daily_challenge', '{}')
    localStorage.setItem('bjt_cloud_migrated_user-a', '2026-07-10')
    localStorage.setItem(LOCAL_OWNER_KEY, 'user-a')
    // Device preferences — must survive.
    localStorage.setItem('bjt_theme', 'dark')
    localStorage.setItem('bjt_sound_settings', '{"enabled":true}')
    localStorage.setItem('bjt_dealing_speed', 'fast')
    localStorage.setItem('bjt_ambient_volume', '0.5')
    // Foreign key — untouched.
    localStorage.setItem('other_app_key', 'keep me')

    clearLocalAppData()

    for (const gone of [
      'bjt_sessions', 'bjt_achievements', 'bjt_level_xp', 'bjt_sim_count',
      'bjt_daily_challenge', 'bjt_cloud_migrated_user-a', LOCAL_OWNER_KEY,
    ]) {
      expect(localStorage.getItem(gone), `${gone} must be wiped`).toBeNull()
    }

    expect(localStorage.getItem('bjt_theme')).toBe('dark')
    expect(localStorage.getItem('bjt_sound_settings')).toBe('{"enabled":true}')
    expect(localStorage.getItem('bjt_dealing_speed')).toBe('fast')
    expect(localStorage.getItem('bjt_ambient_volume')).toBe('0.5')
    expect(localStorage.getItem('other_app_key')).toBe('keep me')
  })

  it('resets the in-memory engines so they cannot serve the old user data', () => {
    levelSystem.setTotalXP(68_000)
    achievementEngine.setSimCounters(7, 150)
    expect(levelSystem.getTotalXP()).toBe(68_000)

    clearLocalAppData()

    expect(levelSystem.getTotalXP()).toBe(0)
    expect(levelSystem.getLevel().level).toBe(1)
    expect(achievementEngine.getUnlockedCount()).toBe(0)
    expect(achievementEngine.getSimCount()).toBe(0)
    expect(achievementEngine.getBestSimEdge()).toBe(0)
  })

  it('empties the bankroll tracker, including the starting bankroll', () => {
    useBankrollTrackerStore.setState({
      sessions: [{
        id: crypto.randomUUID(), date: '2026-07-01', casino: 'Bellagio',
        result: 500, hoursPlayed: 3, notes: '', createdAt: 1,
      }],
      startingBankroll: 10_000,
    })

    clearLocalAppData()

    const state = useBankrollTrackerStore.getState()
    expect(state.sessions).toEqual([])
    expect(state.startingBankroll).toBe(0)
  })
})
