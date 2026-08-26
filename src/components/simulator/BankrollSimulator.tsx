import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { activeLocale } from '../../i18n'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart,
} from 'recharts'
import { Wallet } from 'lucide-react'
import { useBankrollTrackerStore, type TrackedSession } from '../../store/bankroll-tracker-store'

// ── Helpers ─────────────────────────────────────────────────────────

function fmtDollar(n: number, showSign = false): string {
  const sign = showSign && n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString(activeLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtDate(dateStr: string): string {
  if (dateStr === 'Start') return 'Start'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString(activeLocale(), { month: 'short', day: 'numeric', year: 'numeric' })
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

function todayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Chart types ─────────────────────────────────────────────────────

interface ChartDataPoint {
  label: string
  date: string
  bankroll: number
  casino: string
  result: number
}

// ── Custom Tooltip ──────────────────────────────────────────────────

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }> }) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-casino-bg border border-contrast/20 rounded-lg p-3 text-sm shadow-lg">
      <p className="text-content/70 text-xs">{fmtDate(d.date)}</p>
      {d.casino && <p className="text-content font-medium">{d.casino}</p>}
      {d.result !== 0 && (
        <p className={d.result > 0 ? 'text-green-400' : 'text-red-400'}>
          {fmtDollar(d.result, true)}
        </p>
      )}
      <p className="text-content font-bold mt-1">{t('sim.bankrollAt', { v: fmtDollar(d.bankroll) })}</p>
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────

