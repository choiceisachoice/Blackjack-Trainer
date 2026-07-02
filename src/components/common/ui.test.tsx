import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Zap } from 'lucide-react'
import { Button, Segmented, Toggle, StatCard, Panel } from './ui'

describe('common/ui primitives', () => {
  it('Button renders children and fires onClick', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    fireEvent.click(screen.getByText('Go'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('Segmented marks the active option with aria-pressed and reports changes', () => {
    const onChange = vi.fn()
    render(
      <Segmented
        ariaLabel="Size"
        value={2}
        onChange={onChange}
        options={[{ label: 'One', value: 1 }, { label: 'Two', value: 2 }]}
      />,
    )
    const group = screen.getByRole('group', { name: 'Size' })
    expect(group.querySelector('[aria-pressed="true"]')?.textContent).toBe('Two')
    fireEvent.click(screen.getByText('One'))
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('Toggle exposes a switch role and toggles its value', () => {
    const onChange = vi.fn()
    render(<Toggle label="Sound" checked={false} onChange={onChange} />)
    const sw = screen.getByRole('switch', { name: 'Sound' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('StatCard shows its label and value', () => {
    render(<StatCard label="Streak" value={7} />)
    expect(screen.getByText('Streak')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
  })

  it('Panel renders a title and its children', () => {
    render(<Panel icon={Zap} title="Settings"><p>body</p></Panel>)
    expect(screen.getByText('Settings')).toBeTruthy()
    expect(screen.getByText('body')).toBeTruthy()
  })
})
