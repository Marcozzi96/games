import { describe, it, expect } from 'vitest'
import {
  VITE_INIZIALI, PUNTI_PELLET, PUNTI_POWER,
  creaStato, comando, tick, velPacman, velGhost, durataSpaventati, durataScatter,
} from '@/games/pacman/logica'
import { PACMAN_START } from '@/games/pacman/labirinto'

// Pac-Man parte a PACMAN_START (13,23) su un tile 'passo'; a sx (12,23) c'è un
// pellet, a dx (14,23) c'è un altro 'passo'. Blinky parte a (13,11) attivo.
// dt=0.125 a vel 8 tile/s sposta di esattamente 1 tile.

describe('creaStato', () => {
  it('3 vite, 0 punti, livello 1, 4 fantasmi, statoFase=gioco', () => {
    const s = creaStato()
    expect(s.vite).toBe(VITE_INIZIALI)
    expect(s.punti).toBe(0)
    expect(s.livello).toBe(1)
    expect(s.fantasmi).toHaveLength(4)
    expect(s.statoFase).toBe('gioco')
  })

  it('Pac-Man a PACMAN_START, Blinky fuori dalla casa (attivo)', () => {
    const s = creaStato()
    expect(s.pacman.col).toBe(PACMAN_START.col)
    expect(s.pacman.riga).toBe(PACMAN_START.riga)
    const blinky = s.fantasmi[0]
    expect(blinky.stato).toBe('attivo')
    expect(blinky.col).toBe(13)
    expect(blinky.riga).toBe(11)
  })
})

describe('comando', () => {
  it('bufferizza la direzione in dirPrevista', () => {
    const s = comando(creaStato(), 'su')
    expect(s.pacman.dirPrevista).toBe('su')
  })

  it('anche la direzione opposta va in dirPrevista (invert)', () => {
    const s = creaStato()
    s.pacman.dir = 'dx'
    const s2 = comando(s, 'sx')
    expect(s2.pacman.dirPrevista).toBe('sx')
  })
})

describe('tick — movimento e pellet', () => {
  it('dt=0.125 (1/8s) a vel 8 sposta Pac-Man di 1 tile', () => {
    const s = creaStato()
    s.pacman.dir = 'dx'
    s.pacman.progresso = 0
    const s2 = tick(s, 0.125)
    expect(s2.pacman.col).toBe(14)
    expect(s2.pacman.riga).toBe(23)
  })

  it('mangia un pellet: +10, pelletMangiati++, tile→passo', () => {
    const s = creaStato()
    s.pacman.dir = 'sx'
    s.pacman.progresso = 0
    const s2 = tick(s, 0.125)
    expect(s2.pacman.col).toBe(12)
    expect(s2.punti).toBe(PUNTI_PELLET)
    expect(s2.pelletMangiati).toBe(1)
    expect(s2.labirinto[23][12]).toBe('passo')
  })

  it('mangia un power: +50, timerSpaventati>0, ghost attivi→spaventato', () => {
    const s = creaStato()
    s.pacman.col = 2
    s.pacman.riga = 23
    s.pacman.dir = 'sx'
    s.pacman.progresso = 0
    const s2 = tick(s, 0.125)
    expect(s2.pacman.col).toBe(1)
    expect(s2.punti).toBe(PUNTI_POWER)
    expect(s2.timerSpaventati).toBeGreaterThan(0)
    expect(s2.fantasmi[0].stato).toBe('spaventato')
  })
})