export function BankrollSimulator() {
  const { t } = useTranslation()
  const sessions = useBankrollTrackerStore(s => s.sessions)
  const startingBankroll = useBankrollTrackerStore(s => s.startingBankroll)
  const addSession = useBankrollTrackerStore(s => s.addSession)
  const editSession = useBankrollTrackerStore(s => s.editSession)
  const deleteSession = useBankrollTrackerStore(s => s.deleteSession)
  const setStartingBankroll = useBankrollTrackerStore(s => s.setStartingBankroll)
  const getCurrentBankroll = useBankrollTrackerStore(s => s.getCurrentBankroll)
  const getTotalProfit = useBankrollTrackerStore(s => s.getTotalProfit)
  const getTotalHours = useBankrollTrackerStore(s => s.getTotalHours)
  const getWinRate = useBankrollTrackerStore(s => s.getWinRate)
  const getAvgPerHour = useBankrollTrackerStore(s => s.getAvgPerHour)
  const getBestSession = useBankrollTrackerStore(s => s.getBestSession)
  const getWorstSession = useBankrollTrackerStore(s => s.getWorstSession)
  const getSessionCount = useBankrollTrackerStore(s => s.getSessionCount)
  const getWinningStreak = useBankrollTrackerStore(s => s.getWinningStreak)
  const getLosingStreak = useBankrollTrackerStore(s => s.getLosingStreak)

  // ── Onboarding state ──
  const [onboardingBankroll, setOnboardingBankroll] = useState('')
  const isOnboarding = startingBankroll === 0 && sessions.length === 0

  // ── Form state ──
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formDate, setFormDate] = useState(todayString())
  const [formCasino, setFormCasino] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formIsWin, setFormIsWin] = useState(true)
  const [formHours, setFormHours] = useState('3')
  const [formNotes, setFormNotes] = useState('')
  const [showCasinoDropdown, setShowCasinoDropdown] = useState(false)
  const casinoInputRef = useRef<HTMLLabelElement>(null)

  // ── Delete confirmation ──
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── Edit starting bankroll inline ──
  const [isEditingStart, setIsEditingStart] = useState(false)
  const [editStartValue, setEditStartValue] = useState('')

  // ── Computed values ──
  const currentBankroll = getCurrentBankroll()
  const totalProfit = getTotalProfit()
  const totalHours = getTotalHours()
  const winRate = getWinRate()
  const avgPerHour = getAvgPerHour()
  const bestSession = getBestSession()
  const worstSession = getWorstSession()
  const sessionCount = getSessionCount()
  const winningStreak = getWinningStreak()
  const losingStreak = getLosingStreak()
  const roi = startingBankroll > 0 ? totalProfit / startingBankroll : 0

  // ── Casino autocomplete ──
  const uniqueCasinos = useMemo(() => {
    const names = new Set(sessions.map(s => s.casino).filter(Boolean))
    return [...names].sort()
  }, [sessions])

  const filteredCasinos = useMemo(() => {
    if (!formCasino) return uniqueCasinos
    return uniqueCasinos.filter(c => c.toLowerCase().includes(formCasino.toLowerCase()))
  }, [formCasino, uniqueCasinos])

  // Close casino dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (casinoInputRef.current && !casinoInputRef.current.contains(e.target as Node)) {
        setShowCasinoDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Chart data ──
  const chartData = useMemo((): ChartDataPoint[] => {
    const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    const data: ChartDataPoint[] = [
      { label: t('tracker.start'), date: t('tracker.start'), bankroll: startingBankroll, casino: '', result: 0 },
    ]
    sorted.forEach((session, i) => {
      const prevBankroll = data[i].bankroll
      data.push({
        label: `#${i + 1}`,
        date: session.date,
        bankroll: prevBankroll + session.result,
        casino: session.casino,
        result: session.result,
      })
    })
    return data
    // `t` is a dependency because the chart's origin point is labelled
    // "Start" — without it the axis keeps the previous language.
  }, [sessions, startingBankroll, t])

  // ── Session list (newest first) ──
  const sortedSessions = useMemo(() =>
    [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [sessions],
  )

  // ── Form handlers ──
  const resetForm = useCallback(() => {
    setFormDate(todayString())
    setFormCasino('')
    setFormAmount('')
    setFormIsWin(true)
    setFormHours('3')
    setFormNotes('')
    setEditingId(null)
    setShowForm(false)
  }, [])

  const openAddForm = useCallback(() => {
    resetForm()
    setShowForm(true)
  }, [resetForm])

  const openEditForm = useCallback((session: TrackedSession) => {
    setEditingId(session.id)
    setFormDate(session.date)
    setFormCasino(session.casino)
    setFormAmount(String(Math.abs(session.result)))
    setFormIsWin(session.result >= 0)
    setFormHours(String(session.hoursPlayed))
    setFormNotes(session.notes)
    setShowForm(true)
  }, [])

  const handleSave = useCallback(() => {
    const amount = parseFloat(formAmount)
    if (isNaN(amount) || amount < 0) return
    const hours = parseFloat(formHours)
    if (isNaN(hours) || hours <= 0) return

    const result = formIsWin ? amount : -amount
    const sessionData = {
      date: formDate,
      casino: formCasino.trim() || t('simulator.unknownVenue'),
      result,
      hoursPlayed: hours,
      notes: formNotes.trim(),
    }

    if (editingId) {
      editSession(editingId, sessionData)
    } else {
      addSession(sessionData)
    }
    resetForm()
  }, [formDate, formCasino, formAmount, formIsWin, formHours, formNotes, editingId, addSession, editSession, resetForm, t])

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
      <div className="flex-1 overflow-y-auto p-4 md:p-6" data-testid="bankroll-tracker">
        <div className="max-w-md mx-auto mt-16 text-center">
          <span className="grid place-items-center w-16 h-16 mx-auto mb-4 rounded-2xl text-gold bg-gold/10 border border-gold/20">
            <Wallet size={30} />
          </span>
          <h2 className="text-2xl font-bold text-content mb-3">{t('sim.onboardTitle')}</h2>
          <p className="text-content/50 mb-8">
            {t('sim.onboardBody')}
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
              className="px-8 py-3 rounded-xl bg-gold text-on-gold font-semibold text-lg hover:bg-gold/90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" data-testid="bankroll-tracker">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-gold-gradient">{t('sim.title')}</h1>
        <p className="text-sm text-content/50">{t('sim.sub')}</p>
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
                  {t('common.cancel')}
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
            {t('sim.roi')} <span className={roi >= 0 ? 'text-green-400' : 'text-red-400'}>{roi >= 0 ? '+' : ''}{(roi * 100).toFixed(1)}%</span>
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

          {/* $/hr */}
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-3 text-center transition-shadow"
            style={{ boxShadow: sessionCount > 0 ? profitGlow(avgPerHour) : 'none' }}>
            <p className="text-xs text-content/50">{t('sim.perHour')}</p>
            <p className={`text-xl font-bold ${avgPerHour >= 0 ? 'text-green-400' : 'text-red-400'}`}
              data-testid="stat-per-hour">
              {sessionCount > 0 ? `$${avgPerHour.toFixed(2)}` : '\u2014'}
            </p>
          </div>

          {/* Total Hours */}
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-3 text-center">
            <p className="text-xs text-content/50">{t('sim.hours')}</p>
            <p className="text-xl font-bold text-content" data-testid="stat-hours">
              {totalHours > 0 ? `${totalHours.toFixed(1)}h` : '\u2014'}
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
                  <linearGradient id="bankrollGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={totalProfit >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={totalProfit >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  axisLine
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(val: number) => `$${(val / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine
                  y={startingBankroll}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  label={{ value: t('simulator.startLine'), fontSize: 10, position: 'right' }}
                />
                <Area
                  type="monotone"
                  dataKey="bankroll"
                  stroke={totalProfit >= 0 ? '#22c55e' : '#ef4444'}
                  strokeWidth={2}
                  fill="url(#bankrollGradient)"
                  dot={{ r: 3, fill: totalProfit >= 0 ? '#22c55e' : '#ef4444', strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-content/30 text-sm">
              {t('sim.chartEmpty')}
            </div>
          )}
        </div>
      </section>

      {/* ── Section B2: Personal Records ── */}
      {sessionCount > 0 && <PersonalRecordsSection />}

      {/* ── Section C: Session List + Form ── */}
      <section data-testid="session-section">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-content">{t('sim.sessionsHeading')}</h2>
          {!showForm && (
            <button
              onClick={openAddForm}
              data-testid="add-session-btn"
              className="px-4 py-2 rounded-xl bg-gold text-on-gold font-semibold text-sm hover:bg-gold/90 transition-all cursor-pointer"
            >
              {t('sim.addSession')}
            </button>
          )}
        </div>

        {/* ── Session Form ── */}
        {showForm && (
          <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4 mb-4" data-testid="session-form">
            <h3 className="text-sm font-semibold text-content mb-3">
              {editingId ? t('simulator.editSession') : `+ ${t('simulator.newSession')}`}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Date */}
              <label className="block">
                <span className="text-xs text-content/60">{t('sim.date')}</span>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  data-testid="form-date"
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-input-bg border border-contrast/20 text-content text-sm focus:outline-none focus:border-gold/60"
                />
              </label>

              {/* Casino */}
              <label className="block relative" ref={casinoInputRef}>
                <span className="text-xs text-content/60">{t('sim.casino')}</span>
                <input
                  type="text"
                  value={formCasino}
                  onChange={e => { setFormCasino(e.target.value); setShowCasinoDropdown(true) }}
                  onFocus={() => setShowCasinoDropdown(true)}
                  placeholder="e.g. Bellagio"
                  data-testid="form-casino"
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-input-bg border border-contrast/20 text-content text-sm focus:outline-none focus:border-gold/60"
                />
                {showCasinoDropdown && filteredCasinos.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-casino-bg border border-contrast/20 rounded-lg shadow-lg max-h-32 overflow-y-auto"
                    data-testid="casino-dropdown">
                    {filteredCasinos.map(name => (
                      <button
                        key={name}
                        onClick={() => { setFormCasino(name); setShowCasinoDropdown(false) }}
                        className="w-full text-left px-3 py-2 text-sm text-content/70 hover:bg-contrast/10 cursor-pointer"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </label>

              {/* Result */}
              <div>
                <span className="text-xs text-content/60 block">{t('sim.result')}</span>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => setFormIsWin(true)}
                    data-testid="form-win-btn"
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                      formIsWin
                        ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                        : 'bg-contrast/5 border border-contrast/20 text-content/50'
                    }`}
                  >
                    {t('sim.winPlus')}
                  </button>
                  <button
                    onClick={() => setFormIsWin(false)}
                    data-testid="form-loss-btn"
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                      !formIsWin
                        ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                        : 'bg-contrast/5 border border-contrast/20 text-content/50'
                    }`}
                  >
                    {t('sim.loss')} -
                  </button>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content/40">$</span>
                    <input
                      type="number"
                      value={formAmount}
                      onChange={e => setFormAmount(e.target.value)}
                      placeholder="0"
                      min="0"
                      data-testid="form-amount"
                      className={`w-full pl-7 pr-3 py-2 rounded-lg bg-input-bg text-content text-sm focus:outline-none border ${
                        formIsWin
                          ? 'border-green-500/30 focus:border-green-500/60'
                          : 'border-red-500/30 focus:border-red-500/60'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Hours */}
              <label className="block">
                <span className="text-xs text-content/60">{t('sim.hoursPlayed')}</span>
                <input
                  type="number"
                  value={formHours}
                  onChange={e => setFormHours(e.target.value)}
                  min="0.5"
                  step="0.5"
                  data-testid="form-hours"
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-input-bg border border-contrast/20 text-content text-sm focus:outline-none focus:border-gold/60"
                />
              </label>

              {/* Notes */}
              <div className="sm:col-span-2">
                <span className="text-xs text-content/60 block">{t('sim.notes')}</span>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder={t('sim.notesPlaceholder')}
                  rows={2}
                  data-testid="form-notes"
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-input-bg border border-contrast/20 text-content text-sm focus:outline-none focus:border-gold/60 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={resetForm}
                data-testid="form-cancel"
                className="px-4 py-2 rounded-lg text-sm text-content/60 hover:text-content transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                data-testid="form-save"
                disabled={!formAmount || parseFloat(formAmount) < 0 || !formHours || parseFloat(formHours) <= 0}
                className="px-6 py-2 rounded-lg bg-gold text-on-gold font-semibold text-sm hover:bg-gold/90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {editingId ? t('simulator.saveChanges') : t('simulator.saveSession')}
              </button>
            </div>
          </div>
        )}

        {/* ── Session List ── */}
        {sortedSessions.length > 0 ? (
          <div className="space-y-2" data-testid="session-list">
            {sortedSessions.map(session => (
              <div key={session.id} className="bg-contrast/5 border border-contrast/10 rounded-xl p-3" data-testid={`session-${session.id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-xs text-content/50 shrink-0">{fmtDate(session.date)}</span>
                    <span className="text-sm text-content/70 truncate">{session.casino}</span>
                    <span className={`text-sm font-bold shrink-0 ${session.result >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {fmtDollar(session.result, true)}
                    </span>
                    <span className="text-xs text-content/40 shrink-0">{t('sim.hoursShort', { n: session.hoursPlayed })}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <button
                      onClick={() => openEditForm(session)}
                      data-testid={`edit-${session.id}`}
                      className="text-xs text-content/40 hover:text-gold transition-colors cursor-pointer"
                    >
                      {t('common.edit')}
                    </button>
                    {confirmDeleteId === session.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(session.id)}
                          data-testid={`confirm-delete-${session.id}`}
                          className="text-xs text-red-400 hover:text-red-300 cursor-pointer font-semibold"
                        >
                          {t('common.confirm')}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-content/40 hover:text-content cursor-pointer"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(session.id)}
                        data-testid={`delete-${session.id}`}
                        className="text-xs text-content/40 hover:text-red-400 transition-colors cursor-pointer"
                      >
                        {'\uD83D\uDDD1\uFE0F'}
                      </button>
                    )}
                  </div>
                </div>
                {session.notes && (
                  <p className="text-xs text-content/40 mt-1 truncate">{session.notes}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-content/30 text-sm py-8" data-testid="empty-sessions">
            {t('sim.emptySessions')}
          </div>
        )}
      </section>

      {/* ── Section D: Additional Stats ── */}
      {sessionCount > 0 && (
        <section data-testid="additional-stats">
          <h2 className="text-lg font-semibold text-content mb-3">{t('tracker.highlights')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Best Session */}
            <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4 text-center"
              style={{ boxShadow: bestSession ? profitGlow(bestSession.result) : 'none' }}>
              <p className="text-xs text-content/50 mb-1">{'\uD83C\uDFC6'} {t('tracker.bestSession')}</p>
              {bestSession && (
                <>
                  <p className="text-xl font-bold text-green-400" data-testid="best-session-result">
                    {fmtDollar(bestSession.result, true)}
                  </p>
                  <p className="text-xs text-content/50">{bestSession.casino}</p>
                  <p className="text-xs text-content/40">{fmtDate(bestSession.date)}</p>
                </>
              )}
            </div>

            {/* Worst Session */}
            <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4 text-center"
              style={{ boxShadow: worstSession ? profitGlow(worstSession.result) : 'none' }}>
              <p className="text-xs text-content/50 mb-1">{'\uD83D\uDE22'} {t('tracker.worstSession')}</p>
              {worstSession && (
                <>
                  <p className="text-xl font-bold text-red-400" data-testid="worst-session-result">
                    {fmtDollar(worstSession.result, true)}
                  </p>
                  <p className="text-xs text-content/50">{worstSession.casino}</p>
                  <p className="text-xs text-content/40">{fmtDate(worstSession.date)}</p>
                </>
              )}
            </div>

            {/* Streaks */}
            <div className="bg-contrast/5 border border-contrast/10 rounded-xl p-4 text-center">
              <p className="text-xs text-content/50 mb-1">{'\uD83D\uDD25'} {t('tracker.streaks')}</p>
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

// ── Personal Records Component ────────────────────────────────────

function PersonalRecordsSection() {
  const { t } = useTranslation()
  const records = useBankrollTrackerStore(s => s.getPersonalRecords)()
  const winRate = useBankrollTrackerStore(s => s.getWinRate)()
  const sessionCount = useBankrollTrackerStore(s => s.getSessionCount)()

  const cards: { testId: string; label: string; icon: string; value: string; sub?: string; glow?: string }[] = [
    {
      testId: 'best-session',
      label: t('tracker.bestSession'),
      icon: '\uD83E\uDD47',
      value: records.bestSession ? fmtDollar(records.bestSession.result, true) : '\u2014',
      sub: records.bestSession ? `${records.bestSession.casino} \u00B7 ${fmtDate(records.bestSession.date)}` : undefined,
      glow: records.bestSession && records.bestSession.result > 0
        ? '0 0 20px rgba(34, 197, 94, 0.25), 0 0 40px rgba(34, 197, 94, 0.08)' : undefined,
    },
    {
      testId: 'worst-session',
      label: t('tracker.worstSession'),
      icon: '\uD83D\uDE22',
      value: records.worstSession ? fmtDollar(records.worstSession.result, true) : '\u2014',
      sub: records.worstSession ? `${records.worstSession.casino} \u00B7 ${fmtDate(records.worstSession.date)}` : undefined,
      glow: records.worstSession && records.worstSession.result < 0
        ? '0 0 20px rgba(239, 68, 68, 0.2), 0 0 40px rgba(239, 68, 68, 0.05)' : undefined,
    },
    {
      testId: 'win-streak',
      label: t('tracker.winStreak'),
      icon: '\uD83D\uDD25',
      value: records.longestWinStreak > 0 ? t('sim.nSessions', { n: records.longestWinStreak }) : '\u2014',
    },
    {
      testId: 'longest-session',
      label: t('sim.longestSession'),
      icon: '\u23F1\uFE0F',
      value: records.longestSession ? `${records.longestSession.hoursPlayed.toFixed(1)}h` : '\u2014',
      sub: records.longestSession ? `${records.longestSession.casino} \u00B7 ${fmtDate(records.longestSession.date)}` : undefined,
    },
    {
      testId: 'peak-bankroll',
      label: t('tracker.peakBankroll'),
      icon: '\uD83D\uDCC8',
      value: records.highestBankroll > 0 ? fmtDollar(records.highestBankroll) : '\u2014',
    },
    {
      testId: 'best-$-hr',
      label: t('sim.bestPerHour'),
      icon: '\uD83D\uDCB0',
      value: records.bestHourlyRate
        ? `$${(records.bestHourlyRate.result / records.bestHourlyRate.hoursPlayed).toFixed(0)}/hr`
        : '\u2014',
      sub: records.bestHourlyRate ? fmtDate(records.bestHourlyRate.date) : undefined,
    },
    {
      testId: 'best-casino',
      label: t('sim.bestCasino'),
      icon: '\uD83C\uDFE6',
      value: records.mostProfitableCasino ?? '\u2014',
    },
    {
      testId: 'win-rate',
      label: t('tracker.winRate'),
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
            data-testid={`record-${card.testId}`}
            className="bg-contrast/5 border border-contrast/10 rounded-xl p-3 text-center transition-shadow"
            style={{ boxShadow: card.glow ?? 'none' }}
          >
            <p className="text-xs text-content/50 mb-1">
              {card.icon} {card.label}
            </p>
            <p className={`text-lg font-bold ${
              card.testId === 'best-session' && records.bestSession && records.bestSession.result > 0 ? 'text-green-400' :
              card.testId === 'worst-session' && records.worstSession && records.worstSession.result < 0 ? 'text-red-400' :
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
