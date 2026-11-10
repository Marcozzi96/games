import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tetris } from '@/games/tetris/tetris'
import { beep } from '@/core/audio'
import type { Comando, HandleGioco } from '@/core/types'

// Mock dell'audio: la gettata/rotazione/hard drop emettono beep a frequenze
// distinte → li uso come osservabile dei gesti touch (la x del pezzo non è
// osservabile dall'esterno).
vi.mock('@/core/audio', () => ({
  beep: vi.fn(),
  inizia: vi.fn(),
  mute: vi.fn(() => false),
  setMute: vi.fn(),
}))

type CtxFinto = {
  canvas: HTMLCanvasElement
  invia: { punteggio: (v: number) => void; fine: (v: number) => void }
  comanda: (fn: (c: Comando | [Comando, number, number]) => void) => void
  handle: HandleGioco
}

function ctxFinto(): { ctx: CtxFinto; comanda: (c: Comando | [Comando, number, number]) => void } {
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 480
  const listeners: Array<(c: Comando | [Comando, number, number]) => void> = []
  const invia = { punteggio: vi.fn(), fine: vi.fn() }
  const handle = tetris.crea({ canvas, invia, comanda: (fn) => listeners.push(fn) })
  const ctx: CtxFinto = { canvas, invia, comanda: (fn) => listeners.push(fn), handle }
  return { ctx, comanda: (c) => listeners.forEach((fn) => fn(c)) }
}

describe('tetris (Gioco)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0) // bag deterministica: I, O, T, …
    beep.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('è registrato col contratto atteso (pad touch: niente pulsanti, drag+swipe+tap)', () => {
    expect(tetris.id).toBe('tetris')
    expect(tetris.nome).toBe('Tetris')
    expect(tetris.icona).toBe('/icons/icon-tetris.svg')
    expect(tetris.pad).toBe(false)
    expect(tetris.comandi).toEqual(['su', 'sx', 'dx', 'giu', 'ruota', 'conferma', 'punta', 'swipe-sx', 'swipe-dx', 'swipe-su', 'swipe-giu'])
  })

  it('swipe-giu: hard drop (38 per la I orizzontale da y=0), solo su flick veloce', () => {
    const { ctx, comanda } = ctxFinto()
    vi.setSystemTime(0)
    comanda(['punta', 0, 0])   // pointerdown
    comanda(['punta', 0, 120]) // giù 120px
    vi.setSystemTime(100)      // 1.2 px/ms → flick veloce
    comanda('swipe-giu')
    expect(ctx.invia.punteggio).toHaveBeenCalledWith(38)
  })

  it('swipe giù lento: NIENTE hard drop (il gesto non è un flick)', () => {
    const { ctx, comanda } = ctxFinto()
    vi.setSystemTime(0)
    comanda(['punta', 0, 0])
    comanda(['punta', 0, 120])
    vi.setSystemTime(600)      // 0.2 px/ms → lento
    comanda('swipe-giu')
    expect(ctx.invia.punteggio).not.toHaveBeenCalled()
  })

  it('flick orizzontale veloce → gettata (beep 200)', () => {
    const { comanda } = ctxFinto()
    vi.setSystemTime(0)
    comanda(['punta', 0, 0])
    comanda(['punta', 120, 0])
    vi.setSystemTime(100)      // 1.2 px/ms → flick
    comanda('swipe-dx')
    expect(beep).toHaveBeenCalledWith(200, 0.03)
  })

  it('drag orizzontale lento → nessuna gettata (il pezzo resta dove l\'hai messo)', () => {
    const { comanda } = ctxFinto()
    vi.setSystemTime(0)
    comanda(['punta', 0, 0])
    comanda(['punta', 120, 0])
    vi.setSystemTime(600)      // 0.2 px/ms → lento
    comanda('swipe-dx')
    expect(beep).not.toHaveBeenCalledWith(200, 0.03)
  })

  it('swipe su veloce e lungo → ruota (beep 330)', () => {
    const { comanda } = ctxFinto()
    vi.setSystemTime(0)
    comanda(['punta', 0, 100])
    comanda(['punta', 5, 20])  // su 80px, veloce
    vi.setSystemTime(100)
    comanda('swipe-su')
    expect(beep).toHaveBeenCalledWith(330, 0.04)
  })

  it('punta (drag) + flick veloce: gettata e il gioco resta giocabile', () => {
    const { ctx, comanda } = ctxFinto()
    vi.setSystemTime(0)
    comanda(['punta', 0, 0])    // avvia + ancora
    comanda(['punta', 72, 0])   // +72px → 3 celle dx: la I (4-wide) arriva al muro
    vi.setSystemTime(100)       // flick veloce
    comanda('swipe-dx')         // rilascio → gettata (no-op: già al muro)
    comanda(['punta', 72, 0])   // nuovo gesto
    comanda(['punta', 72, 120]) // giù
    vi.setSystemTime(200)
    comanda('swipe-giu')        // hard drop ancora funziona: 38
    expect(ctx.invia.punteggio).toHaveBeenLastCalledWith(38)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('swipe orizzontale senza gesto: nessun getto e nessun errore', () => {
    const { comanda } = ctxFinto()
    comanda('sx')          // avvia (senza punta → nessun gesto tracciato)
    comanda('swipe-dx')    // swipe senza drag: niente direzione/velocità → no-op
    comanda('swipe-sx')    // idem
    comanda('conferma')    // hard drop da tastiera: 38
    expect(beep).not.toHaveBeenCalledWith(200, 0.03)
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

  it('reset durante un gesto: lo swipe dopo non usa la velocità fantasma (Review Focus)', () => {
    const { ctx, comanda } = ctxFinto()
    vi.setSystemTime(0)
    comanda(['punta', 0, 0])      // avvia + gesto in corso (t0=0)
    vi.setSystemTime(50)
    comanda(['punta', 120, 0])    // glx=120
    ctx.handle.reset()            // azzera anche il gesto in corso
    vi.setSystemTime(100)
    comanda('swipe-dx')           // senza nuovo punta: 'nessuno' (niente gettata)
    expect(beep).not.toHaveBeenCalledWith(200, 0.03)
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
