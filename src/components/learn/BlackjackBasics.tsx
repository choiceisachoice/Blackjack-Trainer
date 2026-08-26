import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
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
          bg-gradient-to-br from-gold-bright to-gold text-on-gold">
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

/**
 * Emphasised term — the vocabulary the later chapters rely on.
 *
 * `children` is optional because `Trans` passes this in as a bare `<T />` and
 * fills the children from the translation itself.
 */
function T({ children }: { children?: ReactNode }) {
  return <span className="text-content font-medium">{children}</span>
}

/**
 * One paragraph of the lesson, assembled from a message.
 *
 * The emphasised terms sit inside the sentence, and which word carries the
 * term differs by language — "busting" is a verb in English and a noun in
 * German. So the `<c>` tag travels with the translation rather than the
 * sentence being glued together around a fixed `<T>`.
 */
function P({ k }: { k: string }) {
  return <p><Trans i18nKey={k} components={{ c: <T /> }} /></p>
}

export function BlackjackBasics() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3" data-testid="blackjack-basics">
      <Block
        n={1}
        title={t('basics.b1.title')}
        figure={
          <div className="flex flex-col gap-3">
            <HandFigure cards={[c(R.King), c(R.Nine)]} label={t('basics.you')} size="sm" />
            <HandFigure cards={[c(R.Queen, S.Hearts), c(R.Seven, S.Diamonds)]} label={t('basics.dealer')} size="sm" />
            <p className="text-xs text-content/50">{t('basics.b1.fig')}</p>
          </div>
        }
      >
        <P k="basics.b1.p1" />
        <P k="basics.b1.p2" />
      </Block>

      <Block
        n={2}
        title={t('basics.b2.title')}
        figure={
          <div className="flex flex-wrap gap-2 items-end">
            {[R.Two, R.Seven, R.Ten, R.Jack, R.Ace].map(rank => (
              <div key={rank} className="flex flex-col items-center gap-1.5">
                <TeachingCard card={c(rank)} size="sm" />
                <span className="text-[0.75rem] text-content/50 tabular-nums">
                  {rank === R.Ace ? t('basics.b2.aceValue') : rank === R.Jack || rank === R.Ten ? '10' : rank}
                </span>
              </div>
            ))}
          </div>
        }
      >
        <P k="basics.b2.p1" />
        <P k="basics.b2.p2" />
      </Block>

      <Block
        n={3}
        title={t('basics.b3.title')}
        figure={
          <div className="flex flex-col gap-3">
            <HandFigure
              cards={[c(R.Ace, S.Hearts), c(R.Six)]}
              label={t('basics.b3.soft')}
              size="sm"
              note={t('basics.b3.softNote')}
            />
            <HandFigure
              cards={[c(R.Ten), c(R.Seven, S.Diamonds)]}
              label={t('basics.b3.hard')}
              size="sm"
              note={t('basics.b3.hardNote')}
            />
          </div>
        }
      >
        <P k="basics.b3.p1" />
        <P k="basics.b3.p2" />
      </Block>

      <Block
        n={4}
        title={t('basics.b4.title')}
        figure={
          <div className="flex flex-col gap-3">
            <HandFigure cards={[c(R.Nine, S.Hearts), c(R.Seven)]} label={t('basics.you')} size="sm" />
            <HandFigure
              cards={[c(R.Ten, S.Diamonds), c(R.Five)]}
              label={t('basics.dealer')}
              size="sm"
              hideSecond
              note={t('basics.b4.fig')}
            />
          </div>
        }
      >
        <P k="basics.b4.p1" />
        <P k="basics.b4.p2" />
      </Block>

      <Block
        n={5}
        title={t('basics.b5.title')}
        figure={
          <div className="flex flex-col gap-2 text-xs">
            {[
              ['actions.hit', 'basics.b5.hit'],
              ['actions.stand', 'basics.b5.stand'],
              ['actions.double', 'basics.b5.double'],
              ['actions.split', 'basics.b5.split'],
              ['actions.surrender', 'basics.b5.surrender'],
            ].map(([nameKey, whatKey]) => (
              <div key={nameKey} className="flex gap-2.5 items-baseline">
                <span className="text-gold font-semibold w-[72px] shrink-0">{t(nameKey)}</span>
                <span className="text-content/55">{t(whatKey)}</span>
              </div>
            ))}
          </div>
        }
      >
        <P k="basics.b5.p1" />
        <P k="basics.b5.p2" />
      </Block>

      <Block
        n={6}
        title={t('basics.b6.title')}
        figure={
          <div className="flex flex-col gap-3">
            <HandFigure
              cards={[c(R.Nine, S.Hearts), c(R.Seven, S.Diamonds)]}
              label={t('basics.b6.mustHit')}
              size="sm"
              note={t('basics.b6.hitNote')}
            />
            <HandFigure
              cards={[c(R.Ten), c(R.Seven)]}
              label={t('basics.b6.mustStand')}
              size="sm"
              note={t('basics.b6.standNote')}
            />
          </div>
        }
      >
        <P k="basics.b6.p1" />
        <P k="basics.b6.p2" />
      </Block>

      <Block
        n={7}
        title={t('basics.b7.title')}
        figure={
          <div className="flex flex-col gap-3">
            <HandFigure cards={[c(R.Ace, S.Hearts), c(R.King)]} label={t('basics.b7.blackjack')} size="sm" />
            <div className="flex flex-col gap-1.5 text-xs">
              {[
                ['basics.b7.win', 'basics.b7.winText'],
                ['basics.b7.blackjack', 'basics.b7.bjText'],
                ['basics.b7.push', 'basics.b7.pushText'],
              ].map(([nameKey, textKey]) => (
                <div key={nameKey}>
                  <span className="text-gold font-semibold">{t(nameKey)}</span>
                  <span className="text-content/55"> — {t(textKey)}</span>
                </div>
              ))}
            </div>
          </div>
        }
      >
        <P k="basics.b7.p1" />
        <P k="basics.b7.p2" />
      </Block>

      <Block
        n={8}
        title={t('basics.b8.title')}
        figure={
          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5">
              {[R.Ace, R.King, R.Queen, R.Jack, R.Ten].map(rank => (
                <TeachingCard key={rank} card={c(rank)} size="sm" />
              ))}
            </div>
            <p className="text-xs text-content/50">
              {t('basics.b8.fig')}
            </p>
          </div>
        }
      >
        <P k="basics.b8.p1" />
        <P k="basics.b8.p2" />
        <p className="text-content/80">
          <Trans i18nKey="basics.b8.p3" components={{ c: <T /> }} />
        </p>
      </Block>
    </div>
  )
}
