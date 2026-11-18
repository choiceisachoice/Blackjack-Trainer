import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AnalyticsReport } from '../services/analytics/report'
import type { ClientFailure, ClientFailuresResult } from '../services/analytics/failures'

const fetchAnalyticsReport = vi.fn<(b: { from: Date; to: Date }) => Promise<AnalyticsReport>>()
vi.mock('../services/analytics/report', async (importOriginal) => {
  const real = await importOriginal<typeof import('../services/analytics/report')>()
  return { ...real, fetchAnalyticsReport: (b: { from: Date; to: Date }) => fetchAnalyticsReport(b) }
})

const fetchClientFailures = vi.fn<(limit?: number) => Promise<ClientFailuresResult>>()
vi.mock('../services/analytics/failures', async (importOriginal) => {
  const real = await importOriginal<typeof import('../services/analytics/failures')>()
  return { ...real, fetchClientFailures: (limit?: number) => fetchClientFailures(limit) }
})

import { AdminAnalyticsPage } from './AdminAnalyticsPage'

const FAILURES: ClientFailure[] = [
  {
    id: 12,
    occurred_at: '2026-11-18T09:30:00+00:00',
    place: 'checkout',
    message: 'FunctionsHttpError: Edge Function returned a non-2xx status code',
    path: '/de/app',
    signed_in: true,
    app_build: 'index-B4x9Kq.js',
  },
  {
    id: 11,
    occurred_at: '2026-11-17T22:05:00+00:00',
    place: 'checkout-landing',
    message: 'TypeError: Failed to fetch',
    path: null,
    signed_in: false,
    app_build: null,
  },
]

const REPORT: AnalyticsReport = {
  visitors: 47,
  page_views: 126,
  sessions: 52,
  avg_session_seconds: 138,
  registrations: 8,
  paying_customers: 3,
  daily: [
    { day: '2026-09-22', visitors: 20, sessions: 22, page_views: 60, registrations: 3 },
    { day: '2026-09-23', visitors: 27, sessions: 30, page_views: 66, registrations: 5 },
  ],
  top_pages: [
    { pathname: '/', views: 70, visitors: 40 },
    { pathname: '/learn', views: 56, visitors: 30 },
  ],
  referrers: [
    { host: 'google.com', sessions: 30 },
    { host: null, sessions: 22 },
  ],
  devices: [
    { device: 'desktop', sessions: 40 },
    { device: 'mobile', sessions: 12 },
  ],
}

const EMPTY: AnalyticsReport = {
  visitors: 0, page_views: 0, sessions: 0, avg_session_seconds: null, registrations: 0, paying_customers: 0,
  daily: [], top_pages: [], referrers: [], devices: [],
}

const renderPage = () => render(<MemoryRouter><AdminAnalyticsPage /></MemoryRouter>)

beforeEach(() => {
  cleanup()
  fetchAnalyticsReport.mockReset()
  fetchClientFailures.mockReset()
  fetchClientFailures.mockResolvedValue({ kind: 'ok', rows: [] })
})

