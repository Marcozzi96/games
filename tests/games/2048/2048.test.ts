import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { gioco2048, DURATA_TRANSIZIONE, DURATA_POP } from '@/games/2048/2048'
import type { Comando, HandleGioco } from '@/core/types'
import * as audio from '@/core/audio'

// Stato iniziale iniettabile per il test vittoria (2048 non è raggiungibile in 2 mosse:
// nessuna sequenza rng-costante + ciclo di mosse lo raggiunge in 3000 mosse).
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

type CtxFinto = {
  canvas: HTMLCanvasElement
  invia: { punteggio: (v: number) => void; fine: (v: number) => void }
  comanda: (fn: (c: Comando | [Comando, number, number]) => void) => void
  handle: HandleGioco
}

let rAF: Array<(t: number) => void>
const rAFnow = { t: 0 }

function ctxFinto(): {
  ctx: CtxFinto
  invia: { punteggio: ReturnType<typeof vi.fn>; fine: ReturnType<typeof vi.fn> }
  comanda: (c: string) => void
} {
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 480
  const listeners: Array<(c: Comando | [Comando, number, number]) => void> = []
  const invia = { punteggio: vi.fn(), fine: vi.fn() }
  const handle = gioco2048.crea({ canvas, invia, comanda: (fn) => listeners.push(fn) })
  return {
    ctx: { canvas, invia, comanda: (fn) => listeners.push(fn), handle },
    invia,
    comanda: (c) => listeners.forEach((fn) => fn(c as Comando)),
  }
}

function scorriRaf() {
  const coda = rAF.splice(0)
  for (const cb of coda) cb(rAFnow.t)
}

