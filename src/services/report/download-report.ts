import { useStatsStore } from '../../store/stats-store'
import { useLevelStore } from '../../store/level-store'
import { useBankrollTrackerStore } from '../../store/bankroll-tracker-store'
import { useCasinoSessionTrackerStore } from '../../store/casino-session-tracker-store'
import { achievementEngine } from '../achievements/achievement-engine'
import { ALL_ACHIEVEMENTS } from '../achievements/achievement-list'
import { collectDataExport, downloadBlob, downloadJson, exportFileName } from '../data-export'
import { buildAccountReport, reportFileName, type AccountReport } from './account-report'

/** The formats "Download my data" offers. */
export type DataFormat = 'pdf' | 'docx' | 'xlsx' | 'json'

/**
 * The account overview from the stores, as of now.
 *
 * @param email - The signed-in address, or null
 * @param locale - The UI language
 * @param t - The translator
 * @returns The report, ready for any renderer
 */
export function collectAccountReport(
  email: string | null,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): AccountReport {
  return buildAccountReport({
    email,
    totalXP: useLevelStore.getState().totalXP,
    unlocked: achievementEngine.getUnlocked(),
    totalAchievements: ALL_ACHIEVEMENTS.length,
    sessions: useStatsStore.getState().sessions,
    casinoSessions: useCasinoSessionTrackerStore.getState().sessions,
    bankroll: useBankrollTrackerStore.getState().sessions,
    now: new Date(),
    locale,
    t,
  })
}

/**
 * Produce and download the person's data in the chosen format. The PDF, Word
 * and Excel libraries are each loaded only when that format is chosen.
 *
 * @param format - Which file
 * @param email - The signed-in address, or null
 * @param locale - The UI language
 * @param t - The translator
 */
export async function downloadAccountData(
  format: DataFormat,
  email: string | null,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): Promise<void> {
  const now = new Date()
  if (format === 'json') {
    downloadJson(exportFileName(now), collectDataExport(email))
    return
  }
  const report = collectAccountReport(email, locale, t)
  if (format === 'pdf') {
    const { downloadReportPdf } = await import('./report-pdf')
    await downloadReportPdf(report, reportFileName(now, 'pdf'))
  } else if (format === 'docx') {
    const { reportDocxBlob } = await import('./report-docx')
    downloadBlob(reportFileName(now, 'docx'), await reportDocxBlob(report))
  } else {
    const { reportXlsxBlob } = await import('./report-xlsx')
    downloadBlob(reportFileName(now, 'xlsx'), await reportXlsxBlob(report))
  }
}
