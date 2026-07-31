import { describe, it, expect } from 'vitest'
import {
  BRIEF,
  BRIEF_MIN_VISIBLE_MS,
  CHECK_MS,
  COMPLETE_HOLD_MS,
  COMPLETE_MS,
  EXIT_MS,
  EYEBROW,
  EYEBROW_AT,
  FILL_FROM,
  FILL_MS,
  HOLD_AT,
  MAX_HOLD_MS,
  MIN_VISIBLE_MS,
  READOUT_AT,
  REDUCED_VISIBLE_MS,
  RISE_MS,
  STATUS,
  STATUS_DONE,
  TRACK_AT,
  WORDMARK_AT,
  WORDMARK_LIGHT,
  WORDMARK_STRONG,
  completeCurve,
  percentAt,
  progressAt,
} from './intro-sequence'

describe('the bar while the app is still loading', () => {
  it('starts empty and never runs backwards', () => {
    expect(progressAt(0, null)).toBe(0)
    let previous = -1
    for (let t = 0; t <= FILL_MS + 4000; t += 7) {
      const p = progressAt(t, null)
      expect(p).toBeGreaterThanOrEqual(previous)
      previous = p
    }
  })

  it('keeps one tempo the whole way', () => {
    // A loading bar measures something; it should not perform. Equal slices of
    // time must cover equal slices of the track — this is the linear fill being
    // a property of the design rather than a detail of the current easing.
    const step = FILL_MS / 5
    const gaps: number[] = []
    for (let i = 0; i < 5; i++) {
      gaps.push(
        progressAt(FILL_FROM + step * (i + 1), null) - progressAt(FILL_FROM + step * i, null),
      )
    }
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6)
  })

  it('stops at 89% and stays there', () => {
    // A bar sitting at 100% while someone is still waiting is a lie they can
    // see. This is the pause being a designed state rather than a stall.
    expect(progressAt(FILL_FROM + FILL_MS, null)).toBeCloseTo(HOLD_AT, 6)
    expect(progressAt(FILL_FROM + FILL_MS * 4, null)).toBeCloseTo(HOLD_AT, 6)
    expect(HOLD_AT).toBeLessThan(1)
  })

  it('reads 89 on the readout, not 90', () => {
    // Floor, never round: a readout that says 90 while the bar is at 89.4 is
    // a number that disagrees with the thing beside it.
    expect(percentAt(progressAt(FILL_FROM + FILL_MS, null))).toBe(89)
    expect(percentAt(0)).toBe(0)
    expect(percentAt(1)).toBe(100)
    expect(percentAt(0.899)).toBe(89)
  })

  it('is empty until the track has unfolded', () => {
    // Nothing fills before there is something visible to fill. The empty track
    // has to be seen first, or the bar reads as appearing already in progress.
    expect(progressAt(TRACK_AT, null)).toBe(0)
    expect(progressAt(FILL_FROM, null)).toBe(0)
    expect(progressAt(FILL_FROM + 1, null)).toBeGreaterThan(0)
  })
})

describe('the bar once the app is ready', () => {
  it('completes to full', () => {
    const readyAt = 900
    expect(progressAt(FILL_FROM + FILL_MS + COMPLETE_MS, readyAt)).toBeCloseTo(1, 6)
  })

  it('never skips the fill, however early the app resolves', () => {
    // Ready at mount is the common case on a fast connection. Without this the
    // bar snaps from nothing to full, which is not a loading screen, it is a
    // flash — and the reason the floor and the fill are the same number.
    expect(progressAt(0, 0)).toBe(0)
    expect(progressAt(FILL_FROM + FILL_MS / 2, 0)).toBeLessThan(HOLD_AT)
    expect(progressAt(FILL_FROM + FILL_MS, 0)).toBeCloseTo(HOLD_AT, 2)
    expect(progressAt(FILL_FROM + FILL_MS + COMPLETE_MS, 0)).toBeCloseTo(1, 6)
  })

  it('completes from wherever it had got to', () => {
    for (const readyAt of [0, 400, 1200, FILL_FROM + FILL_MS, 6000]) {
      const done = Math.max(readyAt, FILL_FROM + FILL_MS) + COMPLETE_MS
      expect(progressAt(done, readyAt)).toBeCloseTo(1, 6)
      // and it is still monotonic across the join
      let previous = -1
      for (let t = 0; t <= done + 200; t += 11) {
        const p = progressAt(t, readyAt)
        expect(p).toBeGreaterThanOrEqual(previous - 1e-9)
        previous = p
      }
    }
  })
})

