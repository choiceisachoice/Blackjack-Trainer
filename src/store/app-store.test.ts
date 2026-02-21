import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from './app-store'
import { CountingSystemId } from '../engine/counting/types'
import { DEFAULT_RULES } from '../engine/rules/types'
import { soundEngine } from '../services/sound-engine'

describe('app-store', () => {
  beforeEach(() => {
    localStorage.removeItem('bjt_theme')
    useAppStore.setState({
      currentMode: 'home',
      selectedSystem: CountingSystemId.HiLo,
      selectedRules: DEFAULT_RULES,
      soundEnabled: true,
      soundVolume: 0.15,
      theme: 'dark',
    })
    soundEngine.enabled = true
    soundEngine.volume = 0.15
    document.documentElement.setAttribute('data-theme', 'dark')
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

  it('toggleSound flips soundEnabled', () => {
    expect(useAppStore.getState().soundEnabled).toBe(true)
    useAppStore.getState().toggleSound()
    expect(useAppStore.getState().soundEnabled).toBe(false)
    expect(soundEngine.enabled).toBe(false)

    useAppStore.getState().toggleSound()
    expect(useAppStore.getState().soundEnabled).toBe(true)
    expect(soundEngine.enabled).toBe(true)
  })

  it('setSoundVolume updates volume', () => {
    useAppStore.getState().setSoundVolume(0.8)
    expect(useAppStore.getState().soundVolume).toBeCloseTo(0.8)
    expect(soundEngine.volume).toBeCloseTo(0.8)
  })

  it('setSoundVolume clamps to 0-1', () => {
    useAppStore.getState().setSoundVolume(-1)
    expect(useAppStore.getState().soundVolume).toBe(0)

    useAppStore.getState().setSoundVolume(5)
    expect(useAppStore.getState().soundVolume).toBe(1)
  })

  // ── Theme Tests ──

  it('theme defaults to dark', () => {
    expect(useAppStore.getState().theme).toBe('dark')
  })

  it('toggleTheme switches dark to light', () => {
    useAppStore.getState().toggleTheme()
    expect(useAppStore.getState().theme).toBe('light')
  })

  it('toggleTheme switches light to dark', () => {
    useAppStore.getState().setTheme('light')
    useAppStore.getState().toggleTheme()
    expect(useAppStore.getState().theme).toBe('dark')
  })

  it('setTheme sets specific theme', () => {
    useAppStore.getState().setTheme('light')
    expect(useAppStore.getState().theme).toBe('light')

    useAppStore.getState().setTheme('dark')
    expect(useAppStore.getState().theme).toBe('dark')
  })

  it('theme persists to localStorage', () => {
    useAppStore.getState().toggleTheme()
    expect(localStorage.getItem('bjt_theme')).toBe('light')

    useAppStore.getState().toggleTheme()
    expect(localStorage.getItem('bjt_theme')).toBe('dark')
  })

  it('setTheme persists to localStorage', () => {
    useAppStore.getState().setTheme('light')
    expect(localStorage.getItem('bjt_theme')).toBe('light')
  })

  it('data-theme attribute is set on html element', () => {
    useAppStore.getState().toggleTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    useAppStore.getState().toggleTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
