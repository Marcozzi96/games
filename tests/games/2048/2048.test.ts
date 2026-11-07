import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { gioco2048, DURATA_TRANSIZIONE, DURATA_POP } from '@/games/2048/2048'
import type { CtxGioco } from '@/core/types'

// Stato iniziale iniettabile per il test vittoria (2048 non è raggiungibile in 2 mosse).
const statoIniziale = vi.hoisted<{ griglia: number[][] | null }>(() => ({ griglia: null }))

vi.mock('@/games/2048/logica', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/games/2048/logica')>()
  return {
    ...actual,
    creaStato: (rng?: () => number) =>
      statoIniziale.griglia
        ? { griglia: statoIniziale.griglia.map((r) => [...r]), punti: 0, finita: false, giàVinto: false }
        : actual.creaStato(rng),
  }
})

type Raf = () => void

function ctxFinto() {
  const canvas: HTMLCanvasElement = {
    clientWidth: 360,
    clientHeight: 480,
    width: 360,
    height: 480,
    getContext: () => null,
  } as unknown as HTMLCanvasElement
  const invia = {
    punteggio: vi.fn(),
    fine: vi.fn(),
    record: vi.fn(),
    pausa: vi.fn(),
    riprendi: vi.fn(),
    reset: vi.fn(),
    vittoria: vi.fn(),
  }
  const listeners = new Map<string, (c: string) => void>()
  const ctx = {
    canvas,
    comanda: (nome: string, cb: (c: string) => void) => {
      listeners.set(nome, cb)
    },
    invia,
  } as unknown as CtxGioco
  const handle = gioco2048.crea(ctx)
  return {
    ctx,
    handle,
    comanda: (c: string) => {
      listeners.get(c)?.(c)
    },
  }
}

