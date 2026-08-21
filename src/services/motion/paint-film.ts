import { cardAt, faceOf, filmState, CARD_COUNT, HERO_INDEX, STAGE_W as W, STAGE_H as H } from './deck-film'

/**
 * Painting one frame of "Bloom".
 *
 * Kept out of the React file so a test can record the exact sequence of drawing
 * calls for a given moment — that recording is the real guarantee behind "the
 * piece is seekable": not that the numbers match, but that the *pixels* would.
 *
 * ## The palette, and why the first two attempts looked monotone
 *
 * They drew card **backs**: dark rectangles on a dark ground. No amount of
 * lighting rescues that, because there is nothing in the frame but one value.
 * A deck's colour is on the front — warm white stock, deep red, near-black —
 * and on green felt that is naturally rich without being loud. Gold is left to
 * do one job only: light.
 */

export const FELT = '#0d4633'
export const FELT_DEEP = '#04150f'
export const GOLD = '#d4a847'
export const GOLD_LIT = '#ffeec2'
const STOCK = '250,248,243'
const RED = '181,49,45'
const BLACK = '26,28,34'

/** Base card size in stage pixels; the model scales from here. */
const CARD_W = 74
const CARD_H = 104

function cardPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.beginPath()
  ctx.roundRect(-w / 2, -h / 2, w, h, Math.max(2.5, w * 0.075))
}

/**
 * A card face: white stock, a corner index at both ends, and a centre pip.
 *
 * Two indices rather than one because the rosette turns cards through a full
 * circle — with a single corner, half the ring reads upside down.
 */
function paintFace(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, alpha: number,
  rank: string, suit: string, red: boolean, sheen: number,
) {
  const stock = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2)
  stock.addColorStop(0, `rgba(255,254,250,${alpha})`)
  stock.addColorStop(0.55, `rgba(${STOCK},${alpha})`)
  stock.addColorStop(1, `rgba(226,221,210,${alpha})`)

  cardPath(ctx, w, h)
  ctx.fillStyle = stock
  ctx.fill()

  // Canvas applies the shadow to *every* subsequent draw, so the caller's
  // shadow was being re-rendered for the border, both indices, both suit
  // glyphs and the pip — eight expensive blurs per card, 52 cards a frame.
  // The body has its shadow now; nothing after it needs one.
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  ctx.lineWidth = Math.max(0.5, w * 0.012)
  ctx.strokeStyle = `rgba(90,78,54,${alpha * 0.35})`
  ctx.stroke()

  const ink = red ? RED : BLACK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Centre pip
  ctx.fillStyle = `rgba(${ink},${alpha * 0.92})`
  ctx.font = `600 ${h * 0.4}px "Instrument Sans", system-ui, sans-serif`
  ctx.fillText(suit, 0, h * 0.02)

  // Index at both ends
  ctx.font = `700 ${h * 0.155}px "Instrument Sans", system-ui, sans-serif`
  for (const flip of [0, Math.PI]) {
    ctx.save()
    ctx.rotate(flip)
    ctx.fillText(rank, -w / 2 + w * 0.15, -h / 2 + h * 0.115)
    ctx.font = `600 ${h * 0.115}px "Instrument Sans", system-ui, sans-serif`
    ctx.fillText(suit, -w / 2 + w * 0.15, -h / 2 + h * 0.225)
    ctx.font = `700 ${h * 0.155}px "Instrument Sans", system-ui, sans-serif`
    ctx.restore()
  }

  // A specular sweep while the card is in motion — what makes stock read as
  // stock rather than as a white rectangle.
  if (sheen > 0.02) {
    const gl = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2)
    gl.addColorStop(0, `rgba(255,255,255,0)`)
    gl.addColorStop(0.45, `rgba(255,248,225,${alpha * sheen * 0.5})`)
    gl.addColorStop(0.75, `rgba(255,255,255,0)`)
    cardPath(ctx, w, h)
    ctx.fillStyle = gl
    ctx.fill()
  }
}

/** One frozen frame. Same `t` in, same pixels out. */
export function paintFilm(ctx: CanvasRenderingContext2D, t: number) {
  const s = filmState(t)

  ctx.clearRect(0, 0, W, H)

  // ── The table ───────────────────────────────────────────────────────────
  ctx.fillStyle = FELT_DEEP
  ctx.fillRect(0, 0, W, H)

  const cloth = ctx.createRadialGradient(W * 0.5, H * 0.46, 40, W * 0.5, H * 0.5, 780)
  cloth.addColorStop(0, `rgba(28,110,80,${0.95 * s.table})`)
  cloth.addColorStop(0.42, `rgba(17,78,57,${0.9 * s.table})`)
  cloth.addColorStop(1, `rgba(4,24,17,${0.95 * s.table})`)
  ctx.fillStyle = cloth
  ctx.fillRect(0, 0, W, H)

  // The overhead lamp — one light source, tightening onto the last card.
  const lampR = 520 - s.lift * 190
  const lamp = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.44, lampR)
  lamp.addColorStop(0, `rgba(255,236,190,${(0.16 + s.lift * 0.16) * s.table})`)
  lamp.addColorStop(0.6, `rgba(255,226,160,${0.04 * s.table})`)
  lamp.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = lamp
  ctx.fillRect(0, 0, W, H)

  // No guide ring. There was one, drawn from the top clockwise while the cards
  // bloom the other way — the two arcs disagreed and the mismatch read as a
  // rendering fault. The cards describe the circle perfectly well themselves,
  // and a decoration that has to be explained is not decoration.

  // ── Cards ───────────────────────────────────────────────────────────────
  // Painter's order: whatever is lowest in the frame sits in front, so the
  // rosette overlaps the way a real spread on a table does.
  const drawable: { i: number; y: number }[] = []
  for (let i = 0; i < CARD_COUNT; i++) {
    const c = cardAt(i, t)
    if (c && c.alpha > 0.015) drawable.push({ i, y: c.y })
  }
  drawable.sort((a, b) => a.y - b.y)

  for (const { i } of drawable) {
    if (i === HERO_INDEX) continue
    const c = cardAt(i, t)!
    const f = faceOf(i)
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(c.rot)
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 22 * c.scale
    ctx.shadowOffsetY = 10 * c.scale
    paintFace(ctx, CARD_W * c.scale, CARD_H * c.scale, c.alpha, f.rank, f.suit, f.red, c.sheen)
    ctx.restore()
  }

  // The hero is always in front — it opens the piece and closes it.
  const hc = cardAt(HERO_INDEX, t)
  if (hc && hc.alpha > 0.015) {
    const f = faceOf(HERO_INDEX)
    ctx.save()
    ctx.translate(hc.x, hc.y)
    ctx.rotate(hc.rot)
    ctx.shadowColor = s.lift > 0.1 ? `rgba(212,168,71,${0.5 * s.lift})` : 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = 26 + s.lift * 60
    ctx.shadowOffsetY = 12 * (1 - s.lift)
    paintFace(ctx, CARD_W * hc.scale, CARD_H * hc.scale, hc.alpha, f.rank, f.suit, f.red, hc.sheen)
    ctx.restore()
  }

  // Vignette — enough to close the edges, not enough to be a lid.
  const vig = ctx.createRadialGradient(W * 0.5, H * 0.46, H * 0.44, W * 0.5, H * 0.5, H * 1.2)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,0.68)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, W, H)
}
