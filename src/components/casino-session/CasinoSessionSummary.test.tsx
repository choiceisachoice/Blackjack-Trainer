import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CasinoSessionSummary } from './CasinoSessionSummary'
import { DEFAULT_CONFIG } from './helpers'
import type { CasinoSessionResult } from '../../engine/casino-session/types'

/**
 * The last screen of a Casino Session.
 *
 * It carried a third button — "export debug log" — that downloaded a
 * `casino-debug-*.json` of every recorded event. That was a development tool
 * that outlived its purpose and ended up in front of paying customers, offering
 * them a file they could not use and giving it the same weight as "play again".
 *
 * Removing it broke **no test**, which is exactly why this file exists: an
 * untested control is one that can come back unnoticed. These tests pin what
 * this screen offers a player and what it does not.
 */

const RESULT: CasinoSessionResult = {
  config: DEFAULT_CONFIG,
  hands: [],
  startTime: 0,
  endTime: 900_000,
  durationSeconds: 900,
  startingBankroll: 5000,
  finalBankroll: 5400,
  netProfit: 400,
  peakBankroll: 5600,
  worstDrawdown: 200,
  betAccuracy: 88,
  playAccuracy: 92,
  countAccuracy: 79,
  deviationAccuracy: 66,
  insuranceAccuracy: 100,
  overallScore: 84.2,
  totalCountChecks: 12,
  correctRCChecks: 10,
  correctTCChecks: 9,
  avgRCError: 0.4,
  avgTCError: 0.3,
  totalPlayDecisions: 40,
  correctPlayDecisions: 37,
  totalDeviationSituations: 3,
  correctDeviations: 2,
  missedDeviations: [],
  totalBetDecisions: 20,
  correctBetDecisions: 18,
  avgOverbetAmount: 12,
  avgUnderbetAmount: 8,
  totalInsuranceOffers: 1,
  correctInsuranceDecisions: 1,
  grade: 'B+',
  gradeColor: '#d4a847',
}

const renderSummary = () =>
  render(
    <CasinoSessionSummary
      result={RESULT}
      onPlayAgain={vi.fn()}
      onHome={vi.fn()}
      recorder={null}
    />,
  )

describe('CasinoSessionSummary', () => {
  it('offers exactly two ways on: play again, or home', () => {
    renderSummary()
    expect(screen.getByTestId('play-again')).toBeInTheDocument()
    expect(screen.getByTestId('go-home')).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('never offers a debug download', () => {
    renderSummary()
    expect(screen.queryByTestId('export-debug-log')).toBeNull()
    expect(screen.queryByText(/debug/i)).toBeNull()
  })

  it('reports the session the player actually played', () => {
    renderSummary()
    expect(screen.getByText('B+')).toBeInTheDocument()
    // 84.2, not /400/ — the net profit is 400 and the final bankroll 5400, so a
    // loose match found both and the assertion said nothing about either.
    expect(screen.getByText(/84\.2/)).toBeInTheDocument()
  })

  it('survives a session with no recorder attached', () => {
    // `recorder` is nullable and the anomaly count reads through it. A missing
    // recorder must render a summary, not a blank screen.
    expect(() => renderSummary()).not.toThrow()
    expect(screen.queryByTestId('anomaly-warning')).toBeNull()
  })
})
