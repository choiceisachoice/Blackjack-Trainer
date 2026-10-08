import { describe, it, expect } from 'vitest'
import { Packer } from 'docx'
import JSZip from 'jszip'
import type { AccountReport } from './account-report'
import { reportPdfDefinition } from './report-pdf'
import { reportDocx } from './report-docx'
import { reportSheets, sheetName } from './report-xlsx'

/**
 * The three renderers draw the same report. Checked on a small fixed report:
 * the PDF definition, the Word document as written to disk, and the workbook's
 * sheets — every title and value from the report must reach each of them.
 */
const REPORT: AccountReport = {
  title: 'Your Blackjack Trainer account',
  subtitle: 'Account overview',
  generated: 'Created on Oct 8, 2026',
  brand: 'black-jack-training.com',
  sections: [
    { id: 'profile', title: 'Profile', facts: [{ label: 'Level', value: 'Level 4 — Table Regular' }, { label: 'Total XP', value: '1,665' }] },
    { id: 'casino', title: 'Casino sessions', table: { columns: ['Date', 'Result'], numeric: [false, true], rows: [['Oct 8, 2026', '+$60'], ['Oct 7, 2026', '-$25']] } },
    { id: 'achievements', title: 'Achievements unlocked', empty: 'No achievements unlocked yet.' },
    { id: 'about', title: 'About this document', text: 'This overview shows the most important information.' },
  ],
}

describe('reportPdfDefinition', () => {
  const def = reportPdfDefinition(REPORT)
  const text = JSON.stringify(def.content)

  it('carries every section title and value', () => {
    for (const s of ['Profile', '1,665', 'Casino sessions', '+$60', 'No achievements unlocked yet.', 'This overview shows']) {
      expect(text).toContain(s)
    }
  })

  it('repeats the table head on every page and keeps rows whole', () => {
    expect(text).toContain('"headerRows":1')
    expect(text).toContain('"dontBreakRows":true')
  })

  it('right-aligns the numeric columns', () => {
    expect(text).toMatch(/"text":"\+\$60"[^}]*"alignment":"right"/)
  })

  it('is A4 with a footer that numbers the pages', () => {
    expect(def.pageSize).toBe('A4')
    const footer = (def.footer as (p: number, n: number) => { columns: { text: string }[] })(2, 5)
    expect(footer.columns[1].text).toBe('2 / 5')
  })
})

describe('reportDocx', () => {
  it('writes a Word file that contains the report', async () => {
    // A .docx is a zip; the body is word/document.xml inside it.
    const zip = await JSZip.loadAsync(await Packer.toBuffer(reportDocx(REPORT)))
    const xml = await zip.file('word/document.xml')!.async('string')
    for (const s of ['Your Blackjack Trainer account', 'Profile', '1,665', '+$60', 'No achievements unlocked yet.']) {
      expect(xml).toContain(s)
    }
    // Table head repeats on each page.
    expect(xml).toContain('w:tblHeader')
  })
})

describe('reportSheets', () => {
  it('puts the key figures on an overview sheet and each table on its own', () => {
    const sheets = reportSheets(REPORT)
    expect(sheets.map(s => s.sheet)).toEqual(['Account overview', 'Casino sessions'])
    expect(JSON.stringify(sheets[0].data)).toContain('1,665')
    expect(sheets[1].stickyRowsCount).toBe(1)
    expect(JSON.stringify(sheets[1].data)).toContain('+$60')
  })

  it('makes legal, unique sheet names', () => {
    const taken = new Set<string>()
    expect(sheetName('Last 25 sessions: recent / all [x]?', taken)).toBe('Last 25 sessions recent all x')
    expect(sheetName('A'.repeat(40), taken)).toHaveLength(31)
    expect(sheetName('Profile', taken)).toBe('Profile')
    expect(sheetName('profile', taken)).toBe('profile (2)')
  })
})
