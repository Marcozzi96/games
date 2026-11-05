import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { snake } from '@/games/snake/snake'
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
  const handle = snake.crea({ canvas, invia, comanda: (fn) => listeners.push(fn) })
  const ctx: CtxFinto = { canvas, invia, comanda: (fn) => listeners.push(fn), handle }
  return { ctx, comanda: (c) => listeners.forEach((fn) => fn(c as Comando)) }
}

describe('snake (Gioco)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Cibo deterministico in (11,21): fuori dalla colonna 9 percorsa dai test.
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('è registrato col contratto atteso', () => {
    expect(snake.id).toBe('snake')
    expect(snake.nome).toBe('Snake')
    expect(snake.icona).toBe('/icons/icon-snake.svg')
    expect(snake.comandi).toEqual(['su', 'giu', 'sx', 'dx'])
  })

  it('avvio pigro: niente tick prima della prima freccia', () => {
    const { ctx, comanda } = ctxFinto()
    vi.advanceTimersByTime(10_000)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
    comanda('su') // avvia: un passo, poi timer
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('dopo la prima freccia il loop corre: sbatte sul muro e invia.fine(0)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('su') // passo 1: testa in (9,11); il timer parte a 140 ms
    // 12 tick di intervallo portano la testa a (9,0) e poi fuori → fine
    vi.advanceTimersByTime(12 * 140)
    expect(ctx.invia.fine).toHaveBeenCalledTimes(1)
    expect(ctx.invia.fine).toHaveBeenCalledWith(0)
  })

  it('pausa: nessun tick finché non si riprende (Review Focus)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('su')
    vi.advanceTimersByTime(140 * 5) // testa in (9,6)
    ctx.handle.pausa()
    vi.advanceTimersByTime(60_000)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
    ctx.handle.riprendi()
    vi.advanceTimersByTime(140 * 10) // dal (9,6): 7 tick al muro
    expect(ctx.invia.fine).toHaveBeenCalledTimes(1)
  })

  it('smonta: nessun tick né comandi dopo il teardown (Review Focus)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('su')
    ctx.handle.smonta()
    vi.advanceTimersByTime(60_000)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
    comanda('giu') // listener smontato: no-op
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('reset: riparte in attesa, doppio reset sicuro (Review Focus)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('su')
    vi.advanceTimersByTime(12 * 140)
    expect(ctx.invia.fine).toHaveBeenCalledTimes(1)
    ctx.handle.reset()
    ctx.handle.reset() // doppio: deve restare un solo stato pulito
    vi.advanceTimersByTime(10_000) // ancora in attesa: nessun tick
    expect(ctx.invia.fine).toHaveBeenCalledTimes(1)
    comanda('su')
    vi.advanceTimersByTime(12 * 140) // di nuovo 12 tick al muro
    expect(ctx.invia.fine).toHaveBeenCalledTimes(2)
    expect(ctx.invia.fine).toHaveBeenLastCalledWith(0)
  })

  it('resize: il gioco non modifica canvas.width/height (Review Focus)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('su')
    vi.advanceTimersByTime(140) // un tick → un tentativo di disegno
    ctx.canvas.width = 300
    ctx.canvas.height = 400
    vi.advanceTimersByTime(140)
    expect(ctx.canvas.width).toBe(300)
    expect(ctx.canvas.height).toBe(400)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })
})
