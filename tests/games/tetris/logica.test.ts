import { describe, it, expect } from 'vitest'
import {
  COLONNE, RIGHE, PUNTI_LINIE, PUNTI_SOFT_DROP, PUNTI_HARD_DROP,
  FORME,
  creaStato, avvia, muovi, ruota, softDrop, hardDrop, tick, ghost,
  intervalloGravita, mescolaBag,
} from '@/games/tetris/logica'
import type { StatoTetris, IdTessera } from '@/games/tetris/logica'

const grigliaVuota = (): string[] => Array(COLONNE * RIGHE).fill('libero')

// Stato di prova: tessera T in cima al centro (x=3, y=0), griglia vuota.
const statoT = (): StatoTetris => ({
  griglia: grigliaVuota(),
  tessera: { id: 'T', forma: FORME.T, x: 3, y: 0 },
  bag: ['I'],
  punti: 0,
  linee: 0,
  livello: 1,
  fine: false,
})

describe('creaStato / mescolaBag', () => {
  it('parte in attesa: tessera null, griglia vuota, bag di 7, livello 1', () => {
    const s = creaStato(() => 0)
    expect(s.tessera).toBeNull()
    expect(s.griglia).toEqual(grigliaVuota())
    expect(s.bag).toHaveLength(7)
    expect(s.punti).toBe(0)
    expect(s.linee).toBe(0)
    expect(s.livello).toBe(1)
    expect(s.fine).toBe(false)
  })

  it('mescolaBag: permutazione delle 7 tessere (Fisher-Yates)', () => {
    const b = mescolaBag(() => 0) // scambi no-op: invariata
    expect(b).toEqual(['I', 'O', 'T', 'S', 'Z', 'J', 'L'])
    const tutte = mescolaBag(() => 0.5)
    expect([...tutte].sort()).toEqual(['I', 'J', 'L', 'O', 'S', 'T', 'Z'])
  })

  it('bag di creaStato usa il RNG iniettato (stessa sequenza di mescolaBag)', () => {
    const s = creaStato(() => 0.5)
    expect(s.bag).toEqual(mescolaBag(() => 0.5))
  })
})

describe('avvia', () => {
  it('spawna bag[0] al centro in cima e lo toglie dal bag', () => {
    // bag[0] = 'T': forma 2×3 → x = floor((10-3)/2) = 3, y = 0
    const s = avvia({ ...statoT(), tessera: null, bag: ['T', 'I'] })
    expect(s.tessera).toEqual({ id: 'T', forma: FORME.T, x: 3, y: 0 })
    expect(s.bag).toEqual(['I'])
  })

  it('I spawna a x=3 (larghezza 4), O a x=4 (larghezza 2)', () => {
    const i = avvia({ ...statoT(), tessera: null, bag: ['I'] })
    expect(i.tessera?.x).toBe(3)
    const o = avvia({ ...statoT(), tessera: null, bag: ['O'] })
    expect(o.tessera?.x).toBe(4)
  })

  it('bag vuota: se ne genera una nuova mescolata dal RNG', () => {
    const s = avvia({ ...statoT(), tessera: null, bag: [] }, () => 0.5)
    expect(s.bag).toEqual(mescolaBag(() => 0.5).slice(1))
    expect(s.tessera?.id).toBe(mescolaBag(() => 0.5)[0])
  })

  it('se c\'è già una tessera attiva: no-op', () => {
    const s = statoT()
    expect(avvia(s)).toBe(s)
  })

  it('block out: spawn in collisione → fine (tessera non spawnata)', () => {
    const g = grigliaVuota()
    for (let x = 0; x < COLONNE; x++) { g[x] = 'J'; g[10 + x] = 'J' } // righe 0-1 piene
    const s = avvia({ ...statoT(), griglia: g, tessera: null, bag: ['T'] })
    expect(s.fine).toBe(true)
    expect(s.tessera).toBeNull()
  })
})

describe('muovi', () => {
  it('sposta di 1 cella se libero', () => {
    const s = muovi(statoT(), 1)
    expect(s.tessera?.x).toBe(4)
    expect(muovi(s, -1).tessera?.x).toBe(3)
  })

  it('muro: non esce dalla griglia', () => {
    let s = statoT()
    for (let i = 0; i < 4; i++) s = muovi(s, -1) // x: 3 → -1 (bloccato a 0)
    expect(s.tessera?.x).toBe(0)
  })

  it('tessera null o fine: no-op', () => {
    const vuoto = { ...statoT(), tessera: null }
    expect(muovi(vuoto, 1).tessera).toBeNull()
    const finita = { ...statoT(), fine: true }
    expect(muovi(finita, 1).tessera?.x).toBe(3)
  })
})

