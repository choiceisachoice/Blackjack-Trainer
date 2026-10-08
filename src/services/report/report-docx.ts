import {
  AlignmentType, BorderStyle, Document, Footer, Header, Packer, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'
import type { AccountReport, ReportFact, ReportSection, ReportTable } from './account-report'
import { REPORT_BRAND, REPORT_COLORS as C } from './report-style'

const FONT = 'Calibri'
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none }
const hair = { style: BorderStyle.SINGLE, size: 4, color: C.rule }
const fill = (color: string) => ({ type: ShadingType.CLEAR, color: 'auto', fill: color })

const run = (text: string, o: { size?: number; bold?: boolean; color?: string; italics?: boolean; caps?: boolean } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? 20, bold: o.bold, color: o.color ?? C.text, italics: o.italics, allCaps: o.caps })

/** Key figures as shaded tiles, three to a row. */
function factsTable(facts: ReportFact[]): Table {
  const rows: TableRow[] = []
  for (let i = 0; i < facts.length; i += 3) {
    const cells = facts.slice(i, i + 3).map(f => new TableCell({
      shading: fill(C.goldSoft),
      margins: { top: 110, bottom: 110, left: 140, right: 140 },
      width: { size: 33, type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.SINGLE, size: 24, color: 'FFFFFF' }, bottom: { style: BorderStyle.SINGLE, size: 24, color: 'FFFFFF' }, left: { style: BorderStyle.SINGLE, size: 24, color: 'FFFFFF' }, right: { style: BorderStyle.SINGLE, size: 24, color: 'FFFFFF' } },
      children: [
        new Paragraph({ children: [run(f.label, { size: 14, color: C.muted, caps: true })] }),
        new Paragraph({ spacing: { before: 40 }, children: [run(f.value, { size: 24, bold: true })] }),
      ],
    }))
    while (cells.length < 3) {
      cells.push(new TableCell({ borders: noBorders, width: { size: 33, type: WidthType.PERCENTAGE }, children: [new Paragraph('')] }))
    }
    rows.push(new TableRow({ children: cells }))
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: noBorders, rows })
}

/** A data table: dark head with gold text that repeats on every page, zebra body. */
function dataTable(table: ReportTable): Table {
  const align = (i: number) => (table.numeric[i] ? AlignmentType.RIGHT : AlignmentType.LEFT)
  const head = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: table.columns.map((c, i) => new TableCell({
      shading: fill(C.ink),
      margins: { top: 70, bottom: 70, left: 100, right: 100 },
      children: [new Paragraph({ alignment: align(i), children: [run(c, { size: 16, bold: true, color: C.gold })] })],
    })),
  })
  const body = table.rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((v, i) => new TableCell({
      shading: ri % 2 === 1 ? fill(C.zebra) : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ alignment: align(i), children: [run(v, { size: 17 })] })],
    })),
  }))
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: none, left: none, right: none, insideVertical: none, bottom: hair, insideHorizontal: hair },
    rows: [head, ...body],
  })
}

function sectionBlocks(s: ReportSection): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      keepNext: true,
      spacing: { before: 360, after: 60 },
      children: [run(s.title, { size: 28, bold: true })],
    }),
    // A short gold rule under the heading, as on the site.
    new Paragraph({
      keepNext: true,
      spacing: { after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: C.gold, space: 1 } },
      indent: { right: 8600 },
      children: [],
    }),
  ]
  if (s.facts?.length) out.push(factsTable(s.facts), new Paragraph({ spacing: { after: 120 }, children: [] }))
  if (s.table) out.push(dataTable(s.table))
  if (s.empty) out.push(new Paragraph({ children: [run(s.empty, { size: 19, italics: true, color: C.muted })] }))
  if (s.text) out.push(new Paragraph({ spacing: { line: 300 }, children: [run(s.text, { size: 19, color: C.muted })] }))
  return out
}

/**
 * The Word document. Pure apart from building objects, so it can be tested.
 *
 * @param report - The built report
 * @returns A docx Document
 */
export function reportDocx(report: AccountReport): Document {
  const header = new Header({
    children: [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noBorders,
        rows: [new TableRow({
          children: [
            new TableCell({
              shading: fill(C.ink),
              margins: { top: 160, bottom: 160, left: 200, right: 100 },
              borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 18, color: C.gold } },
              children: [new Paragraph({ children: [run(REPORT_BRAND, { size: 22, bold: true, color: C.gold })] })],
            }),
            new TableCell({
              shading: fill(C.ink),
              margins: { top: 160, bottom: 160, left: 100, right: 200 },
              borders: { ...noBorders, bottom: { style: BorderStyle.SINGLE, size: 18, color: C.gold } },
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(report.brand, { size: 17, color: 'BFC3C9' })] })],
            }),
          ],
        })],
      }),
    ],
  })
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        run(`${report.generated}   ·   `, { size: 15, color: C.muted }),
        new TextRun({ font: FONT, size: 15, color: C.muted, children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES] }),
      ],
    })],
  })
  return new Document({
    creator: report.brand,
    title: report.title,
    description: report.subtitle,
    sections: [{
      properties: { page: { margin: { top: 1500, bottom: 1100, left: 1000, right: 1000, header: 360 } } },
      headers: { default: header },
      footers: { default: footer },
      children: [
        new Paragraph({ spacing: { before: 120 }, children: [run(report.subtitle, { size: 16, bold: true, color: C.gold, caps: true })] }),
        new Paragraph({ spacing: { before: 60, after: 40 }, children: [run(report.title, { size: 44, bold: true })] }),
        new Paragraph({ children: [run(report.generated, { size: 18, color: C.muted })] }),
        ...report.sections.flatMap(sectionBlocks),
      ],
    }],
  })
}

/**
 * Build the .docx and return it as a Blob. The docx library is loaded only
 * when this module is, which the account page does on demand.
 *
 * @param report - The built report
 * @returns The Word file
 */
export function reportDocxBlob(report: AccountReport): Promise<Blob> {
  return Packer.toBlob(reportDocx(report))
}