describe('the budget', () => {
  it('is short enough to sit through and long enough to be deliberate', () => {
    // The ceiling is deliberately past the usual "keep it under four seconds":
    // the finished bar is held on screen on purpose, because reaching 100% and
    // leaving in the same breath means nobody ever sees it arrive.
    const typical = MIN_VISIBLE_MS + COMPLETE_MS + COMPLETE_HOLD_MS + EXIT_MS
    expect(typical).toBeGreaterThanOrEqual(2000)
    // Raised from 5s deliberately. The bar crossing its track is the only part
    // of this screen that reports anything real, and at the old pace it went by
    // faster than the eye follows. The ceiling is what stops that argument from
    // being used again and again — past six seconds this stops being a loading
    // screen on every visit and becomes a toll.
    expect(typical).toBeLessThanOrEqual(6000)
  })

  it('lets the completed bar stand before anything moves away', () => {
    expect(COMPLETE_HOLD_MS).toBeGreaterThanOrEqual(500)
    // But it is a beat, not a second wait: it may not outlast the fill itself.
    expect(COMPLETE_HOLD_MS).toBeLessThan(FILL_MS)
  })

  it('keeps every transition inside the half-second a transition may take', () => {
    // Past roughly half a second the eye has finished reading a change and is
    // simply waiting for the software. The first version ran a 700ms exit into a
    // 900ms hero resolve behind a 120ms delay — over two seconds of tail after
    // the bar had already said it was finished, which reads as a hang.
    expect(EXIT_MS).toBeLessThanOrEqual(500)
    expect(CHECK_MS).toBeLessThanOrEqual(400)
    expect(COMPLETE_MS).toBeLessThanOrEqual(600)
  })

  it('draws the check faster than the beat it lands in', () => {
    // The tick has to be finished and readable while the completed state is
    // still on screen, not still drawing as the screen leaves.
    expect(CHECK_MS).toBeLessThan(COMPLETE_HOLD_MS)
  })

  it('never leaves before the bar has finished travelling', () => {
    expect(MIN_VISIBLE_MS).toBe(FILL_FROM + FILL_MS)
  })

  it('gives a reduced-motion visitor a much shorter hold', () => {
    expect(REDUCED_VISIBLE_MS).toBeLessThan(MIN_VISIBLE_MS / 2)
  })

  it('gives up on an app that never arrives', () => {
    // Comfortably past the floor, so the valve only ever fires for an app that
    // is genuinely stuck — not for one that is merely slow. Deliberately not
    // scaled off the floor by a fixed multiple: the ceiling is about how long a
    // person will sit in front of a screen with no controls, which does not
    // change because the fill got slower.
    expect(MAX_HOLD_MS).toBeGreaterThan(MIN_VISIBLE_MS + 4000)
    expect(MAX_HOLD_MS).toBeLessThanOrEqual(10_000)
  })
})

describe('the entrance beats', () => {
  it('run in order, each after the one it follows from', () => {
    // The bar is drawn after the name has landed, and the readout after the bar
    // exists to report on. One thing causes the next rather than everything
    // arriving at once.
    expect(EYEBROW_AT).toBeLessThan(WORDMARK_AT)
    expect(WORDMARK_AT).toBeLessThan(TRACK_AT)
    expect(TRACK_AT).toBeLessThan(READOUT_AT)
    expect(READOUT_AT).toBeLessThan(FILL_FROM)
  })
})

describe('the curves', () => {
  it('is anchored at both ends', () => {
    expect(completeCurve(0)).toBe(0)
    expect(completeCurve(1)).toBe(1)
  })

  it('does not crawl through the last few percent', () => {
    // The property that matters, stated directly. A cubic ease-out satisfies
    // "decelerates" and fails this: it spends most of its time in the final
    // stretch, so the readout sat on 95 for 400ms while appearing to hang at
    // exactly the moment it was meant to be finishing.
    expect(completeCurve(0.8)).toBeGreaterThanOrEqual(0.75)
    expect(completeCurve(0.5)).toBeCloseTo(0.5, 2)
  })

  it('clamp outside 0..1 rather than overshooting', () => {
    for (const ease of [completeCurve]) {
      expect(ease(-2)).toBe(0)
      expect(ease(4)).toBe(1)
    }
  })

  it('finishes quickly once there is nothing left to wait for', () => {
    expect(COMPLETE_MS).toBeLessThan(FILL_MS / 3)
  })
})