describe('gioco 2048', () => {
  let rAF: Raf[]
  let rAFnow: { t: number }
  let cancelAnimationFrame: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    rAF = []
    rAFnow = { t: 0 }
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: Raf) => {
      rAF.push(cb)
      return rAF.length
    }))
    // Il cancel deve rimuovere il callback dalla coda (altrimenti rAF.length non torna a 0).
    cancelAnimationFrame = vi.fn((id: number) => {
      if (id >= 1 && id <= rAF.length) rAF.splice(id - 1, 1)
    })
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const scorriRaf = (): void => {
    const pending = [...rAF]
    rAF.length = 0
    pending.forEach((cb) => cb(rAFnow.t))
  }

  it('contratto: id, nome, icona, comandi, pad: false', () => {
    expect(gioco2048.id).toBe('2048')
    expect(gioco2048.nome).toBe('2048')
    expect(gioco2048.icona).toContain('<svg')
    expect(gioco2048.comandi).toEqual([
      'su', 'giu', 'sx', 'dx',
      'swipe-sx', 'swipe-dx', 'swipe-su', 'swipe-giu',
    ])
    expect(gioco2048.pad).toBe(false)
  })

  it('avvio: invia.punteggio(0) e nessun frame rAF prima di una mossa', () => {
    const { ctx } = ctxFinto()
    expect(ctx.invia.punteggio).toHaveBeenCalledTimes(1)
    expect(ctx.invia.punteggio).toHaveBeenLastCalledWith(0)
    expect(rAF.length).toBe(0)
  })

  it('mossa valida: invia.punteggio con il nuovo totale e la transizione corre fino alla fine', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('sx')
    expect(ctx.invia.punteggio).toHaveBeenCalledTimes(2)
    expect(ctx.invia.punteggio).toHaveBeenLastCalledWith(8)
    expect(rAF.length).toBeGreaterThan(0) // animazione in corso
    scorriRaf()
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('mossa senza cambio: nessun invio nuovo di punteggio', () => {
    const { ctx, comanda } = ctxFinto()
    const prima = ctx.invia.punteggio.mock.calls.length
    comanda('giu')
    expect(ctx.invia.punteggio).toHaveBeenCalledTimes(prima)
  })

  it('mossa durante la transizione: ignorata (input bloccato)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('sx')
    comanda('giu') // transizione in corso: ignorata
    expect(ctx.invia.punteggio).toHaveBeenCalledTimes(2) // solo la prima mossa conta
  })

  it('swipe e tasto fanno la stessa mossa', () => {
    const a = ctxFinto()
    a.comanda('swipe-sx')
    scorriRaf()
    const puntiA = a.ctx.invia.punteggio.mock.calls.at(-1)?.[0]
    const b = ctxFinto()
    b.comanda('sx')
    scorriRaf()
    const puntiB = b.ctx.invia.punteggio.mock.calls.at(-1)?.[0]
    expect(puntiA).toBe(puntiB)
  })

  it('game over: invia.fine(punti) una volta; comandi dopo la fine sono no-op', () => {
    const { ctx, comanda } = ctxFinto()
    vi.spyOn(Math, 'random').mockReturnValue(0.9) // spawn: sempre 4
    comanda('sx')
    scorriRaf()
    for (let i = 0; i < 200 && !ctx.invia.fine.mock.calls.length; i++) {
      comanda(['sx', 'dx', 'su', 'giu'][i % 4])
      // La transizione dura ~120ms: avanzare il tempo, altrimenti le mosse restano bloccate.
      vi.advanceTimersByTime(DURATA_TRANSIZIONE + DURATA_POP)
      scorriRaf()
    }
    expect(ctx.invia.fine).toHaveBeenCalledTimes(1)
    const punti = ctx.invia.punteggio.mock.calls.at(-1)?.[0] ?? -1
    expect(ctx.invia.fine).toHaveBeenCalledWith(punti)
    comanda('sx')
    const n = ctx.invia.punteggio.mock.calls.length
    comanda('giu')
    expect(ctx.invia.punteggio).toHaveBeenCalledTimes(n) // no-op: nessun punteggio nuovo
  })

  it('vittoria: crea 2048 → invia.vittoria() una volta, il gioco continua', () => {
    statoIniziale.griglia = [
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]
    const { ctx, comanda } = ctxFinto()
    statoIniziale.griglia = null
    comanda('sx')
    expect(ctx.invia.vittoria).toHaveBeenCalledTimes(1)
    expect(ctx.invia.punteggio).toHaveBeenLastCalledWith(2048)
    scorriRaf()
    // Il gioco continua: una mossa dopo la vittoria invia punteggio normalmente
    comanda('giu')
    expect(ctx.invia.punteggio).toHaveBeenCalled()
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('pausa durante la transizione: cancelAnimationFrame chiamato', () => {
    const { ctx, comanda, handle } = ctxFinto()
    comanda('sx')
    expect(rAF.length).toBeGreaterThan(0)
    handle.pausa()
    expect(cancelAnimationFrame).toHaveBeenCalled()
    expect(rAF.length).toBe(0)
    handle.riprendi()
    scorriRaf()
    expect(rAF.length).toBe(0)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('smonta: cancelAnimationFrame e comandi ignorati', () => {
    const { ctx, comanda, handle } = ctxFinto()
    comanda('sx')
    handle.smonta()
    expect(rAF.length).toBe(0)
    comanda('giu')
    expect(ctx.invia.punteggio).toHaveBeenCalledTimes(2) // nessun nuovo invio
  })

  it('reset: nuova partita, invia.reset() e invia.punteggio(0)', () => {
    const { ctx, comanda, handle } = ctxFinto()
    comanda('sx')
    scorriRaf()
    handle.reset()
    expect(ctx.invia.reset).toHaveBeenCalledTimes(1)
    handle.reset() // idempotente: nessun errore
    expect(ctx.invia.punteggio).toHaveBeenLastCalledWith(0)
    const n = ctx.invia.punteggio.mock.calls.length
    comanda('sx')
    expect(ctx.invia.punteggio).toHaveBeenCalledTimes(n + 1)
  })

  it('resize: la prossima transizione usa il nuovo canvas', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('sx')
    ctx.canvas.width = 320
    ctx.canvas.height = 420
    scorriRaf()
    expect(ctx.canvas.width).toBe(320)
  })

  it('transizioni intere: dopo DURATA_TRANSIZIONE + DURATA_POP la coda rAF è vuota', () => {
    const { comanda } = ctxFinto()
    comanda('sx')
    vi.advanceTimersByTime(10)
    expect(rAF.length).toBeGreaterThan(0) // in corso
    vi.advanceTimersByTime(270)
    scorriRaf()
    expect(rAF.length).toBe(0) // completata
  })
})
