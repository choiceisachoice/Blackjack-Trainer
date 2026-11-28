import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '../../i18n'
import { usePlanPriceStore } from '../../store/plan-price-store'
import { SignupContext } from './SignupContext'

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  usePlanPriceStore.setState({ status: 'idle', plans: [] })
})

describe('SignupContext', () => {
  it('names the plan, the real price, step 1 of 2 and the way out', () => {
    usePlanPriceStore.setState({
      status: 'ready',
      plans: [
        { id: 'monthly', amount: 890, currency: 'chf', interval: 'month' },
        { id: 'yearly', amount: 6900, currency: 'chf', interval: 'year' },
      ],
    } as never)
    render(<SignupContext plan="yearly" />)
    const panel = screen.getByTestId('signup-pro-panel')
    expect(panel).toHaveTextContent('Pro · Yearly')
    expect(screen.getByTestId('signup-price')).toHaveTextContent(/69/)
    expect(panel).toHaveTextContent('Create your account')
    expect(panel).toHaveTextContent('Secure checkout with Stripe')
    expect(panel).toHaveTextContent(/5\.75/)
    expect(panel).toHaveTextContent(/cancel anytime/i)
    expect(screen.getByTestId('signup-pro-strip')).toHaveTextContent(/Step 1 of 2/)
  })

  it('says the price comes at checkout when it cannot be confirmed', () => {
    usePlanPriceStore.setState({ status: 'error', plans: [] })
    render(<SignupContext plan="monthly" />)
    expect(screen.getByTestId('signup-price')).toHaveTextContent(/price shown at checkout/i)
  })

  it('without a purchase, says what a free account keeps', () => {
    render(<SignupContext plan={null} />)
    expect(screen.getByTestId('signup-free-panel')).toHaveTextContent(/training plan/i)
    expect(screen.queryByTestId('signup-pro-panel')).toBeNull()
  })
})