describe('ruota', () => {
  it('ruota 90° oraria la forma (T: 2×3 → 3×2)', () => {
    const s = ruota(statoT())
    expect(s.tessera?.forma).toEqual([[1, 0], [1, 1], [1, 0]])
    expect(s.tessera?.x).toBe(3) // senza kick
    expect(s.tessera?.y).toBe(0)
  })

  it('quattro rotazioni = forma originale', () => {
    let s = statoT()
    for (let i = 0; i < 4; i++) s = ruota(s)
    expect(s.tessera?.forma).toEqual(FORME.T)
  })

  it('O: rotazione no-op (stessa forma, stessa posizione)', () => {
    const s = { ...statoT(), tessera: { id: 'O' as IdTessera, forma: FORME.O, x: 4, y: 0 } }
    expect(ruota(s).tessera).toEqual(s.tessera)
  })

  it('wall-kick: contro il muro sinistro scatta l\'offset -1', () => {
    let s = { ...statoT(), tessera: { id: 'T' as IdTessera, forma: [[0, 1, 0], [1, 1, 1]], x: -1, y: 5 } }
    // forma 2×3 a x=-1: colonna -1 occupata → fuori. Rotazione in 3×2 a x=-1
    // occuperebbe ancora la colonna -1 (colonna 1 della nuova forma piena) → kick.
    s = ruota(s)
    expect(s.tessera?.x).toBe(0)
  })

  it('niente kick disponibile: rotazione rifiutata (stato invariato)', () => {
    // T (forma 2×3) in basso a sinistra; la forma ruotata 3×2 occupa le
    // colonne x e x+1: J in (0,19), (1,19) e (3,17) chiudono tutti gli
    // offset [0, -1, 1, -2, 2] (±1/±2 su x negativo o contro le J).
    const g = grigliaVuota()
    g[19 * COLONNE + 0] = 'J'
    g[19 * COLONNE + 1] = 'J'
    g[17 * COLONNE + 3] = 'J'
    const s = {
      ...statoT(),
      griglia: g,
      tessera: { id: 'T' as IdTessera, forma: [[1, 1, 0], [0, 1, 1]], x: 0, y: 17 },
    }
    expect(ruota(s)).toBe(s)
  })
})