describe('tick — collisioni', () => {
  it('ghost attivo: vite--, statoFase=morte', () => {
    const s = creaStato()
    s.pacman.dir = 'sx'
    s.pacman.progresso = 0
    const b = s.fantasmi[0]
    b.col = 13; b.riga = 23; b.dir = 'sx'; b.progresso = 0; b.stato = 'attivo'
    const s2 = tick(s, 0.016)
    expect(s2.vite).toBe(VITE_INIZIALI - 1)
    expect(s2.statoFase).toBe('morte')
  })

  it('ghost spaventato: mangiato (+200), catena++, ghost→occhio', () => {
    const s = creaStato()
    s.pacman.dir = 'sx'
    s.pacman.progresso = 0
    const b = s.fantasmi[0]
    b.col = 13; b.riga = 23; b.dir = 'sx'; b.progresso = 0; b.stato = 'spaventato'
    s.timerSpaventati = 5
    const s2 = tick(s, 0.016)
    expect(s2.fantasmi[0].stato).toBe('occhio')
    expect(s2.punti).toBeGreaterThanOrEqual(200)
    expect(s2.catena).toBe(1)
  })

  it('vite=0 e collisione: statoFase=fine', () => {
    const s = creaStato()
    s.vite = 0
    s.pacman.dir = 'sx'
    s.pacman.progresso = 0
    const b = s.fantasmi[0]
    b.col = 13; b.riga = 23; b.dir = 'sx'; b.progresso = 0; b.stato = 'attivo'
    const s2 = tick(s, 0.016)
    expect(s2.statoFase).toBe('fine')
  })
})

describe('tick — tunnel, livello, frutta, extra vita', () => {
  it('tunnel wrap: da (27,14) a dx → (0,14)', () => {
    const s = creaStato()
    s.pacman.col = 27
    s.pacman.riga = 14
    s.pacman.dir = 'dx'
    s.pacman.progresso = 0
    const s2 = tick(s, 0.125)
    expect(s2.pacman.col).toBe(0)
    expect(s2.pacman.riga).toBe(14)
  })

  it('tutti i pellet mangiati: statoFase=reset, livello++', () => {
    const s = creaStato()
    s.pelletMangiati = s.pelletTotali
    const s2 = tick(s, 0.001)
    expect(s2.statoFase).toBe('reset')
    expect(s2.livello).toBe(2)
  })

  it('frutta compare a 70 pellet', () => {
    const s = creaStato()
    s.pelletMangiati = 69
    s.pacman.dir = 'sx'
    s.pacman.progresso = 0
    const s2 = tick(s, 0.125)
    expect(s2.pelletMangiati).toBe(70)
    expect(s2.frutto).not.toBeNull()
  })

  it('frutta scompare dopo ~10s', () => {
    const s = creaStato()
    s.frutto = { tipo: 0, punti: 100, timer: 9.9 }
    s.pelletMangiati = 200 // evita di ri-innescare lo spawn a 70/170
    for (const g of s.fantasmi) g.stato = 'occhio' // nessuna morte
    let s2 = s
    for (let i = 0; i < 100; i++) s2 = tick(s2, 0.1)
    expect(s2.frutto).toBeNull()
  })

  it('extra vita a 7000 punti: vite+1, extraVitaData', () => {
    const s = creaStato()
    s.punti = 6990
    s.pacman.dir = 'sx'
    s.pacman.progresso = 0
    const s2 = tick(s, 0.125)
    expect(s2.punti).toBe(7000)
    expect(s2.vite).toBe(VITE_INIZIALI + 1)
    expect(s2.extraVitaData).toBe(true)
  })
})

describe('velocità e durate per livello', () => {
  it('velPacman: 8 al livello 1, cap 10', () => {
    expect(velPacman(1)).toBe(8)
    expect(velPacman(10)).toBe(10)
  })

  it('velGhost restituisce una velocità plausibile', () => {
    expect(velGhost(1)).toBeGreaterThan(0)
    expect(velGhost(1)).toBeLessThanOrEqual(12)
  })

  it('durataSpaventati: 6 al livello 1, minimo 2', () => {
    expect(durataSpaventati(1)).toBe(6)
    expect(durataSpaventati(10)).toBe(2)
  })

  it('durataScatter: 7 al livello 1, 0 dal livello 7 (eliminato)', () => {
    expect(durataScatter(1)).toBe(7)
    expect(durataScatter(7)).toBe(0)
  })
})
