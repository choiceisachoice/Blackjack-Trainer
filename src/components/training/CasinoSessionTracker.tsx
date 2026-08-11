import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from 'recharts'
import { ClipboardList } from 'lucide-react'
import {
  useCasinoSessionTrackerStore,
  type TrackedCasinoSession,
} from '../../store/casino-session-tracker-store'

// ── Helpers ─────────────────────────────────────────────────────────

function fmtDollar(n: number, showSign = false): string {
  const sign = showSign && n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtDate(dateStr: string): string {
  if (dateStr === 'Start') return 'Start'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

function winRateGlow(rate: number): string {
  if (rate > 0.55) return '0 0 20px rgba(34, 197, 94, 0.25), 0 0 40px rgba(34, 197, 94, 0.08)'
  if (rate >= 0.45) return '0 0 20px rgba(234, 179, 8, 0.2), 0 0 40px rgba(234, 179, 8, 0.05)'
  return '0 0 20px rgba(239, 68, 68, 0.2), 0 0 40px rgba(239, 68, 68, 0.05)'
}

function profitGlow(profit: number): string {
  if (profit > 0) return '0 0 20px rgba(34, 197, 94, 0.25), 0 0 40px rgba(34, 197, 94, 0.08)'
  if (profit < 0) return '0 0 20px rgba(239, 68, 68, 0.2), 0 0 40px rgba(239, 68, 68, 0.05)'
  return 'none'
}

function gradeColor(grade: string): string {
  if (grade === 'A+') return 'text-[#FFD700]'
  if (grade === 'A') return 'text-green-400'
  if (grade === 'B+' || grade === 'B') return 'text-green-300'
  if (grade === 'C') return 'text-yellow-400'
  return 'text-red-400'
}

// ── Chart types ─────────────────────────────────────────────────────

interface ChartDataPoint {
  label: string
  date: string
  bankroll: number
  profit: number
  grade: string
  score: number
  hands: number
}

// ── Custom Tooltip ──────────────────────────────────────────────────

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-casino-bg border border-contrast/20 rounded-lg p-3 text-sm shadow-lg">
      <p className="text-content/70 text-xs">{d.date}</p>
      {d.profit !== 0 && (
        <p className={d.profit > 0 ? 'text-green-400' : 'text-red-400'}>
          {fmtDollar(d.profit, true)}
        </p>
      )}
      {d.grade && (
        <p className="text-content/60 text-xs">Grade: {d.grade} ({d.score.toFixed(0)}%)</p>
      )}
      {d.hands > 0 && (
        <p className="text-content/60 text-xs">{d.hands} hands</p>
      )}
      <p className="text-content font-bold mt-1">Bankroll: {fmtDollar(d.bankroll)}</p>
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────

export function CasinoSessionTracker() {
  const { t } = useTranslation()
  const sessions = useCasinoSessionTrackerStore(s => s.sessions)
  const startingBankroll = useCasinoSessionTrackerStore(s => s.startingBankroll)
  const setStartingBankroll = useCasinoSessionTrackerStore(s => s.setStartingBankroll)
  const deleteSession = useCasinoSessionTrackerStore(s => s.deleteSession)
  const getCurrentBankroll = useCasinoSessionTrackerStore(s => s.getCurrentBankroll)
  const getTotalProfit = useCasinoSessionTrackerStore(s => s.getTotalProfit)
  const getWinRate = useCasinoSessionTrackerStore(s => s.getWinRate)
  const getAvgScore = useCasinoSessionTrackerStore(s => s.getAvgScore)
  const getBestSession = useCasinoSessionTrackerStore(s => s.getBestSession)
  const getWorstSession = useCasinoSessionTrackerStore(s => s.getWorstSession)
  const getSessionCount = useCasinoSessionTrackerStore(s => s.getSessionCount)
  const getWinningStreak = useCasinoSessionTrackerStore(s => s.getWinningStreak)
  const getLosingStreak = useCasinoSessionTrackerStore(s => s.getLosingStreak)
  const getTotalHands = useCasinoSessionTrackerStore(s => s.getTotalHands)

  // ── Onboarding state ──
  const [onboardingBankroll, setOnboardingBankroll] = useState('')
  const isOnboarding = startingBankroll === 0 && sessions.length === 0

  // ── Delete confirmation ──
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── Edit starting bankroll inline ──
  const [isEditingStart, setIsEditingStart] = useState(false)
  const [editStartValue, setEditStartValue] = useState('')

  // ── Computed values ──
  const currentBankroll = getCurrentBankroll()
  const totalProfit = getTotalProfit()
  const winRate = getWinRate()
  const avgScore = getAvgScore()
  const bestSession = getBestSession()
  const worstSession = getWorstSession()
  const sessionCount = getSessionCount()
  const winningStreak = getWinningStreak()
  const losingStreak = getLosingStreak()
  const totalHands = getTotalHands()
  const roi = startingBankroll > 0 ? totalProfit / startingBankroll : 0

  // ── Chart data ──
  const chartData = useMemo((): ChartDataPoint[] => {
    const sorted = [...sessions].sort((a, b) => a.timestamp - b.timestamp)
    const data: ChartDataPoint[] = [
      { label: t('tracker.start'), date: t('tracker.start'), bankroll: startingBankroll, profit: 0, grade: '', score: 0, hands: 0 },
    ]
    sorted.forEach((session, i) => {
      const prevBankroll = data[i].bankroll
      data.push({
        label: `#${i + 1}`,
        date: fmtDate(session.date),
        bankroll: prevBankroll + session.profit,
        profit: session.profit,
        grade: session.grade,
        score: session.overallScore,
        hands: session.handsPlayed,
      })
    })
    return data
    // `t` is a dependency because the first point is labelled "Start" — the
    // chart has to be rebuilt when the language changes, or its origin keeps
    // the previous language's word.
  }, [sessions, startingBankroll, t])

  // ── Session list (newest first) ──
  const sortedSessions = useMemo(() =>
    [...sessions].sort((a, b) => b.timestamp - a.timestamp),
    [sessions],
  )

  const handleDelete = useCallback((id: string) => {
    deleteSession(id)
    setConfirmDeleteId(null)
  }, [deleteSession])

  const handleStartTracking = useCallback(() => {
    const amount = parseFloat(onboardingBankroll)
    if (isNaN(amount) || amount <= 0) return
    setStartingBankroll(amount)
  }, [onboardingBankroll, setStartingBankroll])

  // ── Onboarding Screen ──
  if (isOnboarding) {
    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-6" data-testid="cs-tracker">
        <div className="max-w-md mx-auto mt-16 text-center">
          <span className="grid place-items-center w-16 h-16 mx-auto mb-4 rounded-2xl text-gold bg-gold/10 border border-gold/20">
            <ClipboardList size={30} />
          </span>
          <h2 className="text-2xl font-bold text-content mb-3">{t('tracker.onboardTitle')}</h2>
          <p className="text-content/50 mb-2">
            {t('tracker.onboardBody')}
          </p>
          <p className="text-content/40 text-sm mb-8">
            {t('tracker.onboardNote')}
          </p>
          <div className="flex flex-col items-center gap-4">
            <label className="w-full max-w-xs">
              <span className="text-sm text-content/60 block mb-2">{t('tracker.startingBankroll')}</span>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content/40">$</span>
                <input
                  type="number"
                  value={onboardingBankroll}
                  onChange={e => setOnboardingBankroll(e.target.value)}
                  placeholder="10,000"
                  data-testid="onboarding-bankroll-input"
                  className="w-full pl-7 pr-3 py-3 rounded-xl bg-input-bg border border-contrast/20 text-content text-lg text-center focus:outline-none focus:border-gold/60"
                />
              </div>
            </label>
            <button
              onClick={handleStartTracking}
              data-testid="start-tracking-btn"
              disabled={!onboardingBankroll || parseFloat(onboardingBankroll) <= 0}
              className="px-8 py-3 rounded-xl bg-gold text-black font-semibold text-lg hover:bg-gold/90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('tracker.startTracking')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main Tracker View ──
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" data-testid="cs-tracker">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-gold-gradient">{t('tracker.title')}</h1>
        <p className="text-sm text-content/50">{t('tracker.sub')}</p>
      </div>

      {/* ── Section A: Overview ── */}
      <section data-testid="overview-section">
        <div className="text-center mb-4">
          <p className="text-xs text-content/40 mb-1">{t('tracker.currentBankroll')}</p>
          <p className={`text-4xl font-bold ${currentBankroll >= startingBankroll ? 'text-green-400' : 'text-red-400'}`}
            data-testid="current-bankroll">
            {fmtDollar(currentBankroll)}
          </p>
          <div className="text-sm text-content/50 mt-1 flex items-center justify-center gap-1 flex-wrap" data-testid="overview-summary">
            {isEditingStart ? (
              <span className="inline-flex items-center gap-1.5">
                <span>{t('tracker.startingPrefix')} $</span>
                <input
                  type="number"
                  value={editStartValue}
                  onChange={e => setEditStartValue(e.target.value)}
                  data-testid="edit-starting-input"
                  className="w-24 px-2 py-0.5 rounded-lg bg-input-bg border border-contrast/20 text-content text-sm text-center focus:outline-none focus:border-gold/60"
                  autoFocus
                />
                <button
                  onClick={() => {
                    const amount = parseFloat(editStartValue)
                    if (!isNaN(amount) && amount > 0) setStartingBankroll(amount)
                    setIsEditingStart(false)
                  }}
                  data-testid="save-starting-btn"
                  className="text-xs text-green-400 hover:text-green-300 cursor-pointer font-semibold"
                >
                  {t('tracker.save')}
                </button>
                <button
                  onClick={() => setIsEditingStart(false)}
                  data-testid="cancel-starting-btn"
                  className="text-xs text-content/40 hover:text-content cursor-pointer"
                >
                  {t('tracker.cancel')}
                </button>
              </span>
            ) : (
              <span>
                {t('tracker.startingPrefix')} {fmtDollar(startingBankroll)}
                <button
                  onClick={() => { setEditStartValue(String(startingBankroll)); setIsEditingStart(true) }}
                  data-testid="edit-starting-btn"
                  className="ml-1 text-xs text-content/30 hover:text-gold cursor-pointer"
                  title={t('tracker.editStarting')}
                >
                  {'\u270F\uFE0F'}
                </button>
              </span>
            )}
            {' \u2502 '}
            {t('tracker.profit')} <span className={totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}>{fmtDollar(totalProfit, true)}</span>
            {' \u2502 '}
            ROI: <span className={roi >= 0 ? 'text-green-400' : 'text-red-400'}>{roi >= 0 ? '+' : ''}{(roi * 100).toFixed(1)}%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="stat-cards">
          {/* Sessions */}
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-3 text-center">
            <p className="text-xs text-content/50">{t('tracker.sessions')}</p>
            <p className="text-xl font-bold text-content" data-testid="stat-sessions">{sessionCount}</p>
          </div>

          {/* Win Rate */}
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-3 text-center transition-shadow"
            style={{ boxShadow: sessionCount > 0 ? winRateGlow(winRate) : 'none' }}>
            <p className="text-xs text-content/50">{t('tracker.winRate')}</p>
            <p className={`text-xl font-bold ${winRate > 0.55 ? 'text-green-400' : winRate >= 0.45 ? 'text-yellow-400' : 'text-red-400'}`}
              data-testid="stat-winrate">
              {sessionCount > 0 ? `${Math.round(winRate * 100)}%` : '\u2014'}
            </p>
          </div>

          {/* Avg Score */}
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-3 text-center transition-shadow"
            style={{ boxShadow: sessionCount > 0 ? profitGlow(avgScore > 80 ? 1 : avgScore > 60 ? 0 : -1) : 'none' }}>
            <p className="text-xs text-content/50">{t('tracker.avgScore')}</p>
            <p className={`text-xl font-bold ${avgScore >= 80 ? 'text-green-400' : avgScore >= 60 ? 'text-yellow-400' : 'text-red-400'}`}
              data-testid="stat-avg-score">
              {sessionCount > 0 ? `${avgScore.toFixed(0)}%` : '\u2014'}
            </p>
          </div>

          {/* Total Hands */}
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-3 text-center">
            <p className="text-xs text-content/50">{t('tracker.hands')}</p>
            <p className="text-xl font-bold text-content" data-testid="stat-hands">
              {totalHands > 0 ? totalHands.toLocaleString() : '\u2014'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Section B: Chart ── */}
      <section data-testid="chart-section">
        <h2 className="text-lg font-semibold text-content mb-3">{t('tracker.bankrollHistory')}</h2>
        <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4">
          {sessions.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <defs>
                  <linearGradient id="csTrackerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={totalProfit >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={totalProfit >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine
                  y={startingBankroll}
                  stroke="rgba(255,255,255,0.2)"
                  strokeDasharray="4 4"
                  label={{ value: 'Starting', fill: 'rgba(255,255,255,0.3)', fontSize: 10, position: 'right' }}
                />
                <Area
                  type="monotone"
                  dataKey="bankroll"
                  stroke={totalProfit >= 0 ? '#22c55e' : '#ef4444'}
                  strokeWidth={2}
                  fill="url(#csTrackerGradient)"
                  dot={{ r: 3, fill: totalProfit >= 0 ? '#22c55e' : '#ef4444', strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-content/30 text-sm">
              {t('tracker.chartEmpty')}
            </div>
          )}
        </div>
      </section>

      {/* ── Section C: Personal Records ── */}
      {sessionCount > 0 && <PersonalRecordsSection />}

      {/* ── Section D: Session List ── */}
      <section data-testid="session-section">
        <h2 className="text-lg font-semibold text-content mb-3">Sessions</h2>

        {sortedSessions.length > 0 ? (
          <div className="space-y-2" data-testid="session-list">
            {sortedSessions.map(session => (
              <SessionRow
                key={session.id}
                session={session}
                confirmDeleteId={confirmDeleteId}
                onDelete={handleDelete}
                onConfirmDelete={setConfirmDeleteId}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-content/30 text-sm py-8" data-testid="empty-sessions">
            {t('tracker.listEmpty')}
          </div>
        )}
      </section>

      {/* ── Section E: Highlights ── */}
      {sessionCount > 0 && (
        <section data-testid="additional-stats">
          <h2 className="text-lg font-semibold text-content mb-3">{t('tracker.highlights')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Best Session */}
            <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4 text-center"
              style={{ boxShadow: bestSession ? profitGlow(bestSession.profit) : 'none' }}>
              <p className="text-xs text-content/50 mb-1">{'\uD83C\uDFC6'} Best Session</p>
              {bestSession && (
                <>
                  <p className="text-xl font-bold text-green-400" data-testid="best-session-result">
                    {fmtDollar(bestSession.profit, true)}
                  </p>
                  <p className="text-xs text-content/50">{bestSession.grade} ({bestSession.overallScore.toFixed(0)}%)</p>
                  <p className="text-xs text-content/40">{fmtDate(bestSession.date)}</p>
                </>
              )}
            </div>

            {/* Worst Session */}
            <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4 text-center"
              style={{ boxShadow: worstSession ? profitGlow(worstSession.profit) : 'none' }}>
              <p className="text-xs text-content/50 mb-1">{'\uD83D\uDE22'} Worst Session</p>
              {worstSession && (
                <>
                  <p className="text-xl font-bold text-red-400" data-testid="worst-session-result">
                    {fmtDollar(worstSession.profit, true)}
                  </p>
                  <p className="text-xs text-content/50">{worstSession.grade} ({worstSession.overallScore.toFixed(0)}%)</p>
                  <p className="text-xs text-content/40">{fmtDate(worstSession.date)}</p>
                </>
              )}
            </div>

            {/* Streaks */}
            <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4 text-center">
              <p className="text-xs text-content/50 mb-1">{'\uD83D\uDD25'} Streaks</p>
              <div className="flex justify-center gap-4 mt-1">
                <div>
                  <p className="text-xl font-bold text-green-400" data-testid="winning-streak">{winningStreak}</p>
                  <p className="text-[0.6875rem] text-content/40">{t('tracker.win')}</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-red-400" data-testid="losing-streak">{losingStreak}</p>
                  <p className="text-[0.6875rem] text-content/40">{t('tracker.loss')}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Bottom padding */}
      <div className="pb-8" />
    </div>
  )
}

// ── Session Row Component ────────────────────────────────────────────

function SessionRow({
  session,
  confirmDeleteId,
  onDelete,
  onConfirmDelete,
}: {
  session: TrackedCasinoSession
  confirmDeleteId: string | null
  onDelete: (id: string) => void
  onConfirmDelete: (id: string | null) => void
}) {
  return (
    <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-3" data-testid={`session-${session.id}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-xs text-content/50 shrink-0">{fmtDate(session.date)}</span>
          <span className="text-xs text-content/40 shrink-0">{session.config.numDecks}D, ${session.config.minBet} min</span>
          <span className={`text-sm font-bold shrink-0 ${session.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {fmtDollar(session.profit, true)}
          </span>
          <span className="text-xs text-content/40 shrink-0">{session.handsPlayed} hands</span>
          <span className={`text-sm font-bold shrink-0 ${gradeColor(session.grade)}`}>
            {session.grade}
          </span>
        </div>
        <div className="flex items-center gap-2 ml-2 shrink-0">
          {confirmDeleteId === session.id ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onDelete(session.id)}
                data-testid={`confirm-delete-${session.id}`}
                className="text-xs text-red-400 hover:text-red-300 cursor-pointer font-semibold"
              >
                Confirm
              </button>
              <button
                onClick={() => onConfirmDelete(null)}
                className="text-xs text-content/40 hover:text-content cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => onConfirmDelete(session.id)}
              data-testid={`delete-${session.id}`}
              className="text-xs text-content/40 hover:text-red-400 transition-colors cursor-pointer"
            >
              {'\uD83D\uDDD1\uFE0F'}
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-3 mt-1 text-xs text-content/40">
        <span>Play: {session.playAccuracy.toFixed(0)}%</span>
        <span>Bet: {session.betAccuracy.toFixed(0)}%</span>
        <span>Count: {session.countAccuracy.toFixed(0)}%</span>
        <span className="ml-auto">{fmtDuration(session.duration)}</span>
      </div>
    </div>
  )
}

// ── Personal Records Component ────────────────────────────────────

function PersonalRecordsSection() {
  const { t } = useTranslation()
  const records = useCasinoSessionTrackerStore(s => s.getPersonalRecords)()
  const winRate = useCasinoSessionTrackerStore(s => s.getWinRate)()
  const sessionCount = useCasinoSessionTrackerStore(s => s.getSessionCount)()

  const cards: { label: string; testId: string; icon: string; value: string; sub?: string; glow?: string }[] = [
    {
      label: t('tracker.bestSession'),
      testId: 'record-best-session',
      icon: '\uD83E\uDD47',
      value: records.bestSession ? fmtDollar(records.bestSession.profit, true) : '\u2014',
      sub: records.bestSession ? fmtDate(records.bestSession.date) : undefined,
      glow: records.bestSession && records.bestSession.profit > 0
        ? '0 0 20px rgba(34, 197, 94, 0.25), 0 0 40px rgba(34, 197, 94, 0.08)' : undefined,
    },
    {
      label: t('tracker.worstSession'),
      testId: 'record-worst-session',
      icon: '\uD83D\uDE22',
      value: records.worstSession ? fmtDollar(records.worstSession.profit, true) : '\u2014',
      sub: records.worstSession ? fmtDate(records.worstSession.date) : undefined,
      glow: records.worstSession && records.worstSession.profit < 0
        ? '0 0 20px rgba(239, 68, 68, 0.2), 0 0 40px rgba(239, 68, 68, 0.05)' : undefined,
    },
    {
      label: t('tracker.winStreak'),
      testId: 'record-win-streak',
      icon: '\uD83D\uDD25',
      value: records.longestWinStreak > 0 ? t('tracker.nSessions', { n: records.longestWinStreak }) : '\u2014',
    },
    {
      label: t('tracker.bestScore'),
      testId: 'record-best-score',
      icon: '\uD83C\uDFAF',
      value: records.bestScore ? `${records.bestScore.overallScore.toFixed(0)}% (${records.bestScore.grade})` : '\u2014',
      sub: records.bestScore ? fmtDate(records.bestScore.date) : undefined,
    },
    {
      label: t('tracker.peakBankroll'),
      testId: 'record-peak-bankroll',
      icon: '\uD83D\uDCC8',
      value: records.highestBankroll > 0 ? fmtDollar(records.highestBankroll) : '\u2014',
    },
    {
      label: t('tracker.mostHands'),
      testId: 'record-most-hands',
      icon: '\uD83C\uDCA3',
      value: records.longestSession ? t('tracker.nHands', { n: records.longestSession.handsPlayed }) : '\u2014',
      sub: records.longestSession ? fmtDate(records.longestSession.date) : undefined,
    },
    {
      label: t('tracker.bestGrade'),
      testId: 'record-best-grade',
      icon: '\uD83C\uDF93',
      value: records.bestGrade || '\u2014',
    },
    {
      label: t('tracker.winRate'),
      testId: 'record-win-rate',
      icon: '\u2705',
      value: sessionCount > 0 ? `${Math.round(winRate * 100)}%` : '\u2014',
    },
  ]

  return (
    <section data-testid="personal-records">
      <h2 className="text-lg font-semibold text-content mb-3">{'\uD83C\uDFC6'} {t('tracker.personalRecords')}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map(card => (
          <div
            key={card.testId}
            data-testid={card.testId}
            className="bg-contrast/5 border border-contrast/10 rounded-xl p-3 text-center transition-shadow"
            style={{ boxShadow: card.glow ?? 'none' }}
          >
            <p className="text-xs text-content/50 mb-1">
              {card.icon} {card.label}
            </p>
            <p className={`text-lg font-bold ${
              card.testId === 'record-best-session' && records.bestSession && records.bestSession.profit > 0 ? 'text-green-400' :
              card.testId === 'record-worst-session' && records.worstSession && records.worstSession.profit < 0 ? 'text-red-400' :
              'text-content'
            }`}>
              {card.value}
            </p>
            {card.sub && (
              <p className="text-[0.6875rem] text-content/40 mt-0.5 truncate">{card.sub}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
