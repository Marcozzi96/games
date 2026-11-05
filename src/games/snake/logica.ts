// Logica pura del Snake: stato immutabile + funzioni pure, RNG iniettato.
// Il gioco (snake.ts) usa solo questo modulo per muovere lo stato.

import type { Comando } from '@/core/types'

export type Direzione = 'su' | 'giu' | 'sx' | 'dx'

export type Punto = { x: number; y: number }

export type StatoSnake = {
  serpente: Punto[] // [0] è la testa
  direzione: Direzione
  coda: Direzione[] // comandi in attesa (max CODA_MAX)
  cibo: Punto
  punti: number
  intervallo: number
  finita: boolean
}

export const COLONNE = 18
export const RIGHE = 24
export const PUNTI_PER_CIBO = 10
export const INTERVALLO_INIZIALE = 140
export const INTERVALLO_MINIMO = 70
export const ACCELERAZIONE = 5
export const CODA_MAX = 3

const DELTA: Record<Direzione, Punto> = {
  su: { x: 0, y: -1 },
  giu: { x: 0, y: 1 },
  sx: { x: -1, y: 0 },
  dx: { x: 1, y: 0 },
}

const OPPOSTA: Record<Direzione, Direzione> = {
  su: 'giu',
  giu: 'su',
  sx: 'dx',
  dx: 'sx',
}

const DIREZIONI: readonly string[] = ['su', 'giu', 'sx', 'dx']

const indiciOccupati = (serpente: Punto[]): number[] =>
  serpente.map((c) => c.x + c.y * COLONNE)

export function ciboRandom(stato: StatoSnake, casual: () => number = Math.random): Punto {
  const occupate = new Set(indiciOccupati(stato.serpente))
  const liberi: number[] = []
  for (let i = 0; i < COLONNE * RIGHE; i++) {
    if (!occupate.has(i)) liberi.push(i)
  }
  if (liberi.length === 0) return stato.cibo
  const i = liberi[Math.floor(casual() * liberi.length)]
  return { x: i % COLONNE, y: Math.floor(i / COLONNE) }
}

export function creaStato(casual: () => number = Math.random): StatoSnake {
  const base: StatoSnake = {
    serpente: [{ x: 9, y: 12 }, { x: 8, y: 12 }, { x: 7, y: 12 }],
    direzione: 'dx',
    coda: [],
    cibo: { x: 0, y: 0 },
    punti: 0,
    intervallo: INTERVALLO_INIZIALE,
    finita: false,
  }
  return { ...base, cibo: ciboRandom(base, casual) }
}

export function gira(stato: StatoSnake, comando: Comando): StatoSnake {
  if (!DIREZIONI.includes(comando)) return stato
  const dir = comando as Direzione
  const effettiva = stato.coda.length > 0 ? stato.coda[stato.coda.length - 1] : stato.direzione
  if (dir === effettiva || dir === OPPOSTA[effettiva]) return stato
  if (stato.coda.length >= CODA_MAX) return stato
  return { ...stato, coda: [...stato.coda, dir] }
}

export function tick(stato: StatoSnake, casual: () => number = Math.random): StatoSnake {
  if (stato.finita) return stato
  const [dir, ...coda] = stato.coda.length > 0 ? stato.coda : [stato.direzione]
  const delta = DELTA[dir]
  const testa = { x: stato.serpente[0].x + delta.x, y: stato.serpente[0].y + delta.y }
  const fuori = testa.x < 0 || testa.x >= COLONNE || testa.y < 0 || testa.y >= RIGHE
  if (fuori) return { ...stato, direzione: dir, coda: coda as Direzione[], finita: true }

  const mangia = testa.x === stato.cibo.x && testa.y === stato.cibo.y
  // La coda si ritrae (ultima cella libera) salvo che mangia.
  const corpo = mangia ? stato.serpente : stato.serpente.slice(0, -1)
  const urta = corpo.some((c) => c.x === testa.x && c.y === testa.y)
  if (urta) return { ...stato, direzione: dir, coda: coda as Direzione[], finita: true }

  const nuovaSerpente = [testa, ...corpo]
  const base: StatoSnake = {
    ...stato,
    serpente: nuovaSerpente,
    direzione: dir,
    coda: coda as Direzione[],
  }
  if (!mangia) return base
  const piena = nuovaSerpente.length === COLONNE * RIGHE
  return {
    ...base,
    punti: stato.punti + PUNTI_PER_CIBO,
    intervallo: Math.max(INTERVALLO_MINIMO, stato.intervallo - ACCELERAZIONE),
    cibo: piena ? stato.cibo : ciboRandom(base, casual),
    finita: piena,
  }
}