describe('softDrop / tick / ghost', () => {
  it('softDrop: scende di 1, +1 punto', () => {
    const s = softDrop(statoT())
    expect(s.tessera?.y).toBe(1)
    expect(s.punti).toBe(PUNTI_SOFT_DROP)
  })

  it('softDrop a terra: non scende, nessun punto (torna al tick)', () => {
    const s = softDrop({ ...statoT(), tessera: { ...statoT().tessera!, y: RIGHE - 2 } })
    expect(s.tessera?.y).toBe(RIGHE - 2)
    expect(s.punti).toBe(0)
  })

  it('tick: scende di 1, nessun punto', () => {
    const s = tick(statoT())
    expect(s.tessera?.y).toBe(1)
    expect(s.punti).toBe(0)
  })

  it('ghost: profondità fino alla collisione', () => {
    expect(ghost(statoT())).toBe(18) // T (altezza 2) da y=0 fino a y=18
    const piena = grigliaVuota()
    for (let x = 0; x < COLONNE; x++) piena[18 * COLONNE + x] = 'J'
    expect(ghost({ ...statoT(), griglia: piena })).toBe(16)
  })

  it('tick a terra: lock + linee + bag', () => {
    // T a y=18 (a terra su griglia vuota): il tick la locka.
    const s = tick({ ...statoT(), tessera: { ...statoT().tessera!, y: 18 } })
    expect(s.tessera?.id).toBe('I') // spawnata bag[0]
    expect(s.bag).toEqual([])
    expect(s.griglia[19 * COLONNE + 4]).toBe('T') // cella (4,19)
  })

  it('lock sulla riga 20: le linee si puliscono prima del block out', () => {
    // Pila alta: righe 0-16 piene di J tranne la colonna 5; riga 17 piena di J
    // tranne la colonna 4; riga 18 piena di J tranne 3,4,5; riga 19 piena di J
    // tranne la colonna 3. T (2×3) a x=3, y=17: celle (4,17), (3,18), (4,18),
    // (5,18). Il tick la locka: le righe 17-18 si completano e si puliscono,
    // la pila scende di 2: spawn in cima sempre possibile (niente block out).
    const g = grigliaVuota()
    for (let y = 0; y < 17; y++) for (let x = 0; x < COLONNE; x++) if (x !== 5) g[y * COLONNE + x] = 'J'
    for (let x = 0; x < COLONNE; x++) if (x !== 4) g[17 * COLONNE + x] = 'J'
    for (const x of [0, 1, 2, 6, 7, 8, 9]) g[18 * COLONNE + x] = 'J'
    for (const x of [0, 1, 2, 4, 5, 6, 7, 8, 9]) g[19 * COLONNE + x] = 'J'
    const s = tick({ ...statoT(), griglia: g, tessera: { id: 'T', forma: FORME.T, x: 3, y: 17 }, bag: ['I', 'O'] })
    expect(s.linee).toBe(2)
    expect(s.livello).toBe(1)
    expect(s.fine).toBe(false)
    expect(s.griglia[19 * COLONNE + 4]).toBe('J') // la riga 19 (tranne col 3) resta in fondo
    expect(s.griglia[18 * COLONNE + 3]).toBe('J') // J delle righe 0-16 scese di 2
    expect(s.tessera?.id).toBe('I') // spawn in cima dopo il clear
  })

  it('punti linee: 1/2/3/4 linee = 100/300/500/800 × livello', () => {
    const statoBase = (): StatoTetris => ({ ...statoT(), bag: ['I', 'O', 'T'] })
    for (const n of [1, 2, 3, 4] as const) {
      const s = lockConLinee(n, statoBase())
      expect(s.punti).toBe(PUNTI_LINIE[n])
    }
    // livello 2: tutto × 2
    const s = lockConLinee(4, { ...statoT(), livello: 2, bag: ['I', 'O', 'T'] })
    expect(s.punti).toBe(PUNTI_LINIE[4] * 2)
  })

  it('livello sale ogni 10 linee e cambia l\'intervallo', () => {
    expect(intervalloGravita(1)).toBe(800)
    expect(intervalloGravita(2)).toBe(730)
    expect(intervalloGravita(11)).toBe(100) // floor: 800-700=100
    expect(intervalloGravita(12)).toBe(100) // mai sotto il minimo
    // 9 linee + 4 in un colpo = 13 → livello 2
    const s = lockConLinee(4, { ...statoT(), linee: 9, bag: ['I', 'O', 'T'] })
    expect(s.livello).toBe(2)
  })
})

describe('hardDrop', () => {
  it('cade fino al ghost, +2/cella, lock immediato', () => {
    const s = hardDrop(statoT()) // ghost = 18 → 18 celle × 2 = 36
    expect(s.punti).toBe(18 * PUNTI_HARD_DROP)
    expect(s.tessera?.id).toBe('I') // spawnata dal bag
    expect(s.griglia[19 * COLONNE + 4]).toBe('T')
  })

  it('a terra: 0 punti, lock immediato', () => {
    const s = hardDrop({ ...statoT(), tessera: { ...statoT().tessera!, y: 18 } })
    expect(s.punti).toBe(0)
    expect(s.tessera?.id).toBe('I')
  })

  it('tessera null: no-op', () => {
    const vuoto = { ...statoT(), tessera: null }
    expect(hardDrop(vuoto).tessera).toBeNull()
  })
})

// Helper di test: `n` righe quasi piene in fondo (foro in colonna 4);
// la I verticale (1×4) è già alla posizione di atterraggio, quindi il
// hard drop ha d=0 (niente punti drop) e completa esattamente n righe.
function lockConLinee(n: 1 | 2 | 3 | 4, base: StatoTetris): StatoTetris {
  const g = grigliaVuota()
  for (let y = RIGHE - n; y < RIGHE; y++) for (let x = 0; x < COLONNE; x++) if (x !== 4) g[y * COLONNE + x] = 'J'
  const iVert: StatoTetris = {
    ...base,
    griglia: g,
    tessera: { id: 'I', forma: [[1], [1], [1], [1]], x: 4, y: RIGHE - n },
  }
  return hardDrop(iVert)
}