describe('the abbreviated timeline', () => {
  const BRIEF_FILL = { FILL_FROM: BRIEF.FILL_FROM, FILL_MS: BRIEF.FILL_MS, COMPLETE_MS: BRIEF.COMPLETE_MS }

  it('is a shorter screen, not a faster one', () => {
    // The distinction the whole thing rests on. Playing a five-second
    // composition at three times speed reads as a glitch; this is the same
    // screen with the introduction left out, so its fill must still be slow
    // enough to watch — better than half the ceremony's pace.
    const briefTotal = BRIEF_MIN_VISIBLE_MS + BRIEF.COMPLETE_MS + BRIEF.COMPLETE_HOLD_MS + BRIEF.EXIT_MS
    const fullTotal = MIN_VISIBLE_MS + COMPLETE_MS + COMPLETE_HOLD_MS + EXIT_MS
    expect(briefTotal).toBeLessThan(fullTotal / 2)
    expect(BRIEF.FILL_MS / FILL_MS).toBeGreaterThan(0.25)
  })

  it('keeps every promise the long one makes', () => {
    // The abbreviation is allowed to remove the welcome. It is not allowed to
    // start dishonest: still empty until the track exists, still one tempo,
    // still short of full while someone is waiting, still completing to exactly
    // full from wherever it had got to.
    expect(progressAt(BRIEF.TRACK_AT, null, BRIEF_FILL)).toBe(0)
    expect(progressAt(BRIEF.FILL_FROM, null, BRIEF_FILL)).toBe(0)

    const step = BRIEF.FILL_MS / 4
    const gaps: number[] = []
    for (let i = 0; i < 4; i++) {
      gaps.push(
        progressAt(BRIEF.FILL_FROM + step * (i + 1), null, BRIEF_FILL)
          - progressAt(BRIEF.FILL_FROM + step * i, null, BRIEF_FILL),
      )
    }
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6)

    expect(progressAt(BRIEF_MIN_VISIBLE_MS, null, BRIEF_FILL)).toBeCloseTo(HOLD_AT, 6)
    expect(progressAt(BRIEF_MIN_VISIBLE_MS * 3, null, BRIEF_FILL)).toBeCloseTo(HOLD_AT, 6)
    expect(progressAt(BRIEF_MIN_VISIBLE_MS + BRIEF.COMPLETE_MS, 0, BRIEF_FILL)).toBeCloseTo(1, 6)
  })

  it('never skips its fill either, however early the app resolves', () => {
    expect(progressAt(0, 0, BRIEF_FILL)).toBe(0)
    expect(progressAt(BRIEF.FILL_FROM + BRIEF.FILL_MS / 2, 0, BRIEF_FILL)).toBeLessThan(HOLD_AT)
  })

  it('runs its beats in order, and gets the card onto a track that exists', () => {
    expect(BRIEF.TRACK_AT).toBeLessThan(BRIEF.READOUT_AT)
    expect(BRIEF.READOUT_AT).toBeLessThan(BRIEF.FILL_FROM)
    // The rider may not appear before the slot it rides in.
    expect(BRIEF.CARD_AT).toBeGreaterThan(BRIEF.TRACK_AT)
    // And it has to be there for most of the travel, not arrive near the end.
    expect(BRIEF.CARD_AT).toBeLessThan(BRIEF.FILL_FROM + BRIEF.FILL_MS / 3)
  })

  it('finishes rising before the bar it annotates is full', () => {
    // The ceremony's 900ms rise inside a 920ms bar would land after it, which is
    // the reason this is a per-timeline number rather than a constant.
    expect(BRIEF.READOUT_AT + BRIEF.RISE_MS).toBeLessThan(BRIEF_MIN_VISIBLE_MS)
    expect(BRIEF.RISE_MS).toBeLessThan(RISE_MS)
  })

  it('holds full long enough to be seen at all', () => {
    expect(BRIEF.COMPLETE_HOLD_MS).toBeGreaterThan(0)
  })
})

describe('the words', () => {
  it('read as one sentence across two levels, and say nothing twice', () => {
    expect(`${WORDMARK_STRONG}${WORDMARK_LIGHT}`).toBe('BlackjackTrainer.com')
    expect(`${EYEBROW} ${WORDMARK_STRONG}${WORDMARK_LIGHT}`)
      .toBe('Welcome to BlackjackTrainer.com')
    expect(EYEBROW.length).toBeLessThan(14)
    // The status says what is happening in the product's own language — a table
    // being prepared, not assets being fetched.
    expect(STATUS).toMatch(/table/i)
    expect(STATUS.length).toBeLessThan(30)
    // The completed state says so in one word, next to a tick. Anything longer
    // is a sentence nobody reads in the moment before the screen leaves.
    expect(STATUS_DONE).toBe('Complete')
  })
})
