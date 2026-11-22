import { describe, it, expect } from 'vitest'
import { trialTableConfig, isTrialTable } from './trial-table'
import { DEFAULT_CONFIG } from './helpers'
import { CasinoSessionEngine } from '../../engine/casino-session/session-engine'
import { parseSnapshot } from '../../engine/casino-session/session-snapshot'

describe('trialTableConfig', () => {
  const config = trialTableConfig()

  it('is labelled as the trial', () => {
    expect(config.trial).toBe(true)
  })

  it('is the default table: same rules, same stakes, other players at it', () => {
    expect(config.numDecks).toBe(DEFAULT_CONFIG.numDecks)
    expect(config.blackjackPays).toBe(DEFAULT_CONFIG.blackjackPays)
    expect(config.dealerHitsSoft17).toBe(DEFAULT_CONFIG.dealerHitsSoft17)
    expect(config.minBet).toBe(DEFAULT_CONFIG.minBet)
    expect(config.maxBet).toBe(DEFAULT_CONFIG.maxBet)
    expect(config.startingBankroll).toBe(DEFAULT_CONFIG.startingBankroll)
    expect(config.numBots).toBeGreaterThan(0)
  })

  it('is graded on basic strategy and asks nothing about the count', () => {
    expect(config.playStyle).toBe('basic')
    expect(config.countCheckFrequency).toBe('never')
    expect(config.showDeviationHints).toBe(false)
  })

  it('reviews every hand', () => {
    expect(config.trainingMode).toBe(true)
  })

  it('keeps what belongs to the setup screen out', () => {
    expect(config.multiHand).toBe(false)
    // The trial count ends the table; a target of its own would ask twice.
    expect(config.sessionMode).toBe('unlimited')
  })

  it('seats a table the engine accepts, and the label survives being saved', () => {
    const engine = new CasinoSessionEngine(config)
    const saved = parseSnapshot(JSON.parse(JSON.stringify(engine.snapshot())))
    expect(saved?.config.trial).toBe(true)
  })

  it('a saved table with a label that is not a yes or a no is not read', () => {
    const raw = JSON.parse(JSON.stringify(new CasinoSessionEngine(config).snapshot())) as { config: Record<string, unknown> }
    raw.config.trial = 'yes'
    expect(parseSnapshot(raw)).toBeNull()
  })
})

describe('isTrialTable', () => {
  it('is the trial for an account without Pro', () => {
    expect(isTrialTable(trialTableConfig(), false)).toBe(true)
  })

  it('stops being one the moment the account has Pro', () => {
    expect(isTrialTable(trialTableConfig(), true)).toBe(false)
  })

  it('is never one for an ordinary table', () => {
    expect(isTrialTable(DEFAULT_CONFIG, false)).toBe(false)
  })
})
