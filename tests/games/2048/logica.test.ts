import { describe, it, expect } from 'vitest'
import {
  LATI, creaStato, muovi, grigliaPiena, ciSonoMosse,
} from '@/games/2048/logica'
import type { Stato2048 } from '@/games/2048/logica'

// rng deterministico: ritorna i valori in sequenza (esausto → 0).
const rngSequenza = (...valori: number[]): (() => number) => {
  let i = 0
  return () => valori[i++] ?? 0
}
// (0.2, 0.8) → sempre valore 2, cella libera più a sinistra.
const rngDue = (): (() => number) => rngSequenza(0.2, 0.8)
const rng = (valore: number, cella: number): (() => number) => rngSequenza(valore, cella)

const G = (r0: number[], r1: number[], r2: number[], r3: number[]): number[][] => [r0, r1, r2, r3]
const vuoto = (): number[][] => G([0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
const S = (griglia: number[][]): Stato2048 => ({ griglia, punti: 0, finita: false, giàVinto: false })

describe('creaStato', () => {
  it('due tessere: 90% valore 2 / 10% valore 4; punti 0, non finita', () => {
    const s1 = creaStato(() => 0.2) // 0.2 < 0.9 → 2; celle floor(0.2*16)=3 → [0][3], floor(0.2*15)=3 → [0][4]
    expect(s1.griglia.flat().filter((v) => v > 0)).toEqual([2, 2])
    const s2 = creaStato(rng(0.95, 0.5)) // 0.95 >= 0.9 → 4; cella floor(0.5*16)=8 → [2][0]; rng esausto → 0 → 2 a [0][0]
    expect(s2.griglia.flat().filter((v) => v > 0)).toEqual([2, 4])
    expect(s2.griglia[2][0]).toBe(4)
    expect(s1.punti).toBe(0)
    expect(s1.finita).toBe(false)
    expect(s1.giàVinto).toBe(false)
  })
})

describe('muovi — slide', () => {
  it('sx senza fusioni: scivola al bordo, cambia', () => {
    const r = muovi(S(G([0, 2, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'sx', rngDue())
    expect(r.cambiato).toBe(true)
    expect(r.stato.griglia[0]).toEqual([2, 4, 0, 0])
    expect(r.stato.punti).toBe(0)
  })

  it('dx senza fusioni: scivola a destra', () => {
    const r = muovi(S(G([2, 0, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'dx', rngDue())
    expect(r.cambiato).toBe(true)
    expect(r.stato.griglia[0]).toEqual([0, 0, 2, 4])
  })

  it('su/giu: slide sulle colonne', () => {
    const su = muovi(S(G([0, 0, 0, 0], [2, 0, 0, 0], [0, 4, 0, 0], [0, 0, 0, 0])), 'su', rngDue())
    expect(su.stato.griglia[0]).toEqual([2, 4, 0, 0])
    const giu = muovi(S(G([2, 0, 0, 0], [0, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'giu', rngDue())
    expect(giu.stato.griglia[3]).toEqual([2, 4, 0, 0])
  })

  it('mossa neutra: cambiato false, nessuna tessera nuova, stessi punti, stessa griglia', () => {
    const s = S(G([2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])) // già al bordo sx
    const r = muovi(s, 'sx', () => { throw new Error('rng non deve essere chiamata') })
    expect(r.cambiato).toBe(false)
    expect(r.stato.griglia).toEqual(s.griglia)
    expect(r.stato.punti).toBe(0)
  })
})

describe('muovi — fusione', () => {
  it('fusione singola: [2,2,0,0] ← → [4,0,0,0], +4', () => {
    const r = muovi(S(G([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'sx', rngDue())
    expect(r.stato.griglia[0]).toEqual([4, 0, 0, 0])
    expect(r.stato.punti).toBe(4)
  })

  it('ogni tessera si fonde UNA volta: [2,2,2,0] ← → [4,2,0,0], +4 (non [4,4,0,0])', () => {
    const r = muovi(S(G([2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'sx', rngDue())
    expect(r.stato.griglia[0]).toEqual([4, 2, 0, 0])
    expect(r.stato.punti).toBe(4)
  })

  it('fusione multipla: [4,4,2,2] ← → [8,4,0,0], +12', () => {
    const r = muovi(S(G([4, 4, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'sx', rngDue())
    expect(r.stato.griglia[0]).toEqual([8, 4, 0, 0])
    expect(r.stato.punti).toBe(12)
  })

  it('fusione verso dx: [2,0,2,4] → [0,0,4,4], +4 (la 4 resta al bordo)', () => {
    const r = muovi(S(G([2, 0, 2, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'dx', rngDue())
    expect(r.stato.griglia[0]).toEqual([0, 0, 4, 4])
    expect(r.stato.punti).toBe(4)
  })
})

describe('muovi — spawn', () => {
  it('dopo una mossa che cambia: una tessera nuova (90% 2 / 10% 4) in cella vuota', () => {
    const r = muovi(S(G([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'sx', rng(0.2, 0.8))
    // valore: 0.2 → 2; celle libere 15: cella floor(0.8*15)=12 → [3][1]
    const tessere = r.stato.griglia.flat().filter((v) => v > 0)
    expect(tessere).toHaveLength(2) // 4 fusa + 1 nuova
    expect(r.stato.griglia[3][1]).toBe(2)
  })

  it('spawn sempre 4 con rng >= 0.9', () => {
    const r = muovi(S(G([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'sx', rng(0.95, 0.2))
    // valore: 0.95 → 4; celle libere 15: cella floor(0.2*15)=3 → [1][0]
    expect(r.stato.griglia[1][0]).toBe(4)
  })
})

describe('game over', () => {
  const PIENA_SENZ_A = G([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2])
  // Due coppie che si fondono con 'su' (col 1: 4+4, col 2: 2+2) → resta una
  // cella libera dopo lo spawn → non finita.
  const PIENA_CON_COPPIA = G([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 4, 2, 2])

  it('griglia piena senza adiacenti uguali → finita dopo una mossa neutra', () => {
    const r = muovi(S(PIENA_SENZ_A), 'sx', () => { throw new Error('rng non deve essere chiamata') })
    expect(r.cambiato).toBe(false)
    expect(r.stato.finita).toBe(true)
  })

  it('griglia piena con una coppia → non finita', () => {
    const r = muovi(S(PIENA_CON_COPPIA), 'su', rng(0.2, 0.2))
    expect(r.stato.finita).toBe(false)
  })

  it('grigliaPiena e ciSonoMosse: casi di base', () => {
    expect(grigliaPiena(vuoto())).toBe(false)
    expect(grigliaPiena(PIENA_SENZ_A)).toBe(true)
    expect(ciSonoMosse(vuoto())).toBe(true)
    expect(ciSonoMosse(PIENA_SENZ_A)).toBe(false)
    // Griglia piena: le due 2 della riga 2 NON sono adiacenti (separate dall'8) → niente mossa
    expect(ciSonoMosse(G([2, 4, 2, 4], [4, 2, 4, 2], [2, 8, 2, 4], [4, 2, 4, 2]))).toBe(false)
  })
})

describe('vittoria', () => {
  it('giàVinto diventa true alla prima 2048 creata per fusione, una tantum', () => {
    // due righe 1024,1024: la prima mossa crea due 2048 per fusione
    const s0 = S(G([1024, 1024, 0, 0], [0, 0, 0, 0], [1024, 1024, 0, 0], [0, 0, 0, 0]))
    const r1 = muovi(s0, 'sx', rng(0.2, 0.2))
    expect(r1.stato.griglia.flat().includes(2048)).toBe(true)
    expect(r1.stato.giàVinto).toBe(true)
    const r2 = muovi(r1.stato, 'sx', rng(0.2, 0.2))
    expect(r2.stato.giàVinto).toBe(true) // stabile
  })

  it('giàVinto resta false se la griglia parte già con una 2048 (non creata da fusione)', () => {
    const s0 = S(G([2048, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]))
    const r = muovi(s0, 'sx', rng(0.2, 0.2))
    expect(r.stato.giàVinto).toBe(false)
  })

  it('giàVinto con rng sempre 0.9: la tessera fusa è 2048 (1024+1024) e lo spawn è 4', () => {
    const s0 = S(G([1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]))
    const r = muovi(s0, 'sx', () => 0.9)
    expect(r.stato.giàVinto).toBe(true)
    expect(r.stato.punti).toBe(2048)
    expect(r.stato.griglia.flat().filter((v) => v > 0)).toContain(4) // spawn 4
  })
})
