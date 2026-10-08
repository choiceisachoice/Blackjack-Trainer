import type { BotTurnHandView, BotTurnStep } from '../../engine/casino-session/types'

/** What a bot's badge says during a split. */
export type ReplayStatus = 'split' | 'thinking' | 'hit' | 'double' | 'stand' | 'bust' | 'twentyone'

/** One frame of the table during a bot's split, held for `delayMs`. */
export interface ReplayFrame {
  /** The hands on the table from this frame on; unchanged when absent. */
  hands?: BotTurnHandView[]
  /** The hand in play (ring, others dimmed); unchanged when absent. */
  active?: number
  status?: ReplayStatus
  sound?: 'chip' | 'card' | 'click'
  delayMs: number
}

/**
 * Turns a bot's logged turn into the frames the table plays, in the order the
 * dealer dealt them.
 *
 * The replay used to be rebuilt from the bot's *final* hands, which cannot say
 * when a re-split happened, so every split hand was put on the table at once:
 * 8,8 became three hands in one frame, before the 8 that made the third had
 * been dealt. Replaying the log shows the table exactly as it was after each
 * step — a hand appears on the split that created it and not before.
 *
 * Timings are the ones the unsplit play uses, so a split reads at the same pace.
 *
 * @param log - The bot's turn, as written by `playBotTurn`
 * @param think - Milliseconds of "thinking" before a decision (randomised by the caller)
 * @returns The frames, without the final "bot is done" frame the caller adds
 */
export function buildSplitReplay(log: BotTurnStep[], think: () => number): ReplayFrame[] {
  const frames: ReplayFrame[] = []
  let active = -1

  // Move the ring to `hand`, with a short pause after the hand just finished.
  const focus = (hand: number) => {
    if (active === hand) return
    if (active >= 0) frames.push({ delayMs: 800 })
    frames.push({ active: hand, delayMs: 500 })
    active = hand
  }

  for (const step of log) {
    switch (step.kind) {
      case 'start':
        break
      case 'split':
        frames.push({ status: 'split', sound: 'chip', delayMs: 1500 })
        // The pair slides apart: the hand being split keeps the ring.
        frames.push({ hands: step.hands, active: step.hand, delayMs: 1000 })
        active = step.hand
        break
      case 'card':
        focus(step.hand)
        frames.push({ hands: step.hands, sound: 'card', delayMs: 800 })
        break
      case 'hit':
        focus(step.hand)
        frames.push({ status: 'thinking', delayMs: think() })
        frames.push({ status: 'hit', delayMs: 500 })
        frames.push({ hands: step.hands, sound: 'card', delayMs: 800 })
        break
      case 'double':
        focus(step.hand)
        frames.push({ status: 'thinking', delayMs: think() })
        frames.push({ status: 'double', sound: 'chip', delayMs: 700 })
        frames.push({ hands: step.hands, sound: 'card', delayMs: 800 })
        break
      case 'stand':
        focus(step.hand)
        if (step.auto) {
          frames.push({ status: 'stand', sound: 'click', delayMs: 600 })
        } else {
          frames.push({ status: 'thinking', delayMs: think() })
          frames.push({ status: 'stand', sound: 'click', delayMs: 700 })
        }
        break
      case 'bust':
        frames.push({ status: 'bust', delayMs: 1000 })
        break
      case 'twentyone':
        frames.push({ status: 'twentyone', delayMs: 600 })
        break
    }
  }
  return frames
}
