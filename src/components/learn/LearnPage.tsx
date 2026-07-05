import { useState } from 'react'
import { ChevronDown, BookOpen, Sigma, Grid3x3, Coins, Zap, GraduationCap, Layers, Club } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Topic {
  id: string
  title: string
  body: React.ReactNode
}

interface Section {
  title: string
  icon: LucideIcon
  topics: Topic[]
}

/** Beginner-friendly theory, grouped by area. The jargon lives here — not in the drills. */
const SECTIONS: Section[] = [
  {
    title: 'The Basics',
    icon: Sigma,
    topics: [
      {
        id: 'what-is-counting',
        title: 'What is card counting?',
        body: (
          <>
            You keep a simple running tally as the cards come out. When lots of high cards are still
            to come, the odds tilt in your favour — so you bet more and adjust a few plays. It is a
            skill of attention and math, not cheating, and it is perfectly legal.
          </>
        ),
      },
      {
        id: 'hi-lo',
        title: 'The Hi-Lo count',
        body: (
          <>
            Every card gets a value: low cards <span className="text-gold font-medium">2–6 = +1</span>,
            middle cards <span className="text-gold font-medium">7–9 = 0</span>, high cards{' '}
            <span className="text-gold font-medium">10, J, Q, K, A = −1</span>. Add them up as cards
            appear — that total is your <span className="text-content font-medium">Running Count</span>.
            A high positive count means many high cards remain — good for you.
          </>
        ),
      },
      {
        id: 'true-count',
        title: 'Running Count vs True Count',
        body: (
          <>
            The Running Count alone isn’t enough — a +6 with six decks left is weak, but +6 with one
            deck left is strong. So you divide: <span className="text-gold font-medium">True Count =
            Running Count ÷ decks remaining</span>. The True Count is your real edge, and it’s what
            drives both your bet and your deviations.
          </>
        ),
      },
    ],
  },
  {
    title: 'Strategy',
    icon: Grid3x3,
    topics: [
      {
        id: 'basic-strategy',
        title: 'Basic Strategy',
        body: (
          <>
            The mathematically best play for every hand — hit, stand, double, split or surrender —
            assuming you are <span className="text-content font-medium">not</span> counting. Learn this
            first: it’s the foundation, and it already cuts the house edge to almost nothing. The{' '}
            <span className="text-content font-medium">Flashcards</span> mode drills it hand by hand.
          </>
        ),
      },
      {
        id: 'deviations',
        title: 'Deviations',
        body: (
          <>
            When the count runs high or low, a handful of plays change from Basic Strategy. Classic
            example: normally you <span className="text-content font-medium">Hit</span> a hard 16 vs a
            dealer 10 — but at a True Count of 0 or higher you{' '}
            <span className="text-content font-medium">Stand</span>. These count-based changes are where
            the extra edge comes from.
          </>
        ),
      },
      {
        id: 'i18-fab4',
        title: 'Illustrious 18 & Fab 4',
        body: (
          <>
            Of all the possible deviations, most of the value comes from a small set: the{' '}
            <span className="text-gold font-medium">Illustrious 18</span> (the 18 most valuable playing
            deviations) and the <span className="text-gold font-medium">Fab 4</span> (the 4 most valuable
            surrender deviations). You don’t need to memorise the names — the Flashcards “Deviations”
            level teaches them directly as situations.
          </>
        ),
      },
    ],
  },
  {
    title: 'Betting & the Shoe',
    icon: Coins,
    topics: [
      {
        id: 'bet-spread',
        title: 'Bet Spread',
        body: (
          <>
            You bet small when the count is low and big when it’s high — that gap is your{' '}
            <span className="text-content font-medium">bet spread</span>. Almost all of a counter’s
            profit comes from getting more money on the table when the odds favour you. A{' '}
            <span className="text-gold font-medium">1–16</span> spread is a common professional standard.
          </>
        ),
      },
      {
        id: 'deck-estimation',
        title: 'Deck Estimation',
        body: (
          <>
            To turn the Running Count into a True Count you must judge how many decks are left — by eye,
            from the thickness of the discard tray, just like at a real table. It sounds hard but becomes
            fast with practice. That’s exactly what the <span className="text-content font-medium">Deck
            Estimation</span> mode trains.
          </>
        ),
      },
    ],
  },
]

const MODE_GUIDE: { icon: LucideIcon; name: string; text: string }[] = [
  { icon: Zap, name: 'Speed Drill', text: 'Keep the Running Count as cards flash by — build raw speed.' },
  { icon: GraduationCap, name: 'Flashcards', text: 'Decide the correct play for every hand, plus count-based deviations.' },
  { icon: Coins, name: 'Bet Spread', text: 'Pick the right bet for the count at realistic tables.' },
  { icon: Layers, name: 'Deck Estimation', text: 'Judge the decks remaining from the discard tray.' },
  { icon: Club, name: 'Casino Session', text: 'Put it all together in a realistic multi-seat session.' },
]

/** Learn / theory page — explains card counting for beginners. */
export function LearnPage() {
  const [open, setOpen] = useState<Set<string>>(new Set(['what-is-counting']))

  const toggle = (id: string) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6" data-testid="learn-page">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="grid place-items-center w-14 h-14 mx-auto mb-4 rounded-2xl text-gold bg-gold/10 border border-gold/20">
            <BookOpen size={26} />
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gold-gradient">Learn</h1>
          <p className="mt-2 text-sm text-content/50">Everything you need to understand card counting — in plain language.</p>
        </div>

        {/* Concept sections */}
        <div className="space-y-8">
          {SECTIONS.map(section => (
            <section key={section.title}>
              <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-3">
                <section.icon size={14} className="text-gold" />
                {section.title}
              </h2>
              <div className="space-y-2">
                {section.topics.map(topic => {
                  const isOpen = open.has(topic.id)
                  return (
                    <div key={topic.id} className="surface overflow-hidden">
                      <button
                        onClick={() => toggle(topic.id)}
                        aria-expanded={isOpen}
                        data-testid={`topic-${topic.id}`}
                        className="w-full flex items-center justify-between gap-3 p-4 text-left cursor-pointer hover:bg-contrast/5 transition-colors"
                      >
                        <span className="font-semibold text-content">{topic.title}</span>
                        <ChevronDown
                          size={18}
                          className={`text-content/40 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 -mt-1 text-sm text-content/60 leading-relaxed">
                          {topic.body}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          {/* Mode guide */}
          <section>
            <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-content/40 uppercase mb-3">
              <BookOpen size={14} className="text-gold" />
              The Training Modes
            </h2>
            <div className="surface p-4 space-y-3">
              {MODE_GUIDE.map(m => (
                <div key={m.name} className="flex items-start gap-3">
                  <span className="grid place-items-center w-9 h-9 rounded-lg text-gold bg-gold/10 border border-gold/20 shrink-0">
                    <m.icon size={17} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-content">{m.name}</p>
                    <p className="text-xs text-content/55 leading-snug">{m.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="pb-10" />
      </div>
    </div>
  )
}
