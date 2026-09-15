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
