import { describe, it, expect } from 'vitest'
import { BET_CAP, BET_CHIPS, betReason, chipForKey, money, rampStepOfBet, rampStepOfTc, signed } from './bet-model'
import { BET_SPREAD } from './bet-spread-math'

describe('the chip rack', () => {
  it('builds every bet the drill asks for, at every table, from its chips', () => {
    for (const min of [5, 10, 15, 25, 50, 100]) {
      for (const step of BET_SPREAD) {
        let left = step.multiplier * min
        let chips = 0
        for (const c of [...BET_CHIPS].reverse()) {
          while (left >= c) { left -= c; chips++ }
        }
        expect(left).toBe(0)
        // Never more than six clicks for a right answer.
        expect(chips).toBeLessThanOrEqual(6)
      }
    }
  })

  it('caps the felt far above every right answer, the same at every table', () => {
    expect(BET_CAP).toBeGreaterThan(16 * 100)
  })

  it('maps 1–5 to the chips, smallest first, and nothing else', () => {
    expect(['1', '2', '3', '4', '5'].map(chipForKey)).toEqual([5, 25, 100, 500, 1000])
    expect(chipForKey('6')).toBeNull()
    expect(chipForKey('a')).toBeNull()
  })
})

describe('ramp steps', () => {
  it('finds the step of a bet, or none for a bet off the ramp', () => {
    expect(rampStepOfBet(25, 25)).toBe(0)
    expect(rampStepOfBet(100, 25)).toBe(2)
    expect(rampStepOfBet(400, 25)).toBe(4)
    expect(rampStepOfBet(35, 25)).toBe(-1)
  })

  it('floors a fractional true count onto its step', () => {
    expect(rampStepOfTc(-1)).toBe(0)
    expect(rampStepOfTc(1.5)).toBe(0)
    expect(rampStepOfTc(2)).toBe(1)
    expect(rampStepOfTc(3.5)).toBe(2)
    expect(rampStepOfTc(7)).toBe(4)
  })
})

describe('betReason', () => {
  it('names the step when the count alone does not say it', () => {
    const r = betReason({ tc: 3.5, tableMin: 50, correctBet: 200 })
    expect(r.key).toBe('training.bet.reason')
    expect(r.values).toMatchObject({ tc: 'TC +3.5', step: 'TC +3', count: 4, min: '$50', bet: '$200' })
    expect(betReason({ tc: 0, tableMin: 25, correctBet: 25 }).values.step).toBe('TC ≤ +1')
  })

  it('leaves the step out when it is the count itself', () => {
    const r = betReason({ tc: 3, tableMin: 25, correctBet: 100 })
    expect(r.key).toBe('training.bet.reasonPlain')
    expect(r.values.count).toBe(4)
  })
})

describe('formats', () => {
  it('writes counts with an ASCII sign the tests and demo scripts can read back', () => {
    expect(signed(3)).toBe('+3')
    expect(signed(0)).toBe('+0')
    expect(signed(-1)).toBe('-1')
    expect(money(1600)).toBe('$1,600')
  })
})
