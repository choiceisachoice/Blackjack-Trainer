import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ChallengeMeterView } from './ChallengeMeterView'
import { challengeMeter } from './challenge-meter'

afterEach(cleanup)

describe('ChallengeMeterView', () => {
  it('draws one slot per unit of a small tally, the done ones filled', () => {
    const meter = challengeMeter({ type: 'win_streak', progress: 2, target: 5, completed: false })
    render(<ChallengeMeterView meter={meter} done={false} label="2 / 5" />)
    const pips = screen.getByTestId('challenge-pips')
    const slots = pips.querySelectorAll('[data-filled]')
    expect(slots).toHaveLength(5)
    expect([...slots].filter(s => s.getAttribute('data-filled') === 'true')).toHaveLength(2)
    expect(pips).toHaveAccessibleName('2 / 5')
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
  })

  it('draws a bar for a large tally, filled to its share', () => {
    const meter = challengeMeter({ type: 'play_hands', progress: 50, target: 200, completed: false })
    render(<ChallengeMeterView meter={meter} done={false} label="50 / 200" />)
    expect(screen.queryByTestId('challenge-pips')).toBeNull()
    expect(screen.getByTestId('progress-bar').style.width).toBe('25%')
  })

  it('turns the slots green once the challenge is done', () => {
    const meter = challengeMeter({ type: 'win_streak', progress: 5, target: 5, completed: true })
    render(<ChallengeMeterView meter={meter} done label="Complete" />)
    const slots = screen.getByTestId('challenge-pips').querySelectorAll('[data-filled="true"]')
    expect(slots).toHaveLength(5)
    slots.forEach(s => expect(s.className).toContain('bg-success'))
  })
})
