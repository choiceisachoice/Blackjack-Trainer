import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { SplitPreview } from './SplitPreview'

/**
 * The dev harness for a bot's re-split. Checked end to end on the real seat:
 * two hands after the split, still two once the 8♦ is dealt, three only after
 * the re-split.
 */
afterEach(() => { cleanup(); vi.useRealTimers() })

const handLabels = () => screen.queryAllByText(/^H\d$/)

describe('SplitPreview', () => {
  it('grows the table to three hands only on the re-split', () => {
    vi.useFakeTimers()
    render(<SplitPreview />)
    fireEvent.click(screen.getByTestId('split-preview-play'))
    const counts: number[] = []
    for (let t = 0; t < 40_000; t += 100) {
      act(() => { vi.advanceTimersByTime(100) })
      const n = handLabels().length
      if (counts.at(-1) !== n) counts.push(n)
    }
    expect(counts).toEqual([0, 2, 3])
  })
})
