import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TopicChapter } from './TopicChapter'
import { TopicChapter as FromLearnPage } from './LearnPage'
import { BODY_TAGS, MODE_GUIDE } from './learn-content'
import en from '../../i18n/messages/en.json'

describe('TopicChapter', () => {
  it('renders the four chapter paragraphs with their emphasis', () => {
    const { container } = render(<TopicChapter id="hi-lo" />)
    expect(container.querySelectorAll('p')).toHaveLength(4)
    expect(screen.getByText(/A worked round/)).toBeInTheDocument()
    expect(container.querySelector('.text-gold')).not.toBeNull()
  })

  it('adds the deviation tables to the Illustrious 18 chapter only', () => {
    const { container: i18 } = render(<TopicChapter id="i18-fab4" />)
    expect(i18.querySelectorAll('table').length).toBeGreaterThan(0)
    const { container: hiLo } = render(<TopicChapter id="hi-lo" />)
    expect(hiLo.querySelectorAll('table')).toHaveLength(0)
  })

  it('is still exported from LearnPage, where the public chapter pages import it', () => {
    expect(FromLearnPage).toBe(TopicChapter)
  })
})

describe('learn content', () => {
  it('has the two emphasis tags', () => {
    expect(Object.keys(BODY_TAGS).sort()).toEqual(['c', 'g'])
  })

  it('names only modes and texts that exist in the messages', () => {
    const get = (key: string): unknown => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en)
    for (const m of MODE_GUIDE) {
      expect(typeof get(m.nameKey)).toBe('string')
      expect(typeof get(m.textKey)).toBe('string')
    }
  })
})
