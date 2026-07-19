import type { ReactNode } from 'react'
import { HandFigure, TeachingCard } from './TeachingVisuals'
import { c, R, S } from './teaching-cards'

/**
 * The foundation chapter: Blackjack itself, for someone who has never played.
 *
 * Deliberately linear and illustrated rather than an accordion. The rest of the
 * Learn page is a reference you dip into; this is a lesson you read once, in
 * order, and it has to stand on its own — every term the counting chapters use
 * later (hard, soft, upcard, bust, push, 3:2) is introduced here first.
 *
 * Every hand total in these figures is computed by the engine, so the lesson
 * cannot drift away from the rules the trainer actually enforces.
 */

/** One numbered lesson block: a heading, prose, and a figure beside it. */
function Block({ n, title, children, figure }: {
  n: number
  title: string
  children: ReactNode
  figure?: ReactNode
}) {
  return (
    <div className="surface rounded-2xl p-5 md:p-6">
      <div className="flex items-baseline gap-3">
        <span className="grid place-items-center w-6 h-6 shrink-0 rounded-lg text-[0.75rem] font-extrabold
          bg-gradient-to-br from-gold-bright to-gold text-casino-bg">
          {n}
        </span>
        <h3 className="text-base md:text-lg font-bold">{title}</h3>
      </div>
      <div className="mt-3 flex flex-col lg:flex-row lg:items-start gap-5">
        <div className="text-sm text-content/70 leading-relaxed space-y-3 lg:flex-1">{children}</div>
        {figure && <div className="lg:w-[280px] shrink-0">{figure}</div>}
      </div>
    </div>
  )
}

/** Emphasised term — the vocabulary the later chapters rely on. */
function T({ children }: { children: ReactNode }) {
  return <span className="text-content font-medium">{children}</span>
}

