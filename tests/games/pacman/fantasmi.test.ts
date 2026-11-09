// Test dell'AI fantasmi: target per ghost, scelta direzione a crossroad, stati.

import { describe, it, expect } from 'vitest'
import {
  creaFantasmi,
  targetFantasma,
  scegliDirezione,
  SCATTER_TILES,
  EXIT_TIMERS,
  VEL_BASE,
  VEL_SCATTER,
  VEL_SPAAVENTATO,
  VEL_OCCHIO,
  VEL_PACMAN,
} from '@/games/pacman/fantasmi'
import type { Fantasma } from '@/games/pacman/fantasmi'
import { creaLabirinto } from '@/games/pacman/labirinto'
import type { Direzione } from '@/games/pacman/labirinto'

const pacman = (col: number, riga: number, dir: Direzione = 'dx') => ({ col, riga, dir })

const fantasma = (id: number, col: number, riga: number, dir: Direzione = 'su', stato: Fantasma['stato'] = 'attivo'): Fantasma => ({
  id, col, riga, dir, stato, timerCasa: 0, progresso: 0,
})

// Griglie sintetiche (M=muro, P=passo): croce a 4 vie su (2,2), corridoio su (1,1).
const croce: string[] = ['MMPMM', 'MPPPM', 'MPPPM', 'MPPPM', 'MMPMM']
const lab = creaLabirinto()
const labCroce = croce.map((r) => [...r].map((ch) => (ch === 'M' ? ('muro' as const) : ('passo' as const))))

describe('creaFantasmi', () => {
  it('livello 1: Blinky attivo a (13,11), gli altri in casa a (13,14)', () => {
    const f = creaFantasmi(1)
    expect(f).toHaveLength(4)
    expect(f.map((g) => g.id)).toEqual([0, 1, 2, 3])
    expect(f[0].col).toBe(13)
    expect(f[0].riga).toBe(11)
    expect(f[0].stato).toBe('attivo')
    for (const g of f.slice(1)) {
      expect(g.col).toBe(13)
      expect(g.riga).toBe(14)
      expect(g.stato).toBe('casa')
    }
  })

  it('timer di uscita: [0, 1, 4, 7] a livello 1; riducono col livello (min 0)', () => {
    expect(EXIT_TIMERS).toEqual([0, 1, 4, 7])
    const f1 = creaFantasmi(1)
    expect(f1.map((g) => g.timerCasa)).toEqual([0, 1, 4, 7])
    expect(creaFantasmi(2)[3].timerCasa).toBeLessThan(7)
    expect(creaFantasmi(99)[3].timerCasa).toBe(0)
    expect(creaFantasmi(99)[1].timerCasa).toBe(0)
  })
})

describe('targetFantasma — chase', () => {
  const blinky = fantasma(0, 13, 11, 'sx')

  it('Blinky (id 0): tile di Pac-Man', () => {
    expect(targetFantasma(blinky, pacman(5, 10, 'dx'), blinky, 'chase')).toEqual({ col: 5, riga: 10 })
  })

  it('Pinky (id 1): 4 tile avanti Pac-Man', () => {
    const pinky = fantasma(1, 13, 14)
    expect(targetFantasma(pinky, pacman(10, 5, 'dx'), blinky, 'chase')).toEqual({ col: 14, riga: 5 })
    expect(targetFantasma(pinky, pacman(10, 5, 'su'), blinky, 'chase')).toEqual({ col: 10, riga: 1 })
  })

  it('Inky (id 2): blinky + 2×(punto 2 avanti Pac-Man − blinky)', () => {
    const inky = fantasma(2, 13, 14)
    const b = fantasma(0, 10, 10, 'sx')
    // punto2 = (5,5) + 2×(1,0) = (7,5); v = (7,5)−(10,10) = (−3,−5); target = (10,10)+2v = (4,0)
    expect(targetFantasma(inky, pacman(5, 5, 'dx'), b, 'chase')).toEqual({ col: 4, riga: 0 })
  })

  it('Clyde (id 3): dist > 8 → Pac-Man; dist ≤ 8 → scatter tile', () => {
    const clyde = fantasma(3, 20, 10)
    // dist = √(16+16) ≈ 5.66 ≤ 8 → scatter
    expect(targetFantasma(clyde, pacman(24, 14, 'dx'), blinky, 'chase')).toEqual(SCATTER_TILES[3])
    // dist = 8 (confine) → scatter
    expect(targetFantasma(clyde, pacman(20, 18, 'giu'), blinky, 'chase')).toEqual(SCATTER_TILES[3])
    // dist = 9 > 8 → tile di Pac-Man
    expect(targetFantasma(clyde, pacman(20, 19, 'giu'), blinky, 'chase')).toEqual({ col: 20, riga: 19 })
  })
})

