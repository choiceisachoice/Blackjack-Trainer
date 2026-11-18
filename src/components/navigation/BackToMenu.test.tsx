import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BackToMenu } from './BackToMenu'
import { useAppStore } from '../../store/app-store'
import { useLiveSessionStore } from '../../store/live-session-store'

describe('BackToMenu', () => {
  beforeEach(() => {
    useAppStore.setState({ currentMode: 'speedDrill' })
    useLiveSessionStore.getState().endSession()
  })

  it('says where it goes and goes there', () => {
    render(<BackToMenu />)
    const button = screen.getByTestId('back-to-menu')
    expect(button).toHaveTextContent('Back to main menu')
    fireEvent.click(button)
    expect(useAppStore.getState().currentMode).toBe('home')
  })

  it('gives its row to a running drill on a phone held sideways, and only there', () => {
    render(<BackToMenu />)
    const bar = screen.getByTestId('back-to-menu-bar')
    // Hidden only under the `short` variant and only beside a `data-drill-run`
    // root — never unconditionally, or the way back is gone on every screen.
    const hiding = bar.className.split(/\s+/).filter(c => c.endsWith(':hidden'))
    expect(hiding).toHaveLength(1)
    expect(hiding[0]).toMatch(/^short:/)
    expect(hiding[0]).toContain('[data-drill-run]')
    expect(bar.className).not.toMatch(/(^|\s)hidden(\s|$)/)
  })

  it('asks before leaving a running Casino Session instead of ending it', () => {
    useAppStore.setState({ currentMode: 'casinoSession' })
    useLiveSessionStore.getState().beginSession('casinoSession')
    render(<BackToMenu />)
    fireEvent.click(screen.getByTestId('back-to-menu'))
    // The guard holds the mode and raises the dialog; the session survives.
    expect(useAppStore.getState().currentMode).toBe('casinoSession')
    expect(useLiveSessionStore.getState().pending).not.toBeNull()
    expect(useLiveSessionStore.getState().activeMode).toBe('casinoSession')
  })
})
