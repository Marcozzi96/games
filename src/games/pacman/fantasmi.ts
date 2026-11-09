// AI fantasmi: funzioni pure per posizioni iniziali, target tile e scelta direzione.

import type { Tile, Direzione } from './labirinto'
import { direzioniDisponibili, GHOST_DOOR, GHOST_HOUSE } from './labirinto'

export type StatoFantasma = 'casa' | 'uscita' | 'attivo' | 'spaventato' | 'occhio'

export type Fantasma = {
  id: number // 0=Blinky, 1=Pinky, 2=Inky, 3=Clyde
  col: number
  riga: number
  dir: Direzione
  stato: StatoFantasma
  timerCasa: number // secondi rimanenti per uscire (solo in stato 'casa')
  progresso: number // 0..1, avanzamento nel tile corrente
}

// Costanti velocità (tile/secondo).
export const VEL_BASE = 8
export const VEL_SCATTER = 7.5
export const VEL_SPAAVENTATO = 5
export const VEL_OCCHIO = 12
export const VEL_PACMAN = 8

// Posizioni scatter: un angolo per ogni ghost.
export const SCATTER_TILES: ReadonlyArray<{ col: number; riga: number }> = [
  { col: 0, riga: 0 },
  { col: 27, riga: 0 },
  { col: 0, riga: 30 },
  { col: 27, riga: 30 },
]

// Timer di uscita dalla casa per livello 1 (secondi).
export const EXIT_TIMERS: readonly [0, 1, 4, 7] = [0, 1, 4, 7]

const DELTA: Record<Direzione, { dcol: number; drow: number }> = {
  su: { dcol: 0, drow: -1 },
  giu: { dcol: 0, drow: 1 },
  sx: { dcol: -1, drow: 0 },
  dx: { dcol: 1, drow: 0 },
}

const OPPOSTA: Record<Direzione, Direzione> = {
  su: 'giu',
  giu: 'su',
  sx: 'dx',
  dx: 'sx',
}

// Priorità nei pareggi di distanza (classica): su > sx > giu > dx.
const PRIORITÀ: readonly Direzione[] = ['su', 'sx', 'giu', 'dx']

// Crea i 4 fantasmi nelle posizioni iniziali per un dato livello.
// Blinky parte già fuori dalla casa; gli altri escono secondo EXIT_TIMERS
// (ridotti col livello, minimo 0).
export function creaFantasmi(livello: number): Fantasma[] {
  const riduci = (t: number): number => Math.max(0, t - (livello - 1))
  return [
    { id: 0, col: GHOST_DOOR.col, riga: GHOST_DOOR.riga - 1, dir: 'sx', stato: 'attivo', timerCasa: 0, progresso: 0 },
    { id: 1, col: GHOST_HOUSE.col, riga: GHOST_HOUSE.riga, dir: 'su', stato: 'casa', timerCasa: riduci(EXIT_TIMERS[1]), progresso: 0 },
    { id: 2, col: GHOST_HOUSE.col, riga: GHOST_HOUSE.riga, dir: 'su', stato: 'casa', timerCasa: riduci(EXIT_TIMERS[2]), progresso: 0 },
    { id: 3, col: GHOST_HOUSE.col, riga: GHOST_HOUSE.riga, dir: 'su', stato: 'casa', timerCasa: riduci(EXIT_TIMERS[3]), progresso: 0 },
  ]
}

// Calcola il tile target per un ghost dato lo stato del gioco.
export function targetFantasma(
  ghost: Fantasma,
  pacman: { col: number; riga: number; dir: Direzione },
  blinky: Fantasma,
  modalità: 'scatter' | 'chase',
): { col: number; riga: number } {
  if (modalità === 'scatter') return SCATTER_TILES[ghost.id]
  const avanti = (n: number, da: { col: number; riga: number; dir: Direzione }): { col: number; riga: number } => ({
    col: da.col + n * DELTA[da.dir].dcol,
    riga: da.riga + n * DELTA[da.dir].drow,
  })
  switch (ghost.id) {
    case 0:
      return { col: pacman.col, riga: pacman.riga } // Blinky: insegue Pac-Man
    case 1:
      return avanti(4, pacman) // Pinky: 4 tile avanti Pac-Man
    case 2: {
      // Inky: raddoppia il vettore da Blinky al punto 2 tile avanti Pac-Man
      const p2 = avanti(2, pacman)
      return {
        col: blinky.col + 2 * (p2.col - blinky.col),
        riga: blinky.riga + 2 * (p2.riga - blinky.riga),
      }
    }
    case 3: {
      // Clyde: se lontano (> 8 tile) insegue, altrimenti torna al suo angolo
      const d2 = (ghost.col - pacman.col) ** 2 + (ghost.riga - pacman.riga) ** 2
      return d2 > 64 ? { col: pacman.col, riga: pacman.riga } : SCATTER_TILES[ghost.id]
    }
    default:
      return { col: pacman.col, riga: pacman.riga }
  }
}

// Sceglie la direzione per un ghost a un crossroad.
// Spaventato: scelta casuale (RNG iniettato). Altrimenti: minima distanza
// euclidea dal tile di arrivo al target; pareggi risolti per priorità.
// Non inverte mai la direzione corrente.
export function scegliDirezione(
  ghost: Fantasma,
  lab: Tile[][],
  target: { col: number; riga: number },
  casual: () => number,
): Direzione {
  const disponibili = direzioniDisponibili(lab, ghost.col, ghost.riga, true).filter((d) => d !== OPPOSTA[ghost.dir])
  if (disponibili.length === 0) return ghost.dir
  if (ghost.stato === 'spaventato') {
    return disponibili[Math.floor(casual() * disponibili.length)]
  }
  let scelta: Direzione = disponibili[0]
  let distanzaMin = Infinity
  for (const d of PRIORITÀ) {
    if (!disponibili.includes(d)) continue
    const nc = ghost.col + DELTA[d].dcol
    const nr = ghost.riga + DELTA[d].drow
    const d2 = (target.col - nc) ** 2 + (target.riga - nr) ** 2
    if (d2 < distanzaMin) {
      scelta = d
      distanzaMin = d2
    }
  }
  return scelta
}