describe('targetFantasma — scatter', () => {
  it('restituisce SCATTER_TILES[id] per tutti i 4 ghost', () => {
    const f = creaFantasmi(1)
    for (let id = 0; id < 4; id++) {
      expect(targetFantasma(f[id], pacman(5, 10, 'dx'), f[0], 'scatter')).toEqual(SCATTER_TILES[id])
    }
  })

  it('SCATTER_TILES sono i 4 angoli (Blinky in alto-sx, Pinky in alto-dx, Inky in basso-sx, Clyde in basso-dx)', () => {
    expect(SCATTER_TILES).toEqual([
      { col: 0, riga: 0 },
      { col: 27, riga: 0 },
      { col: 0, riga: 30 },
      { col: 27, riga: 30 },
    ])
  })
})

describe('costanti di velocità', () => {
  it('valori fissati dalla spec (tile/secondo)', () => {
    expect(VEL_BASE).toBe(8)
    expect(VEL_SCATTER).toBe(7.5)
    expect(VEL_SPAAVENTATO).toBe(5)
    expect(VEL_OCCHIO).toBe(12)
    expect(VEL_PACMAN).toBe(8)
  })
})

describe('scegliDirezione — deterministica', () => {
  it('minimizza la distanza al target tra le direzioni disponibili', () => {
    // Croce su (2,2), dir 'sx' (dx escluso), target a sinistra (0,2):
    // su → (2,1) d²=5; giu → (2,3) d²=5; sx → (1,2) d²=1 → 'sx'
    expect(scegliDirezione(fantasma(0, 2, 2, 'sx'), labCroce, { col: 0, riga: 2 }, () => 0)).toBe('sx')
  })

  it('in caso di pareggio usa la priorità su > sx > giu > dx', () => {
    // Target sul tile stesso del ghost: tutte le direzioni a d²=1.
    // dir 'giu' (su esclusa) → tra giu/sx/dx vince 'sx' per priorità.
    expect(scegliDirezione(fantasma(0, 2, 2, 'giu'), labCroce, { col: 2, riga: 2 }, () => 0)).toBe('sx')
  })

  it('non inverte la direzione corrente', () => {
    // Dir 'dx' (sx esclusa), target a sinistra (0,2): sx avrebbe d²=1 ma è l'invertita.
    // Le rimanenti (su/giu/dx) sono a d²=5 → vince 'su' per priorità, mai 'sx'.
    expect(scegliDirezione(fantasma(0, 2, 2, 'dx'), labCroce, { col: 0, riga: 2 }, () => 0)).toBe('su')
  })

  it('nel labirinto reale sceglie la via più corta (anche contro la direzione corrente)', () => {
    // (1,5): T-junction reale — su (1,4) '.', giu (1,6) '.', dx (2,5) '.'; sx muro (bordo).
    // Dir 'giu' (su esclusa): giu → (1,6) d²=625+9=634; dx → (2,5) d²=576+4=580 → 'dx'
    expect(scegliDirezione(fantasma(0, 1, 5, 'giu'), lab, { col: 26, riga: 3 }, () => 0)).toBe('dx')
  })
})

describe('scegliDirezione — spaventato', () => {
  it('sceglie a caso tra le direzioni disponibili (esclusa l\u2019invertita), deterministico con RNG fisso', () => {
    // Croce su (2,2), dir 'su' (giu esclusa) → [su, sx, dx]
    const g = fantasma(1, 2, 2, 'su', 'spaventato')
    expect(scegliDirezione(g, labCroce, { col: 0, riga: 0 }, () => 0.5)).toBe('sx') // floor(0.5×3)=1
    expect(scegliDirezione(g, labCroce, { col: 0, riga: 0 }, () => 0.99)).toBe('dx') // floor(0.99×3)=2
  })
})
