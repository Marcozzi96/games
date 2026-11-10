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

describe('inversione immediata (spec: "invert immediato")', () => {
  it('premendo l\u2019opposto Pac-Man gira (non va avanti nella direzione originale)', () => {
    const s = creaStato()
    s.pacman.col = 13
    s.pacman.riga = 23
    s.pacman.dir = 'dx'
    s.pacman.progresso = 0
    const s1 = comando(s, 'sx')
    const s2 = tick(s1, 0.125)
    expect(s2.pacman.dir).toBe('sx')
    expect(s2.pacman.col).toBe(12) // a sinistra, non a destra
  })

  it('inverte a metà tile con continuità di posizione (torna indietro, non avanza)', () => {
    const s = creaStato()
    s.pacman.col = 13
    s.pacman.riga = 23
    s.pacman.dir = 'dx'
    s.pacman.progresso = 0.5
    const s1 = comando(s, 'sx')
    const s2 = tick(s1, 0.0625) // mezza tile
    expect(s2.pacman.dir).toBe('sx')
    expect(s2.pacman.col).toBe(13) // torna indietro di mezza tile
  })
})

describe('muro: no bumping + svolta via dal muro', () => {
  it('Pac-Man fermo contro un muro non sbatte (resta al centro del tile, progresso=0)', () => {
    const s = creaStato()
    s.pacman.col = 1
    s.pacman.riga = 23
    s.pacman.dir = 'sx' // (0,23) è un muro
    s.pacman.progresso = 0
    const s2 = tick(s, 0.016) // dt da frame reale (60fps), non un multiplo della tile
    expect(s2.pacman.col).toBe(1) // non si muove
    expect(s2.pacman.progresso).toBe(0) // non scivola nel muro (niente bump)
  })

  it('può girare via da un muro con una svolta bufferizzata', () => {
    const s = creaStato()
    s.pacman.col = 1
    s.pacman.riga = 23
    s.pacman.dir = 'sx' // muro
    s.pacman.progresso = 0
    const s1 = comando(s, 'su') // (1,22) è passabile
    const s2 = tick(s1, 0.125)
    expect(s2.pacman.riga).toBe(22) // è girato su
    expect(s2.pacman.dir).toBe('su')
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
    // Ghost tenuti in casa (timer lungo): non si muovono e non possono
    // uccidere Pac-Man durante la simulazione (niente fase 'morte' che
    // congelerebbe il timer).
    for (const g of s.fantasmi) {
      g.stato = 'casa'
      g.timerCasa = 999
    }
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

describe('uscita di casa: i ghost non si bloccano al muro sopra la porta', () => {
  // Config reale post-uscita: il ghost è attivo a (13,11) con dir 'su'
  // (ereditata dall'uscita). (13,10) è muro; (13,12) è la porta, bloccata
  // per i ghost attivi. Senza svolta forzata il ghost sbatte per sempre.
  it('ghost appena uscito a (13,11) dir su: gira nel corridoio, non sbatte', () => {
    const s = creaStato()
    const g = s.fantasmi[1] // Pinky
    g.stato = 'attivo'
    g.col = 13
    g.riga = 11
    g.dir = 'su'
    g.progresso = 0
    const s2 = tick(s, 0.134) // 7.5 tile/s (scatter liv.1) → 1 tile
    const g2 = s2.fantasmi[1]
    expect(g2.stato).toBe('attivo')
    expect(g2.dir).not.toBe('su')
    expect(g2.riga).toBe(11)
    expect(g2.col).toBe(14) // scatter corner (27,0) più vicino a dx
  })

  it('dallo start: dopo ~12s tutti e 4 i ghost sono usciti e in movimento', () => {
    // RNG deterministico: il test è riproducibile.
    let seed = 12345
    const casual = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    let s = creaStato(1, casual)
    // Pac-Man congelato contro il muro (13,22): non può morire né mangiare
    // power. Modalità fissata a scatter (timerModa enorme): nessun cambio di
    // fase e target corner fissi — il test isola il movimento dei ghost.
    s.pacman = { col: 13, riga: 23, dir: 'su', dirPrevista: null, progresso: 0 }
    s.timerModa = 1e9
    const dt = 1 / 60
    for (let i = 0; i < 12 * 60; i++) s = tick(s, dt, casual)
    const pos0 = s.fantasmi.map((g) => ({ col: g.col, riga: g.riga }))
    for (let i = 0; i < 4; i++) {
      const g = s.fantasmi[i]
      expect(g.stato, `ghost ${i} ancora ${g.stato}`).not.toBe('casa')
      expect(g.stato, `ghost ${i} ancora ${g.stato}`).not.toBe('uscita')
    }
    for (let i = 0; i < 60; i++) s = tick(s, dt, casual)
    s.fantasmi.forEach((g, i) => {
      const mosso = g.col !== pos0[i].col || g.riga !== pos0[i].riga
      expect(mosso, `ghost ${i} congelato a (${pos0[i].col},${pos0[i].riga})`).toBe(true)
    })
  })
})

describe('power pellet a metà dell\u2019uscita: il ghost completa l\u2019uscita', () => {
  // Se un power viene mangiato mentre un ghost è in 'uscita' (sopra un tile
  // casa), il ghost diventa spaventato MA DEVE POTERE COMPLETARE l'uscita:
  // la regola "attivi non entrano in casa" vale per l'ingresso, non per
  // l'evacuazione. Senza questa eccezione il ghost resta intrappolato in
  // casa a sbattere contro i muri per sempre.
  it('ghost spaventato a metà uscita esce di casa e non resta su tile casa/porta', () => {
    const s = creaStato()
    const p = s.fantasmi[1] // Pinky a metà dell\u2019uscita
    p.stato = 'uscita'
    p.col = 13
    p.riga = 14
    p.dir = 'su'
    p.progresso = 0.5
    // Pac-Man sul power pellet, in procinto di mangiarlo al primo tick.
    s.pacman = { col: 2, riga: 23, dir: 'sx', dirPrevista: null, progresso: 0 }
    let s2 = s
    for (let i = 0; i < 300; i++) s2 = tick(s2, 1 / 60) // ~5 s (spaventati durano 6 s)
    const g = s2.fantasmi[1]
    expect(g.stato).toBe('spaventato')
    const t = s2.labirinto[g.riga][g.col]
    expect(t !== 'casa' && t !== 'porta', `ghost su tile ${t} a (${g.col},${g.riga})`).toBe(true)
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
