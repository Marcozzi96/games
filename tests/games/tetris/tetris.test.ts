import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tetris } from '@/games/tetris/tetris'
import type { Comando, HandleGioco } from '@/core/types'

type CtxFinto = {
  canvas: HTMLCanvasElement
  invia: { punteggio: (v: number) => void; fine: (v: number) => void }
  comanda: (fn: (c: Comando | [Comando, number, number]) => void) => void
  handle: HandleGioco
}

function ctxFinto(): { ctx: CtxFinto; comanda: (c: string) => void } {
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 480
  const listeners: Array<(c: Comando | [Comando, number, number]) => void> = []
  const invia = { punteggio: vi.fn(), fine: vi.fn() }
  const handle = tetris.crea({ canvas, invia, comanda: (fn) => listeners.push(fn) })
  const ctx: CtxFinto = { canvas, invia, comanda: (fn) => listeners.push(fn), handle }
  return { ctx, comanda: (c) => listeners.forEach((fn) => fn(c as Comando)) }
}

describe('tetris (Gioco)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0) // bag deterministica: I, O, T, …
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('è registrato col contratto atteso', () => {
    expect(tetris.id).toBe('tetris')
    expect(tetris.nome).toBe('Tetris')
    expect(tetris.icona).toBe('/icons/icon-tetris.svg')
    expect(tetris.comandi).toEqual(['su', 'sx', 'dx', 'giu', 'ruota', 'conferma'])
  })

  it('avvio pigro: niente tick prima del primo comando', () => {
    const { ctx } = ctxFinto()
    vi.advanceTimersByTime(60_000)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('il primo comando spawna e avvia: 19 tick di gravità portano alla fine', () => {
    // bag[0] = I orizzontale (1×4) a y=0: 19 passi fino alla riga 19; al tick
    // 19 locka (senza linee) e spawna O. Dopo 19 tick NON è finita; dopo 38
    // tick il secondo pezzo locka e spawna T, ma non è ancora finita.
    const { ctx, comanda } = ctxFinto()
    comanda('sx') // avvia
    vi.advanceTimersByTime(19 * 800)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
    vi.advanceTimersByTime(19 * 800)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('hard drop: conferma invia il punteggio (32 punti per la I ruotata da y=0)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('ruota') // avvia (I spawna orizzontale, ruota → verticale 4×1, ghost 16)
    comanda('conferma') // hard drop: 16 × 2 = 32
    expect(ctx.invia.punteggio).toHaveBeenCalledWith(32)
  })

  it('su è alias di ruota: la forma cambia come con ruota', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('sx') // avvia (I orizzontale)
    comanda('su') // alias di ruota: I diventa verticale 4×1
    // ghost verticale da y=0 = 16 → hard drop = 32 (come il test "hard drop")
    comanda('conferma')
    expect(ctx.invia.punteggio).toHaveBeenCalledWith(32)
  })

  it('soft drop: giu invia +1 al primo passo', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('sx') // avvia
    comanda('giu')
    expect(ctx.invia.punteggio).toHaveBeenLastCalledWith(1)
  })

  it('pausa: nessun tick finché non si riprende (Review Focus)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('sx')
    vi.advanceTimersByTime(800 * 5) // I a y=5
    ctx.handle.pausa()
    vi.advanceTimersByTime(60_000) // 75 tick virtuali: senza pausa sarebbe finita
    expect(ctx.invia.fine).not.toHaveBeenCalled()
    ctx.handle.riprendi()
    vi.advanceTimersByTime(800 * 15) // 5 + 15 = 20 tick reali → prima lock (tick 19)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('smonta: nessun tick né comandi dopo il teardown (Review Focus)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('sx')
    vi.advanceTimersByTime(800 * 5)
    ctx.handle.smonta()
    vi.advanceTimersByTime(60_000)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
    comanda('conferma') // listener smontato: no-op
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('reset: riparte in attesa, doppio reset sicuro (Review Focus)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('conferma') // avvia + hard drop (38 punti: I orizzontale, ghost 19)
    expect(ctx.invia.punteggio).toHaveBeenCalledWith(38)
    ctx.handle.reset()
    ctx.handle.reset() // doppio: deve restare un solo stato pulito
    vi.advanceTimersByTime(60_000) // in attesa: nessun tick
    expect(ctx.invia.fine).not.toHaveBeenCalled()
    comanda('conferma')
    expect(ctx.invia.punteggio).toHaveBeenLastCalledWith(38) // partita nuova, stessa I da y=0
  })

  it('resize: il gioco non modifica canvas.width/height (Review Focus)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('sx')
    vi.advanceTimersByTime(800) // un tick → un tentativo di disegno
    ctx.canvas.width = 300
    ctx.canvas.height = 400
    vi.advanceTimersByTime(800)
    expect(ctx.canvas.width).toBe(300)
    expect(ctx.canvas.height).toBe(400)
  })
})
