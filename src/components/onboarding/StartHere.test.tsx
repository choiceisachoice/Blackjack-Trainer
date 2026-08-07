import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { StartHere } from './StartHere'
import { useAppStore } from '../../store/app-store'
import { isRecommendationDone } from '../../services/recommendation'

beforeEach(() => {
  localStorage.clear()
  useAppStore.setState({ currentMode: 'home' })
})

afterEach(cleanup)

/** Place the learner as the starting-point question would. */
const placeAt = (stage: string) => localStorage.setItem('bjt_placement', stage)

describe('when the card shows at all', () => {
  it('stays away from someone who skipped the question', () => {
    render(<StartHere onTour={() => {}} />)
    expect(screen.queryByTestId('start-here')).toBeNull()
  })

  it('stays away once it has been dealt with', () => {
    placeAt('hi-lo')
    localStorage.setItem('bjt_recommendation_done', '1')
    render(<StartHere onTour={() => {}} />)
    expect(screen.queryByTestId('start-here')).toBeNull()
  })

  it('shows for a freshly placed learner', () => {
    placeAt('hi-lo')
    render(<StartHere onTour={() => {}} />)
    expect(screen.getByTestId('start-here')).toBeInTheDocument()
  })
})

describe('what it recommends', () => {
  it('sends the complete beginner to read, and opens the Learn page', () => {
    placeAt('rules')
    render(<StartHere onTour={() => {}} />)

    expect(screen.getByTestId('start-here-headline')).toHaveTextContent(/read/i)
    expect(screen.getByTestId('start-here-reason')).toHaveTextContent(/never played/i)

    fireEvent.click(screen.getByTestId('start-here-go'))
    expect(useAppStore.getState().currentMode).toBe('learn')
  })

  it('sends a placed learner to the drill their stage is measured on', () => {
    // hi-lo is measured by Speed Drill. Pointing anywhere else would advertise
    // progress the drill cannot make.
    placeAt('hi-lo')
    render(<StartHere onTour={() => {}} />)

    fireEvent.click(screen.getByTestId('start-here-go'))
    expect(useAppStore.getState().currentMode).toBe('speedDrill')
  })

  it('credits the stages an experienced learner skipped', () => {
    placeAt('bet-spread')
    render(<StartHere onTour={() => {}} />)
    expect(screen.getByTestId('start-here-reason')).toHaveTextContent(/already behind you/i)
  })
})

describe('getting rid of it', () => {
  it('puts itself away when the suggestion is taken', () => {
    placeAt('hi-lo')
    render(<StartHere onTour={() => {}} />)

    fireEvent.click(screen.getByTestId('start-here-go'))
    expect(screen.queryByTestId('start-here')).toBeNull()
    // Persisted, so it does not reappear on the next visit. A suggestion you
    // have followed should not still be sitting there suggesting it.
    expect(isRecommendationDone()).toBe(true)
  })

  it('can be dismissed outright', () => {
    placeAt('hi-lo')
    render(<StartHere onTour={() => {}} />)

    fireEvent.click(screen.getByTestId('start-here-dismiss'))
    expect(screen.queryByTestId('start-here')).toBeNull()
    expect(isRecommendationDone()).toBe(true)
    // Dismissing is not the same as acting: no mode change.
    expect(useAppStore.getState().currentMode).toBe('home')
  })

  it('hands off to the tour and steps out of the way', () => {
    placeAt('rules')
    const onTour = vi.fn()
    render(<StartHere onTour={onTour} />)

    fireEvent.click(screen.getByTestId('start-here-tour'))
    expect(onTour).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('start-here')).toBeNull()
    expect(isRecommendationDone()).toBe(true)
  })

  it('offers the tour to everyone, not only to beginners', () => {
    // Wanting the lay of the land is a preference, not a skill level.
    for (const stage of ['rules', 'hi-lo', 'table']) {
      localStorage.clear()
      placeAt(stage)
      const { unmount } = render(<StartHere onTour={() => {}} />)
      expect(screen.getByTestId('start-here-tour'), stage).toBeInTheDocument()
      unmount()
    }
  })
})