describe('2048 (Gioco)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.9) // spawn: sempre 4, cella a dx
    rAF = []
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      rAF.push(cb)
      return rAF.length
    })
    // Il cancel deve rimuovere il callback dalla coda (altrimenti rAF.length non torna a 0).
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => {
      if (id >= 1 && id <= rAF.length) rAF.splice(id - 1, 1)
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('è registrato col contratto atteso', () => {
    expect(gioco2048.id).toBe('2048')
    expect(gioco2048.nome).toBe('2048')
    expect(gioco2048.icona).toBe('/icons/icon-2048.svg')
    expect(gioco2048.pad).toBe(false)
    expect(gioco2048.comandi).toEqual(['su', 'giu', 'sx', 'dx', 'swipe-sx', 'swipe-dx', 'swipe-su', 'swipe-giu'])
  })

  it('costanti di animazione nella fascia della spec', () => {
    expect(DURATA_TRANSIZIONE).toBeGreaterThanOrEqual(100)
    expect(DURATA_TRANSIZIONE).toBeLessThanOrEqual(150)
    expect(DURATA_POP).toBe(100)
  })

  it('disegna subito alla creazione: griglia e hint visibili senza comandi', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 360
    canvas.height = 480
    const mock = {
      fillRect: vi.fn(),
      fillText: vi.fn(),
      font: '',
      fillStyle: '',
      textAlign: '',
      textBaseline: '',
    }
    vi.spyOn(canvas, 'getContext').mockReturnValue(mock as unknown as CanvasRenderingContext2D)
    const handle = gioco2048.crea({
      canvas,
      invia: { punteggio: vi.fn(), fine: vi.fn() },
      comanda: () => {},
    })
    // Sfondo intero + 16 celle + 2 tessere iniziali
    expect(mock.fillRect).toHaveBeenCalledTimes(19)
    // 2 etichette tessere + hint centrale (360/2, 480/2)
    expect(mock.fillText).toHaveBeenCalledTimes(3)
    expect(mock.fillText).toHaveBeenCalledWith('Frecce/WASD o swipa', 180, 240)
    handle.smonta()
  })

  it('swipe e tasto fanno la stessa mossa: swipe-sx ≡ sx (punteggio identico)', () => {
    const a = ctxFinto()
    a.comanda('swipe-sx')
    scorriRaf() // termina la transizione
    const puntiA = a.invia.punteggio.mock.calls.at(-1)?.[0]
    const b = ctxFinto()
    b.comanda('sx')
    scorriRaf()
    const puntiB = b.invia.punteggio.mock.calls.at(-1)?.[0]
    expect(puntiA).toBe(puntiB)
  })

  it('mossa valida: invia.punteggio col nuovo totale e la transizione corre fino alla fine', () => {
    const { invia, comanda } = ctxFinto()
    comanda('sx')
    expect(invia.punteggio).toHaveBeenCalledTimes(1)
    expect(invia.punteggio).toHaveBeenLastCalledWith(8)
    expect(rAF.length).toBeGreaterThan(0) // animazione in corso
    scorriRaf()
    expect(invia.fine).not.toHaveBeenCalled()
  })

  it('mossa senza cambio: nessun invio nuovo di punteggio', () => {
    const { invia, comanda } = ctxFinto()
    const prima = invia.punteggio.mock.calls.length
    comanda('giu')
    expect(invia.punteggio).toHaveBeenCalledTimes(prima)
  })

  it('mossa durante la transizione: ignorata (Review Focus)', () => {
    const { invia, comanda } = ctxFinto()
    comanda('sx')
    const chiamate = invia.punteggio.mock.calls.length
    comanda('giu') // transizione ancora in corso
    expect(invia.punteggio.mock.calls.length).toBe(chiamate)
    comanda('swipe-sx')
    expect(invia.punteggio.mock.calls.length).toBe(chiamate)
  })

  it('pausa durante la transizione + riprendi: niente rAF orfano, griglia a posto (Review Focus)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('sx')
    ctx.handle.pausa() // rAF annullato a metà transizione
    expect(vi.mocked(cancelAnimationFrame)).toHaveBeenCalled()
    expect(rAF.length).toBe(0)
    ctx.handle.riprendi()
    scorriRaf() // al riprendi il gioco ridisegna: nessun callback pendente resta
    expect(rAF.length).toBe(0)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('game over: invia.fine(punti) una volta; comandi dopo la fine sono no-op', () => {
    const { invia, comanda } = ctxFinto()
    comanda('sx')
    scorriRaf()
    // Insegue il game over con una sequenza di mosse fissa: con spawn
    // deterministici la griglia si riempie; se fine non è arrivato, riprova.
    for (let i = 0; i < 200 && !invia.fine.mock.calls.length; i++) {
      comanda(['sx', 'dx', 'su', 'giu'][i % 4])
      // La transizione dura ~120ms: avanzare il tempo (browser reale: input bloccato durante).
      vi.advanceTimersByTime(DURATA_TRANSIZIONE + DURATA_POP)
      scorriRaf()
    }
    expect(invia.fine).toHaveBeenCalledTimes(1)
    const punti = invia.punteggio.mock.calls.at(-1)?.[0] ?? -1
    expect(invia.fine).toHaveBeenCalledWith(punti)
    const prima = invia.punteggio.mock.calls.length
    comanda('sx')
    scorriRaf()
    expect(invia.punteggio.mock.calls.length).toBe(prima)
  })

  it('vittoria: crea 2048 → fanfaria di beep una tantum, il gioco continua', () => {
    statoIniziale.griglia = [
      [1024, 1024, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]
    const { invia, comanda } = ctxFinto()
    statoIniziale.griglia = null
    const beep = vi.spyOn(audio, 'beep')
    comanda('sx') // 1024+1024 → 2048
    expect(invia.punteggio).toHaveBeenLastCalledWith(2048)
    expect(beep).toHaveBeenCalledWith(659, 0.12) // fanfaria
    scorriRaf()
    vi.advanceTimersByTime(130)
    expect(beep).toHaveBeenCalledWith(784, 0.2) // seconda nota
    // Il gioco continua: una mossa dopo la vittoria invia punteggio normalmente
    comanda('giu')
    expect(invia.punteggio).toHaveBeenCalled()
    expect(invia.fine).not.toHaveBeenCalled()
    statoIniziale.griglia = null
  })

  it('smonta: niente comandi né rAF dopo il teardown (Review Focus)', () => {
    const { ctx, invia, comanda } = ctxFinto()
    comanda('sx')
    ctx.handle.smonta()
    comanda('giu')
    expect(invia.fine).not.toHaveBeenCalled()
    expect(invia.punteggio).toHaveBeenCalledTimes(1) // nessun nuovo invio
    expect(rAF.length).toBe(0)
  })

  it('reset: doppio reset sicuro, punteggio a zero (Review Focus)', () => {
    const { ctx, invia, comanda } = ctxFinto()
    comanda('sx')
    scorriRaf()
    ctx.handle.reset()
    ctx.handle.reset()
    expect(invia.punteggio).toHaveBeenLastCalledWith(0)
    const n = invia.punteggio.mock.calls.length
    comanda('sx')
    expect(invia.punteggio).toHaveBeenCalledTimes(n + 1)
  })

  it('resize: il gioco non modifica canvas.width/height (Review Focus)', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('sx')
    ctx.canvas.width = 320
    ctx.canvas.height = 420
    scorriRaf()
    expect(ctx.canvas.width).toBe(320)
    expect(ctx.canvas.height).toBe(420)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('transizioni intere: DURATA_TRANSIZIONE + DURATA_POP di avanzamento portano a 0 rAF pendenti', () => {
    const { ctx, comanda } = ctxFinto()
    comanda('sx')
    vi.advanceTimersByTime(10)
    expect(rAF.length).toBeGreaterThan(0) // a 10 ms la transizione (120ms) è in corso
    vi.advanceTimersByTime(DURATA_TRANSIZIONE + DURATA_POP + 50)
    scorriRaf()
    expect(rAF.length).toBe(0)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })
})
