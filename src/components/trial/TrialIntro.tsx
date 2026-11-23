import { useTranslation } from 'react-i18next'
import { Button } from '../common/ui'
import { CasinoTable } from '../casino-session/CasinoTable'
import { formatDollar } from '../casino-session/helpers'
import { GUEST_TABLE_BANKROLL, GUEST_TABLE_BET, guestTableConfig } from '../casino-session/trial-table'
import { GUEST_ROUND_HANDS } from '../../services/guest-trial'
import { TrialStage } from './TrialStage'
import { PRERENDER_FIT } from './stage-layout'

interface TrialIntroProps {
  /** Deal the first hand. */
  onStart: () => void
  /** The round is on its way (its code is still loading): the button waits. */
  busy?: boolean
}

const TABLE = guestTableConfig()
const SEATS = [{ type: 'human' as const, seatIndex: TABLE.playerSeatIndex }]
const NO_HANDS = [[]]
const NOTHING = new Set<number>()

/**
 * The guest table before the first hand: the felt, empty — the dealer's
 * place, the shoe, the printed rules, the visitor's own circle — and one
 * button under it.
 *
 * Its own small module, apart from the round, on purpose. It is what the
 * prerendered pages show (`/try`, and the landing's play section), so it has
 * to render without the game — which the landing only fetches once a visitor
 * is about to play. It is drawn with the casino table itself (`CasinoTable`,
 * already in the landing's chunk for the feature tiles) in the frame the
 * round uses (`TrialStage`), so the first hand is dealt onto this very felt:
 * when the round's code takes over, nothing on screen moves.
 *
 * Everything a crawler needs is text here: the button, the line under it,
 * the dealer's label and the rules printed on the felt.
 */
export function TrialIntro({ onStart, busy = false }: TrialIntroProps) {
  const { t } = useTranslation()
  return (
    <TrialStage
      status={t('try.table.hand', { n: 1, total: GUEST_ROUND_HANDS })}
      felt={<EmptyTable />}
      controls={(
        <div className="flex flex-col items-center gap-2 text-center" data-testid="try-intro">
          <Button size="lg" className="w-full max-w-xs" onClick={onStart} aria-busy={busy || undefined} data-testid="try-start">
            {t('try.start')}
          </Button>
          <p className="text-xs text-content/55 max-w-[40ch]">{t('try.table.introNote', { bet: formatDollar(GUEST_TABLE_BET) })}</p>
        </div>
      )}
    />
  )
}

/** The table with nobody's cards on it yet: a full shoe, an empty tray, the visitor's seat. */
function EmptyTable() {
  const total = TABLE.numDecks * 52
  return (
    <CasinoTable
      initialFit={PRERENDER_FIT}
      dealerPrompt={null}
      dealerCards={[]}
      dealerHoleRevealed={false}
      gameStep="betting"
      isDealPhase={false}
      seatLayout={SEATS}
      humanHands={NO_HANDS}
      humanVisibleCards={999}
      activeHandIndex={0}
      currentBet={0}
      handDoubled={NOTHING}
      isSurrendered={false}
      humanSettlement={null}
      activeBotId={null}
      botStatuses={{}}
      botResults={[]}
      botVisibleCards={{}}
      botActiveSplitHands={{}}
      botSplitHands={{}}
      bankroll={GUEST_TABLE_BANKROLL}
      cardsRemaining={total}
      cardsDealt={0}
      discardCount={0}
      totalCards={total}
      penetration={TABLE.penetration}
      blackjackPays={TABLE.blackjackPays}
      dealerHitsSoft17={TABLE.dealerHitsSoft17}
    />
  )
}
