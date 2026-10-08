import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { AccountReport, ReportFact, ReportSection, ReportTable } from './account-report'
import { REPORT_BRAND, REPORT_COLORS as C } from './report-style'

const hex = (c: string) => `#${c}`

/** Key figures as tiles, three to a row. */
function factsBlock(facts: ReportFact[]): Content {
  const rows: TableCell[][] = []
  for (let i = 0; i < facts.length; i += 3) {
    const row: TableCell[] = facts.slice(i, i + 3).map(f => ({
      stack: [
        { text: f.label.toUpperCase(), fontSize: 7, color: hex(C.muted), characterSpacing: 0.6 },
        { text: f.value, fontSize: 12, bold: true, color: hex(C.text), margin: [0, 3, 0, 0] },
      ],
      fillColor: hex(C.goldSoft),
      margin: [8, 7, 8, 7],
    }))
    while (row.length < 3) row.push({ text: '' })
    rows.push(row)
  }
  return {
    table: { widths: ['*', '*', '*'], body: rows },
    layout: {
      hLineWidth: () => 4, vLineWidth: () => 4,
      hLineColor: () => '#FFFFFF', vLineColor: () => '#FFFFFF',
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
    margin: [-4, 0, -4, 8],
  }
}

/** A data table: dark head with gold text, quiet zebra body, repeated head on page breaks. */
function tableBlock(table: ReportTable): Content {
  const head: TableCell[] = table.columns.map((c, i) => ({
    text: c, bold: true, fontSize: 8, color: hex(C.gold), fillColor: hex(C.ink),
    alignment: table.numeric[i] ? 'right' : 'left',
  }))
  const body: TableCell[][] = table.rows.map((r, ri) => r.map((v, i) => ({
    text: v, fontSize: 8.5, color: hex(C.text),
    alignment: table.numeric[i] ? 'right' : 'left',
    fillColor: ri % 2 === 1 ? hex(C.zebra) : undefined,
  })))
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: table.columns.map((_, i) => (table.numeric[i] ? 'auto' : '*')),
      body: [head, ...body],
    },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? 0 : 0.5), vLineWidth: () => 0,
      hLineColor: () => hex(C.rule),
      paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4,
    },
    margin: [0, 0, 0, 6],
  }
}

function sectionBlock(s: ReportSection): Content[] {
  const out: Content[] = [
    {
      stack: [
        { text: s.title, fontSize: 14, bold: true, color: hex(C.text) },
        { canvas: [{ type: 'rect', x: 0, y: 4, w: 36, h: 2.5, color: hex(C.gold) }] },
      ],
      margin: [0, 18, 0, 10],
      // Keep a heading with what follows it.
      unbreakable: true,
    },
  ]
  if (s.facts?.length) out.push(factsBlock(s.facts))
  if (s.table) out.push(tableBlock(s.table))
  if (s.empty) out.push({ text: s.empty, italics: true, fontSize: 9.5, color: hex(C.muted) })
  if (s.text) out.push({ text: s.text, fontSize: 9.5, color: hex(C.muted), lineHeight: 1.35 })
  return out
}

/**
 * The PDF as a pdfmake document. Pure, so its structure can be tested without
 * rendering a file.
 *
 * @param report - The built report
 * @returns The pdfmake document definition
 */
export function reportPdfDefinition(report: AccountReport): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageMargins: [48, 96, 48, 56],
    info: { title: report.title, author: report.brand, subject: report.subtitle },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: hex(C.text) },
    background: (_page, size) => ({
      canvas: [
        { type: 'rect', x: 0, y: 0, w: size.width, h: 62, color: hex(C.ink) },
        { type: 'rect', x: 0, y: 62, w: size.width, h: 2.5, color: hex(C.gold) },
      ],
    }),
    header: () => ({
      columns: [
        { text: REPORT_BRAND, color: hex(C.gold), bold: true, fontSize: 11, characterSpacing: 2.5 },
        { text: report.brand, color: '#BFC3C9', fontSize: 8.5, alignment: 'right', margin: [0, 2, 0, 0] },
      ],
      margin: [48, 24, 48, 0],
    }),
    footer: (page, pages) => ({
      columns: [
        { text: report.generated, fontSize: 7.5, color: hex(C.muted) },
        { text: `${page} / ${pages}`, fontSize: 7.5, color: hex(C.muted), alignment: 'right' },
      ],
      margin: [48, 20, 48, 0],
    }),
    content: [
      { text: report.subtitle.toUpperCase(), fontSize: 8, bold: true, color: hex(C.gold), characterSpacing: 1.5 },
      { text: report.title, fontSize: 24, bold: true, color: hex(C.text), margin: [0, 4, 0, 2] },
      { text: report.generated, fontSize: 9, color: hex(C.muted), margin: [0, 0, 0, 4] },
      ...report.sections.flatMap(sectionBlock),
    ],
  }
}

/**
 * Build the PDF and hand it to the browser. pdfmake and its Roboto font
 * (which carries the Turkish and other Latin Extended letters the UI uses) are
 * loaded only now, so the app does not carry them on every page.
 *
 * @param report - The built report
 * @param fileName - The file name to suggest
 */
export async function downloadReportPdf(report: AccountReport, fileName: string): Promise<void> {
  const [{ default: pdfMake }, vfsModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  const vfs = (vfsModule as { default?: Record<string, string> }).default ?? (vfsModule as unknown as Record<string, string>)
  pdfMake.addVirtualFileSystem(vfs)
  pdfMake.addFonts({
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
  })
  await pdfMake.createPdf(reportPdfDefinition(report)).download(fileName)
}
