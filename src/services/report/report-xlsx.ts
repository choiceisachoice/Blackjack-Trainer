import type { Cell, Row, Sheet } from 'write-excel-file/browser'
import type { AccountReport, ReportSection } from './account-report'
import { REPORT_COLORS as C } from './report-style'

/** What write-excel-file's browser build accepts for embedded files (none are used here). */
type FileContent = File | Blob | ArrayBuffer
const hex = (c: string) => `#${c}`

/** Excel's sheet-name rules: at most 31 characters, none of : \ / ? * [ ]. */
export function sheetName(title: string, taken: Set<string>): string {
  let base = title.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet'
  let name = base
  for (let n = 2; taken.has(name.toLowerCase()); n++) {
    const suffix = ` (${n})`
    base = base.slice(0, 31 - suffix.length)
    name = base + suffix
  }
  taken.add(name.toLowerCase())
  return name
}

const headCell = (value: string, right: boolean): Cell => ({
  value, fontWeight: 'bold', textColor: hex(C.gold), backgroundColor: hex(C.ink), align: right ? 'right' : 'left',
})

/**
 * The workbook: an overview sheet with the title and every section's key
 * figures, then one sheet per table. Pure, so its layout can be tested.
 *
 * @param report - The built report
 * @returns The sheets for write-excel-file
 */
export function reportSheets(report: AccountReport): Sheet<FileContent>[] {
  const taken = new Set<string>()
  const overview: Row[] = [
    [{ value: report.title, fontWeight: 'bold', fontSize: 16 }],
    [{ value: report.generated, textColor: hex(C.muted) }],
    [],
  ]
  for (const s of report.sections) {
    if (!s.facts?.length && !s.text && !(s.empty && !s.table)) continue
    overview.push([{ value: s.title, fontWeight: 'bold', fontSize: 12, bottomBorderColor: hex(C.gold), bottomBorderStyle: 'medium' }, { value: '', bottomBorderColor: hex(C.gold), bottomBorderStyle: 'medium' }])
    for (const f of s.facts ?? []) overview.push([{ value: f.label, textColor: hex(C.muted) }, { value: f.value, fontWeight: 'bold', align: 'right' }])
    // Excel does not grow a merged row to fit wrapped text, so the height is
    // set from the length: about 70 characters a line across both columns.
    if (s.text) overview.push([{ value: s.text, wrap: true, alignVertical: 'top', textColor: hex(C.muted), columnSpan: 2, height: Math.ceil(s.text.length / 70) * 15 + 4 }])
    else if (s.empty && !s.table) overview.push([{ value: s.empty, fontStyle: 'italic', textColor: hex(C.muted) }])
    overview.push([])
  }
  const sheets: Sheet<FileContent>[] = [{
    sheet: sheetName(report.subtitle, taken),
    data: overview,
    columns: [{ width: 34 }, { width: 44 }],
    showGridLines: false,
  }]
  for (const s of report.sections) {
    if (!s.table) continue
    sheets.push(tableSheet(s, taken))
  }
  return sheets
}

function tableSheet(s: ReportSection, taken: Set<string>): Sheet<FileContent> {
  const table = s.table!
  const data: Row[] = [
    table.columns.map((c, i) => headCell(c, table.numeric[i])),
    ...table.rows.map((r, ri) => r.map((v, i): Cell => ({
      value: v,
      align: table.numeric[i] ? 'right' : 'left',
      backgroundColor: ri % 2 === 1 ? hex(C.zebra) : undefined,
    }))),
  ]
  // Width from the longest value in each column, within sensible bounds.
  const widths = table.columns.map((c, i) =>
    Math.min(60, Math.max(10, c.length + 2, ...table.rows.map(r => (r[i]?.length ?? 0) + 2))))
  return {
    sheet: sheetName(s.title, taken),
    data,
    columns: widths.map(width => ({ width })),
    stickyRowsCount: 1,
  }
}

/**
 * Build the .xlsx and return it as a Blob, loading the library on demand.
 *
 * @param report - The built report
 * @returns The workbook file
 */
export async function reportXlsxBlob(report: AccountReport): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  return writeXlsxFile(reportSheets(report)).toBlob()
}
