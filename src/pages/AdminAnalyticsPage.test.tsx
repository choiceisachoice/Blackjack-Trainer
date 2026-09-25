import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AnalyticsReport } from '../services/analytics/report'

const fetchAnalyticsReport = vi.fn<(b: { from: Date; to: Date }) => Promise<AnalyticsReport>>()
vi.mock('../services/analytics/report', async (importOriginal) => {
  const real = await importOriginal<typeof import('../services/analytics/report')>()
  return { ...real, fetchAnalyticsReport: (b: { from: Date; to: Date }) => fetchAnalyticsReport(b) }
})

import { AdminAnalyticsPage } from './AdminAnalyticsPage'

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
