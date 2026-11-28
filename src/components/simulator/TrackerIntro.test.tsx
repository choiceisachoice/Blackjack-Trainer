import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { LineChart, Wallet } from 'lucide-react'
import { TrackerIntro } from './TrackerIntro'

vi.mock('recharts', () => ({
  AreaChart: ({ children }: React.PropsWithChildren) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div />,
  YAxis: () => <div />,
  ResponsiveContainer: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}))

function renderIntro() {
  return render(
    <TrackerIntro
      testId="some-log"
      icon={Wallet}
      kicker="Real casino log"
      title="A headline"
      body="How it fills."
      points={[{ icon: LineChart, text: 'A curve' }]}
      sample={{
        stats: [{ label: 'Sessions', value: '10' }],
        curve: [100, 150, 120],
        rows: [{ primary: 'Row one', secondary: '3h', amount: 50 }, { primary: 'Row two', secondary: '2h', amount: -20, tag: 'B' }],
      }}
    >
      <button>The one action</button>
    </TrackerIntro>,
  )
}

describe('TrackerIntro', () => {
  it('says what the page is for and offers its one action', () => {
    renderIntro()
    expect(screen.getByTestId('some-log')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'A headline' })).toBeInTheDocument()
    expect(screen.getByText('Real casino log')).toBeInTheDocument()
    expect(screen.getByText('A curve')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'The one action' })).toBeInTheDocument()
  })

  it('labels the example as an example and shows its rows signed', () => {
    renderIntro()
    const example = screen.getByTestId('tracker-intro-example')
    expect(within(example).getByText('Example')).toBeInTheDocument()
    expect(within(example).getByText('+$50')).toBeInTheDocument()
    expect(within(example).getByText('-$20')).toBeInTheDocument()
    expect(within(example).getByText('B')).toBeInTheDocument()
    expect(within(example).getByTestId('area-chart')).toBeInTheDocument()
  })
})
