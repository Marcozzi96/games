// Test del labirinto Pac-Man: griglia 28×31 (layout classico Namco 1980) + helper tile.

import { describe, it, expect } from 'vitest'
import {
  COLONNE,
  creaLabirinto,
  direzioniDisponibili,
  FRUTTA_POSIZIONE,
  ghostPuPassare,
  GHOST_DOOR,
  GHOST_HOUSE,
  pacmanPuPassare,
  PACMAN_START,
  POWER_POSIZIONI,
  RIGHE,
  tileAt,
  èCrossroad,
} from '@/games/pacman/labirinto'
import type { Tile } from '@/games/pacman/labirinto'

// Griglia sintetica: M = muro, qualsiasi altro char = passo.
// Serve a testare i helper in modo indipendente dal labirinto reale.
const griglia = (righe: string[]): Tile[][] =>
  righe.map((r) => [...r].map((ch) => (ch === 'M' ? ('muro' as Tile) : ('passo' as Tile))))

describe('creaLabirinto', () => {
  const lab = creaLabirinto()

  it('restituisce una griglia di 31 righe × 28 colonne', () => {
    expect(RIGHE).toBe(31)
    expect(COLONNE).toBe(28)
    expect(lab).toHaveLength(RIGHE)
    for (const riga of lab) expect(riga).toHaveLength(COLONNE)
  })

  it('è simmetrica allo specchio (colonna c ↔ 27-c) per ogni tile', () => {
    for (let r = 0; r < RIGHE; r++) {
      for (let c = 0; c < COLONNE; c++) {
        expect(lab[r][c]).toBe(lab[r][COLONNE - 1 - c])
      }
    }
  })

  it('ha i 4 power pellet alle posizioni classiche', () => {
    expect(POWER_POSIZIONI).toEqual([
      { col: 1, riga: 3 },
      { col: 26, riga: 3 },
      { col: 1, riga: 23 },
      { col: 26, riga: 23 },
    ])
    for (const p of POWER_POSIZIONI) expect(tileAt(lab, p.col, p.riga)).toBe('power')
  })

  it('il tunnel è in riga 14 alle colonne 0 e 27', () => {
    expect(tileAt(lab, 0, 14)).toBe('tunnel')
    expect(tileAt(lab, COLONNE - 1, 14)).toBe('tunnel')
  })

  it('contiene 244 pellet totali (240 + 4 power) come nel labirinto classico', () => {
    let n = 0
    for (const riga of lab) for (const t of riga) if (t === 'pellet' || t === 'power') n++
    expect(n).toBe(244)
  })

  it('le posizioni chiave cadono su tile corretti', () => {
    expect(tileAt(lab, GHOST_DOOR.col, GHOST_DOOR.riga)).toBe('porta')
    expect(tileAt(lab, GHOST_HOUSE.col, GHOST_HOUSE.riga)).toBe('casa')
    expect(tileAt(lab, PACMAN_START.col, PACMAN_START.riga)).toBe('passo')
    expect(tileAt(lab, FRUTTA_POSIZIONE.col, FRUTTA_POSIZIONE.riga)).toBe('passo')
  })
})

describe('tileAt', () => {
  const lab = creaLabirinto()

  it('fuori griglia → muro', () => {
    expect(tileAt(lab, -1, 5)).toBe('muro')
    expect(tileAt(lab, COLONNE, 5)).toBe('muro')
    expect(tileAt(lab, 5, -1)).toBe('muro')
    expect(tileAt(lab, 5, RIGHE)).toBe('muro')
  })
})

describe('pacmanPuPassare', () => {
  const lab = creaLabirinto()

  it('false su muro, porta, casa; true su passo, pellet, power, tunnel', () => {
    expect(pacmanPuPassare(lab, 0, 0)).toBe(false) // (0,0) muro
    expect(pacmanPuPassare(lab, 13, 12)).toBe(false) // (13,12) porta
    expect(pacmanPuPassare(lab, 13, 14)).toBe(false) // (13,14) casa
    expect(pacmanPuPassare(lab, 13, 23)).toBe(true) // (13,23) passo
    expect(pacmanPuPassare(lab, 1, 1)).toBe(true) // (1,1) pellet
    expect(pacmanPuPassare(lab, 1, 3)).toBe(true) // (1,3) power
    expect(pacmanPuPassare(lab, 0, 14)).toBe(true) // (0,14) tunnel
  })
})

describe('ghostPuPassare', () => {
  const lab = creaLabirinto()

  it('false solo su muro; true su tutti gli altri tile', () => {
    expect(ghostPuPassare(lab, 0, 0)).toBe(false) // muro
    expect(ghostPuPassare(lab, 13, 12)).toBe(true) // porta
    expect(ghostPuPassare(lab, 13, 14)).toBe(true) // casa
    expect(ghostPuPassare(lab, 0, 14)).toBe(true) // tunnel
    expect(ghostPuPassare(lab, 1, 1)).toBe(true) // pellet
    expect(ghostPuPassare(lab, 13, 23)).toBe(true) // passo
  })
})

describe('direzioniDisponibili', () => {
  const lab = creaLabirinto()

  it('in un corridoio orizzontale (muro sopra e sotto) → ["sx", "dx"]', () => {
    // (2,1): sopra è la riga 0 tutta muri, sotto (2,2) è muro; (1,1) e (3,1) sono pellet.
    expect(direzioniDisponibili(lab, 2, 1, false)).toEqual(['sx', 'dx'])
  })

  it('per un ghost include anche porta e casa', () => {
    // (13,13): ghost dentro l'interior della casa — 4 vie, pacman solo 2 (su/... no: su=porta, giu=casa).
    expect(direzioniDisponibili(lab, 13, 13, true)).toEqual(['su', 'giu', 'sx', 'dx'])
    expect(direzioniDisponibili(lab, 13, 13, false)).toEqual([])
  })
})

describe('èCrossroad', () => {
  // Croce a 4 vie: la cella (2,2) ha 4 direzioni libere.
  const croce = griglia(['MMPMM', 'MPPPM', 'MPPPM', 'MPPPM', 'MMPMM'])
  // Corridoio a 2 vie: la cella (1,1) ha solo sx/dx.
  const corridoio = griglia(['MMMM', 'MPPM', 'MMMM'])

  it('true in un incrocio a 4 vie (esclusa la direzione opposta alla corrente)', () => {
    expect(èCrossroad(croce, 2, 2, 'sx', false)).toBe(true)
    expect(èCrossroad(croce, 2, 2, 'su', false)).toBe(true)
  })

  it('false in un corridoio (una sola via in avanti)', () => {
    expect(èCrossroad(corridoio, 1, 1, 'sx', false)).toBe(false)
  })
})
