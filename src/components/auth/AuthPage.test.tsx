import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AuthPage } from './AuthPage'

describe('AuthPage', () => {
  it('renders the sign-in form by default', () => {
    render(<AuthPage />)
    expect(screen.getByTestId('auth-email')).toBeInTheDocument()
    expect(screen.getByTestId('auth-password')).toBeInTheDocument()
    expect(screen.getByTestId('auth-submit')).toHaveTextContent('Sign In')
    // Username is a register-only field.
    expect(screen.queryByPlaceholderText('cardcounter')).not.toBeInTheDocument()
  })

  it('reveals the username field in register mode', () => {
    render(<AuthPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Register' }))
    expect(screen.getByPlaceholderText('cardcounter')).toBeInTheDocument()
    expect(screen.getByTestId('auth-submit')).toHaveTextContent('Create Account')
  })
})