export function BlackjackBasics() {
  return (
    <div className="flex flex-col gap-3" data-testid="blackjack-basics">
      <Block
        n={1}
        title="The goal isn’t 21"
        figure={
          <div className="flex flex-col gap-3">
            <HandFigure cards={[c(R.King), c(R.Nine)]} label="You" size="sm" />
            <HandFigure cards={[c(R.Queen, S.Hearts), c(R.Seven, S.Diamonds)]} label="Dealer" size="sm" />
            <p className="text-xs text-content/50">19 beats 17. Neither hand is near 21.</p>
          </div>
        }
      >
        <p>
          You are playing against the <T>dealer</T>, not the other players. You win by finishing
          with a higher total than the dealer — without going over 21.
        </p>
        <p>
          Going over is called <T>busting</T>, and it means you lose immediately, even if the
          dealer busts afterwards. That single rule is where the casino’s advantage comes from.
        </p>
      </Block>

      <Block
        n={2}
        title="What the cards are worth"
        figure={
          <div className="flex flex-wrap gap-2 items-end">
            {[R.Two, R.Seven, R.Ten, R.Jack, R.Ace].map(rank => (
              <div key={rank} className="flex flex-col items-center gap-1.5">
                <TeachingCard card={c(rank)} size="sm" />
                <span className="text-[0.75rem] text-content/50 tabular-nums">
                  {rank === R.Ace ? '1 or 11' : rank === R.Jack || rank === R.Ten ? '10' : rank}
                </span>
              </div>
            ))}
          </div>
        }
      >
        <p>
          Number cards are worth their number. Jack, Queen and King are all worth <T>10</T> —
          which is why a deck is full of tens.
        </p>
        <p>
          The <T>Ace</T> is special: it counts as 11 unless that would bust you, in which case it
          counts as 1. You never have to choose; it always takes the value that helps you.
        </p>
      </Block>

      <Block
        n={3}
        title="Hard hands and soft hands"
        figure={
          <div className="flex flex-col gap-3">
            <HandFigure
              cards={[c(R.Ace, S.Hearts), c(R.Six)]}
              label="Soft"
              size="sm"
              note="The ace can still drop to 1, so another card can never bust this hand."
            />
            <HandFigure
              cards={[c(R.Ten), c(R.Seven, S.Diamonds)]}
              label="Hard"
              size="sm"
              note="Same total, no flexibility — any card above a 4 busts you."
            />
          </div>
        }
      >
        <p>
          A hand holding an ace that still counts as 11 is called <T>soft</T>. Any other hand is{' '}
          <T>hard</T>.
        </p>
        <p>
          This matters more than it sounds: a soft 17 and a hard 17 are the same number but call
          for completely different play, because a soft hand cannot bust with one more card.
        </p>
      </Block>

      <Block
        n={4}
        title="How a round runs"
        figure={
          <div className="flex flex-col gap-3">
            <HandFigure cards={[c(R.Nine, S.Hearts), c(R.Seven)]} label="You" size="sm" />
            <HandFigure
              cards={[c(R.Ten, S.Diamonds), c(R.Five)]}
              label="Dealer"
              size="sm"
              hideSecond
              note="You only ever see one dealer card — the upcard — while deciding."
            />
          </div>
        }
      >
        <p>
          You place a bet. Everyone gets two cards face up. The dealer takes two as well, but only
          one is visible — the <T>upcard</T>. The hidden one is the <T>hole card</T>.
        </p>
        <p>
          You act first, then the dealer plays. That order is the whole problem: if you bust, your
          money is gone before the dealer has to do anything.
        </p>
      </Block>

      <Block
        n={5}
        title="Your five choices"
        figure={
          <div className="flex flex-col gap-2 text-xs">
            {[
              ['Hit', 'Take another card.'],
              ['Stand', 'Keep what you have.'],
              ['Double', 'Double the bet, take exactly one card.'],
              ['Split', 'Two same cards → two hands, second bet.'],
              ['Surrender', 'Fold and keep half your bet.'],
            ].map(([name, what]) => (
              <div key={name} className="flex gap-2.5 items-baseline">
                <span className="text-gold font-semibold w-[72px] shrink-0">{name}</span>
                <span className="text-content/55">{what}</span>
              </div>
            ))}
          </div>
        }
      >
        <p>
          Every hand comes down to these five. <T>Double</T> and <T>Split</T> are the profitable
          ones — they get more money on the table in the spots that favour you, which is exactly
          what a counter is looking for.
        </p>
        <p>
          Which choice is correct is not a matter of feel. It is solved maths, and it is called{' '}
          <T>Basic Strategy</T>.
        </p>
      </Block>

      <Block
        n={6}
        title="The dealer has no choices"
        figure={
          <div className="flex flex-col gap-3">
            <HandFigure
              cards={[c(R.Nine, S.Hearts), c(R.Seven, S.Diamonds)]}
              label="Dealer must hit"
              size="sm"
              note="16 — the dealer draws again, whatever is on the table."
            />
            <HandFigure
              cards={[c(R.Ten), c(R.Seven)]}
              label="Dealer must stand"
              size="sm"
              note="17 or more — the dealer stops, even against your 20."
            />
          </div>
        }
      >
        <p>
          The dealer follows a fixed rule: draw until reaching 17, then stop. No judgement, no
          reacting to your hand.
        </p>
        <p>
          One variation matters — whether the dealer also draws on a <T>soft 17</T> (ace + six).
          That is the <T>H17</T> rule, and it is slightly worse for you than <T>S17</T>. The
          trainer lets you set both.
        </p>
      </Block>

      <Block
        n={7}
        title="What you get paid"
        figure={
          <div className="flex flex-col gap-3">
            <HandFigure cards={[c(R.Ace, S.Hearts), c(R.King)]} label="Blackjack" size="sm" />
            <div className="flex flex-col gap-1.5 text-xs">
              {[
                ['Win', 'You get your bet back, plus the same again (1:1).'],
                ['Blackjack', 'Ace + ten on the first two cards pays 3:2.'],
                ['Push', 'Same total as the dealer — bet returned, nothing lost.'],
              ].map(([k, v]) => (
                <div key={k}>
                  <span className="text-gold font-semibold">{k}</span>
                  <span className="text-content/55"> — {v}</span>
                </div>
              ))}
            </div>
          </div>
        }
      >
        <p>
          A <T>blackjack</T> is an ace plus a ten-value card on your first two cards. It pays more
          than a normal win — <T>3:2</T> — and it is the single biggest reason high cards are good
          for you.
        </p>
        <p>
          Watch for tables paying 6:5 instead. That one change costs more than a good counter
          earns, which is why this trainer defaults to 3:2.
        </p>
      </Block>

      <Block
        n={8}
        title="Why any of this can be beaten"
        figure={
          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5">
              {[R.Ace, R.King, R.Queen, R.Jack, R.Ten].map(rank => (
                <TeachingCard key={rank} card={c(rank)} size="sm" />
              ))}
            </div>
            <p className="text-xs text-content/50">
              A shoe rich in these pays you 3:2 more often — and busts the dealer more often too.
            </p>
          </div>
        }
      >
        <p>
          Cards are dealt without replacement. What has already gone is gone, so the shoe’s
          composition drifts as the round goes on — and sometimes it drifts in your favour.
        </p>
        <p>
          High cards help you: more blackjacks at 3:2, better doubles, and a dealer forced to draw
          into a stiff hand more often. Low cards help the dealer.
        </p>
        <p className="text-content/80">
          Counting is nothing more than keeping track of which way the shoe has drifted — and
          betting more when it favours you. That is the next chapter.
        </p>
      </Block>
    </div>
  )
}
