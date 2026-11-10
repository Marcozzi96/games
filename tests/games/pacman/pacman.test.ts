import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pacman } from '@/games/pacman/pacman'
import type { Comando, CtxGioco, HandleGioco } from '@/core/types'

type CtxFinto = {
  canvas: HTMLCanvasElement
  invia: { punteggio: ReturnType<typeof vi.fn>; fine: ReturnType<typeof vi.fn> }
  comanda: (fn: (c: Comando | [Comando, number, number]) => void) => void
  handle: HandleGioco
}

// Helper "browser": finge requestAnimationFrame/cancelAnimationFrame.
// - requestAnimationFrame(cb): cattura cb (il loop del gioco) e restituisce un id.
// - cancelAnimationFrame(id): se è l'ultimo id, azzera il callback catturato
//   (come fa il browser: il frame in coda non viene più eseguito).
// - frame(t): esegue il callback in coda (se c'è) col timestamp scelto.
function ctxFinto(): {
  ctx: CtxFinto
  comanda: (c: string) => void
  frame: (t: number) => void
  rafSpy: ReturnType<typeof vi.fn>
} {
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 480
  const listeners: Array<(c: Comando | [Comando, number, number]) => void> = []
  const invia = { punteggio: vi.fn(), fine: vi.fn() }
  let rafCb: ((t: number) => void) | null = null
  let seq = 0
  let activeId = 0
  const rafSpy = vi.fn((cb: (t: number) => void) => {
    activeId = ++seq
    rafCb = cb
    return activeId
  })
  const cafSpy = vi.fn((id: number) => {
    if (id === activeId) rafCb = null
  })
  vi.stubGlobal('requestAnimationFrame', rafSpy)
  vi.stubGlobal('cancelAnimationFrame', cafSpy)
  const handle = pacman.crea({ canvas, invia, comanda: (fn) => listeners.push(fn) })
  return {
    ctx: { canvas, invia, comanda: (fn) => listeners.push(fn), handle },
    comanda: (c) => listeners.forEach((fn) => fn(c as Comando)),
    frame: (t: number) => {
      if (rafCb) rafCb(t)
    },
    rafSpy,
  }
}

describe('pacman (Gioco)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // RNG deterministico per l'AI dei ghost spaventati (scegliDirezione usa
    // casual() solo in stato 'spaventato').
    vi.spyOn(Math, 'random').mockReturnValue(0.3)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('è registrato col contratto atteso', () => {
    expect(pacman.id).toBe('pacman')
    expect(pacman.nome).toBe('Pac-Man')
    expect(pacman.icona).toBe('/icons/icon-pacman.svg')
    expect(pacman.comandi).toEqual(['su', 'giu', 'sx', 'dx'])
  })

  it('crea() registra il listener comanda', () => {
    const listeners: Array<(c: Comando) => void> = []
    const canvas = document.createElement('canvas')
    canvas.width = 360
    canvas.height = 480
    pacman.crea({
      canvas,
      invia: { punteggio: () => undefined, fine: () => undefined },
      comanda: (fn) => listeners.push(fn as (c: Comando) => void),
    })
    expect(listeners.length).toBe(1)
  })

  it('avvio pigro: la prima comanda avvia il loop (un rAF è richiesto)', () => {
    const { comanda, frame, rafSpy } = ctxFinto()
    expect(rafSpy.mock.calls.length).toBe(0) // niente rAF prima del primo comando
    comanda('dx')
    expect(rafSpy.mock.calls.length).toBeGreaterThanOrEqual(1)
    frame(16) // un tick: nessun crash, nessun game over
  })

  it('pausa: rAF non avanza più, invia.fine non viene chiamata (Review Focus)', () => {
    const { ctx, comanda, frame } = ctxFinto()
    comanda('sx')
    frame(0)
    frame(16)
    ctx.handle.pausa()
    // Anche con un frame "tardivo" il loop resta inerte (pauSata / rAF cancellato).
    frame(100_000)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('smonta: rAF fermato, comanda dopo smonta è no-op (Review Focus)', () => {
    const { ctx, comanda, frame } = ctxFinto()
    comanda('sx')
    frame(16)
    ctx.handle.smonta()
    comanda('giu') // listener smontato: no-op
    frame(1_000)
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('reset: stato riinizializzato, punteggio a 0, doppio reset sicuro (Review Focus)', () => {
    const { ctx, comanda, frame } = ctxFinto()
    comanda('sx')
    frame(16)
    ctx.handle.reset()
    ctx.handle.reset() // doppio: deve restare un solo stato pulito
    expect(ctx.invia.punteggio).toHaveBeenLastCalledWith(0)
    frame(16) // dopo il reset il gioco è in attesa: nessun tick attivo
    expect(ctx.invia.fine).not.toHaveBeenCalled()
  })

  it('delta time cap: un frame da 2000ms non causa più di un tick standard (Review Focus)', () => {
    const { ctx, comanda, frame } = ctxFinto()
    comanda('sx')
    frame(0) // stabilisce "last"
    // Un solo frame con un buco di 2000ms: dt cap a 50ms → ~0.4 tile.
    // Pac-Man parte a (13,23) con dir sx: il primo pellet è a 1 tile (12,23).
    // Con dt cap 50ms (0.4 tile) NON raggiunge il pellet → nessun punteggio.
    frame(2000)
    expect(ctx.invia.punteggio).not.toHaveBeenCalled()
  })

  it('game over: dopo 3 morti invia.fine(punti) viene chiamata (Review Focus)', () => {
    const { ctx, comanda, frame, rafSpy } = ctxFinto()
    comanda('sx') // avvia; Pac-Man va a sinistra lungo la riga 23 e si ferma a muro
    let t = 0
    for (let i = 0; i < 6000 && ctx.invia.fine.mock.calls.length === 0; i++) {
      t += 16
      frame(t)
    }
    // Tre morti (3 vite) → fine, chiamata UNA sola volta col punteggio > 0
    // (pellet/power mangiati prima della prima morte).
    expect(ctx.invia.fine).toHaveBeenCalledTimes(1)
    expect(ctx.invia.fine.mock.calls[0][0]).toBeGreaterThan(0)
    // Dopo il game over il loop si ferma: un frame in più non richiede rAF.
    const prima = rafSpy.mock.calls.length
    frame(t + 16)
    expect(rafSpy.mock.calls.length).toBe(prima)
  })
})
