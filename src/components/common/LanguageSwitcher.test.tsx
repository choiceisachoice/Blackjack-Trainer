import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import i18next from 'i18next'
import { LanguageSwitcher } from './LanguageSwitcher'
import { LOCALES } from '../../i18n/locales'

/**
 * This control used to be a native `<select>`, which handed us keyboard
 * support, listbox semantics and a phone's own picker for nothing. Replacing
 * it with a custom panel means every one of those has to be re-earned by hand
 * — and a hand-built menu breaks quietly: it still looks right while being
 * unusable without a mouse.
 *
 * So these tests are the accessibility contract, not decoration. If the design
 * changes again, they are what says whether it is still usable.
 */
const setLocale = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../../i18n', () => ({ setLocale }))

beforeEach(() => setLocale.mockClear())
afterEach(async () => {
  cleanup()
  await i18next.changeLanguage('en')
})

const open = () => fireEvent.click(screen.getByTestId('language-switcher'))

describe('LanguageSwitcher', () => {
  it('announces itself as a collapsed listbox before it is opened', () => {
    render(<LanguageSwitcher />)
    const trigger = screen.getByTestId('language-switcher')
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('names the current language, so the button is not a mystery glyph', () => {
    render(<LanguageSwitcher />)
    // The trigger shows a card corner — "EN" over a pip. Without a label a
    // screen reader would read two characters and no purpose.
    expect(screen.getByTestId('language-switcher')).toHaveAccessibleName(/English/)
  })

  it('offers every language, each named in its own tongue', () => {
    render(<LanguageSwitcher />)
    open()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(LOCALES.length)
    expect(screen.getByTestId('language-option-de')).toHaveTextContent('Deutsch')
    expect(screen.getByTestId('language-option-tr')).toHaveTextContent('Türkçe')
  })

  it('marks the current language as the selected option', () => {
    render(<LanguageSwitcher />)
    open()
    expect(screen.getByTestId('language-option-en')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('language-option-de')).toHaveAttribute('aria-selected', 'false')
  })

  it('switches when an option is clicked', () => {
    render(<LanguageSwitcher />)
    open()
    fireEvent.click(screen.getByTestId('language-option-fr'))
    expect(setLocale).toHaveBeenCalledWith('fr')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens and walks the list with the arrow keys alone', () => {
    render(<LanguageSwitcher />)
    const trigger = screen.getByTestId('language-switcher')
    trigger.focus()

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const list = screen.getByRole('listbox')
    // `aria-activedescendant` is how a screen reader follows a roving cursor
    // in a listbox — the DOM focus stays on the trigger.
    expect(list).toHaveAttribute('aria-activedescendant', expect.stringContaining('-en'))

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(list).toHaveAttribute('aria-activedescendant', expect.stringContaining('-de'))
  })

  it('does not change the language while merely arrowing past a option', () => {
    // The bug this prevents: a keyboard user who scrolls the list would
    // otherwise reload the page's messages on every keypress.
    render(<LanguageSwitcher />)
    const trigger = screen.getByTestId('language-switcher')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(setLocale).not.toHaveBeenCalled()
  })

  it('commits the highlighted language on Enter', () => {
    render(<LanguageSwitcher />)
    const trigger = screen.getByTestId('language-switcher')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(setLocale).toHaveBeenCalledWith('de')
  })

  it('jumps to the ends with Home and End', () => {
    render(<LanguageSwitcher />)
    const trigger = screen.getByTestId('language-switcher')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'End' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(setLocale).toHaveBeenCalledWith(LOCALES[LOCALES.length - 1])
  })

  it('wraps around rather than dead-ending at the last card', () => {
    render(<LanguageSwitcher />)
    const trigger = screen.getByTestId('language-switcher')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(setLocale).toHaveBeenCalledWith(LOCALES[LOCALES.length - 1])
  })

  it('closes on Escape and gives focus back, so the tab order is not lost', () => {
    render(<LanguageSwitcher />)
    const trigger = screen.getByTestId('language-switcher')
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(setLocale).not.toHaveBeenCalled()
  })

  it('closes when the pointer goes down elsewhere on the page', () => {
    render(
      <div>
        <LanguageSwitcher />
        <button type="button">somewhere else</button>
      </div>,
    )
    open()
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByText('somewhere else'))
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('follows the app when the language changes from somewhere else', async () => {
    render(<LanguageSwitcher />)
    await i18next.changeLanguage('de')
    expect(screen.getByTestId('language-switcher')).toHaveAccessibleName(/Deutsch/)
  })
})
