import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './app-store'
import { CountingSystemId } from '../engine/counting/types'
import { DEFAULT_RULES } from '../engine/rules/types'

describe('app-store', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentMode: 'home',
      selectedSystem: CountingSystemId.HiLo,
      selectedRules: DEFAULT_RULES,
    })
  })

  it('default mode is home', () => {
    expect(useAppStore.getState().currentMode).toBe('home')
  })

  it('setMode changes current mode', () => {
    useAppStore.getState().setMode('speedDrill')
    expect(useAppStore.getState().currentMode).toBe('speedDrill')

    useAppStore.getState().setMode('tableCounting')
    expect(useAppStore.getState().currentMode).toBe('tableCounting')
  })

  it('default system is HiLo', () => {
    expect(useAppStore.getState().selectedSystem).toBe(CountingSystemId.HiLo)
  })

  it('setSystem changes selected system', () => {
    useAppStore.getState().setSystem(CountingSystemId.KO)
    expect(useAppStore.getState().selectedSystem).toBe(CountingSystemId.KO)

    useAppStore.getState().setSystem(CountingSystemId.WongHalves)
    expect(useAppStore.getState().selectedSystem).toBe(CountingSystemId.WongHalves)
  })

  it('default rules are DEFAULT_RULES', () => {
    expect(useAppStore.getState().selectedRules).toEqual(DEFAULT_RULES)
  })

  it('setRules changes selected rules', () => {
    const customRules = { ...DEFAULT_RULES, numDecks: 8, penetration: 0.8 }
    useAppStore.getState().setRules(customRules)
    expect(useAppStore.getState().selectedRules).toEqual(customRules)
  })
})