describe('AdminAnalyticsPage', () => {
  it('shows the five numbers from the report, not from anywhere else', async () => {
    fetchAnalyticsReport.mockResolvedValue(REPORT)
    renderPage()
    expect(await screen.findByTestId('kpi-visitors')).toHaveTextContent('47')
    expect(screen.getByTestId('kpi-page-views')).toHaveTextContent('126')
    expect(screen.getByTestId('kpi-avg-session')).toHaveTextContent('2m 18s')
    expect(screen.getByTestId('kpi-registrations')).toHaveTextContent('8')
    expect(screen.getByTestId('kpi-paying')).toHaveTextContent('3')
  })

  it('shows zeros and a dash when there is no data yet — never demo numbers', async () => {
    fetchAnalyticsReport.mockResolvedValue(EMPTY)
    renderPage()
    expect(await screen.findByTestId('kpi-visitors')).toHaveTextContent(/^Visitors0$/)
    expect(screen.getByTestId('kpi-avg-session')).toHaveTextContent('—')
    expect(screen.getByTestId('analytics-top-pages-empty')).toBeInTheDocument()
  })

  it('lists top pages, referrers (direct named) and devices', async () => {
    fetchAnalyticsReport.mockResolvedValue(REPORT)
    renderPage()
    const pages = await screen.findByTestId('analytics-top-pages')
    expect(pages).toHaveTextContent('/learn')
    expect(pages).toHaveTextContent('56')
    expect(screen.getByTestId('analytics-referrers')).toHaveTextContent('google.com')
    expect(screen.getByTestId('analytics-referrers')).toHaveTextContent('Direct / none')
    expect(screen.getByTestId('analytics-devices')).toHaveTextContent('Desktop')
    expect(screen.getByTestId('analytics-devices')).toHaveTextContent('Phone')
  })

  it('opens on the last 7 days and re-fetches when the range changes', async () => {
    fetchAnalyticsReport.mockResolvedValue(REPORT)
    renderPage()
    await screen.findByTestId('kpi-visitors')
    expect(fetchAnalyticsReport).toHaveBeenCalledTimes(1)
    const first = fetchAnalyticsReport.mock.calls[0][0]
    expect((first.to.getTime() - first.from.getTime()) / 86_400_000).toBeCloseTo(7, 0)

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(fetchAnalyticsReport).toHaveBeenCalledTimes(2))
    const second = fetchAnalyticsReport.mock.calls[1][0]
    expect((second.to.getTime() - second.from.getTime()) / 86_400_000).toBeCloseTo(1, 0)

    fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }))
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }))
    await waitFor(() => expect(fetchAnalyticsReport).toHaveBeenCalledTimes(4))
  })

  it('applies a custom range and refuses an inverted one', async () => {
    fetchAnalyticsReport.mockResolvedValue(REPORT)
    renderPage()
    await screen.findByTestId('kpi-visitors')
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    fireEvent.change(screen.getByTestId('analytics-from'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByTestId('analytics-to'), { target: { value: '2026-09-03' } })
    fireEvent.click(screen.getByTestId('analytics-apply'))
    await waitFor(() => {
      const last = fetchAnalyticsReport.mock.calls.at(-1)![0]
      expect(last.from).toEqual(new Date(2026, 8, 1))
      expect(last.to).toEqual(new Date(2026, 8, 4))
    })

    fireEvent.change(screen.getByTestId('analytics-to'), { target: { value: '2026-08-01' } })
    fireEvent.click(screen.getByTestId('analytics-apply'))
    expect(await screen.findByTestId('analytics-invalid-range')).toBeInTheDocument()
  })

  it('switches the chart metric', async () => {
    fetchAnalyticsReport.mockResolvedValue(REPORT)
    renderPage()
    expect(await screen.findByTestId('daily-visitors')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Registrations' }))
    expect(screen.getByTestId('daily-registrations')).toBeInTheDocument()
  })

  it('says so, in a sentence, when the report is refused', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchAnalyticsReport.mockRejectedValue(new Error('forbidden'))
    renderPage()
    expect(await screen.findByText('The report could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByTestId('kpi-visitors')).not.toBeInTheDocument()
    err.mockRestore()
  })

  it('reloads on demand', async () => {
    fetchAnalyticsReport.mockResolvedValue(REPORT)
    renderPage()
    await screen.findByTestId('kpi-visitors')
    fireEvent.click(screen.getByTestId('analytics-reload'))
    await waitFor(() => expect(fetchAnalyticsReport).toHaveBeenCalledTimes(2))
  })

  it('states the definitions next to the numbers', async () => {
    fetchAnalyticsReport.mockResolvedValue(REPORT)
    renderPage()
    expect(await screen.findByTestId('analytics-definitions')).toHaveTextContent(/30 minutes/)
  })
})

describe('AdminAnalyticsPage — failures', () => {
  beforeEach(() => {
    fetchAnalyticsReport.mockResolvedValue(REPORT)
  })

  it('asks for the latest 50', async () => {
    renderPage()
    await screen.findByTestId('failures-empty')
    expect(fetchClientFailures).toHaveBeenCalledTimes(1)
    expect(fetchClientFailures).toHaveBeenCalledWith(50)
  })

  it('lists each failure: time in the browser’s zone, place, message, page, signed in', async () => {
    fetchClientFailures.mockResolvedValue({ kind: 'ok', rows: FAILURES })
    renderPage()
    const rows = await screen.findAllByTestId('failure-row')
    expect(rows).toHaveLength(2)

    // Whatever zone the test machine is in, it is the browser's rendering of
    // the server's instant — and the instant itself stays machine-readable.
    expect(rows[0]).toHaveTextContent(new Date(FAILURES[0].occurred_at).toLocaleString('en'))
    expect(rows[0].querySelector('time')).toHaveAttribute('datetime', FAILURES[0].occurred_at)
    expect(rows[0]).toHaveTextContent('checkout')
    expect(rows[0]).toHaveTextContent('FunctionsHttpError: Edge Function returned a non-2xx status code')
    expect(rows[0]).toHaveTextContent('/de/app')
    expect(rows[0].lastElementChild).toHaveTextContent(/^Yes$/)

    expect(rows[1]).toHaveTextContent('checkout-landing')
    expect(rows[1]).toHaveTextContent('TypeError: Failed to fetch')
    expect(rows[1].lastElementChild).toHaveTextContent(/^No$/)
    // No page recorded is a dash, not an empty cell that looks like a bug.
    expect(rows[1].children[3]).toHaveTextContent(/^—$/)

    expect(screen.queryByTestId('failures-empty')).not.toBeInTheDocument()
  })

  it('keeps the order the database gave: newest first', async () => {
    fetchClientFailures.mockResolvedValue({ kind: 'ok', rows: FAILURES })
    renderPage()
    const rows = await screen.findAllByTestId('failure-row')
    expect(rows.map(r => r.children[1].textContent)).toEqual(['checkout', 'checkout-landing'])
  })

  it('heads the columns', async () => {
    fetchClientFailures.mockResolvedValue({ kind: 'ok', rows: FAILURES })
    renderPage()
    await screen.findByTestId('failures-table')
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Time', 'Place', 'Message', 'Page', 'Signed in'])
  })

  it('says so when there are none', async () => {
    renderPage()
    expect(await screen.findByTestId('failures-empty')).toHaveTextContent('No failures recorded.')
    expect(screen.queryByTestId('failures-table')).not.toBeInTheDocument()
  })

  it('is honest about what the list cannot show', async () => {
    renderPage()
    const note = await screen.findByTestId('failures-note')
    // Offline failures arrive late or never; nobody is notified.
    expect(note).toHaveTextContent(/offline only arrives on that visitor’s next visit — if there is one/)
    expect(note).toHaveTextContent(/Nothing notifies you/)
    expect(note).toHaveTextContent(/90 days/)
  })

  it('names the migration to push, instead of an error, when the function is missing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchClientFailures.mockResolvedValue({ kind: 'missing-migration' })
    renderPage()
    expect(await screen.findByTestId('failures-missing-migration')).toHaveTextContent('20261118120000_client_failures.sql')
    expect(screen.queryByTestId('failures-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('failures-empty')).not.toBeInTheDocument()
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('says in a sentence when the list could not be loaded, and never shows what was thrown', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchClientFailures.mockRejectedValue(new Error('permission denied for function client_failures_recent'))
    renderPage()
    expect(await screen.findByTestId('failures-error')).toHaveTextContent('The failures could not be loaded.')
    expect(screen.queryByText(/permission denied/)).not.toBeInTheDocument()
    err.mockRestore()
  })

  it('still shows the failures when the report itself is refused', async () => {
    // A failed checkout must not be hidden behind an unrelated broken chart.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchAnalyticsReport.mockRejectedValue(new Error('boom'))
    fetchClientFailures.mockResolvedValue({ kind: 'ok', rows: FAILURES })
    renderPage()
    expect(await screen.findByText('The report could not be loaded.')).toBeInTheDocument()
    expect(await screen.findAllByTestId('failure-row')).toHaveLength(2)
    err.mockRestore()
  })

  it('reloads together with the report', async () => {
    renderPage()
    await screen.findByTestId('failures-empty')
    fetchClientFailures.mockResolvedValue({ kind: 'ok', rows: FAILURES })
    fireEvent.click(screen.getByTestId('analytics-reload'))
    expect(await screen.findAllByTestId('failure-row')).toHaveLength(2)
    expect(fetchClientFailures).toHaveBeenCalledTimes(2)
  })
})
