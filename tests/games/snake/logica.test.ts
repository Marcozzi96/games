import { describe, it, expect } from 'vitest'
import {
  COLONNE, RIGHE, PUNTI_PER_CIBO, INTERVALLO_INIZIALE, INTERVALLO_MINIMO,
  creaStato, gira, tick, ciboRandom,
} from '@/games/snake/logica'
import type { StatoSnake } from '@/games/snake/logica'

// RNG deterministico in [0,1): 0, 0.9, 0, 0.9, … (sequenza condivisa tra i
// test: ogni `creaStato`/`tick` che mangia consuma l'indice successivo).
const casualFissa = (() => {
  const valori = [0, 0.9]
  let i = 0
  return () => valori[i++ % valori.length]
})()

// Stato di prova: testa in (9,12) verso destra, corpo a sinistra, cibo a destra.
const statoBase = (): StatoSnake => ({
  serpente: [{ x: 9, y: 12 }, { x: 8, y: 12 }, { x: 7, y: 12 }],
  direzione: 'dx',
  coda: [],
  cibo: { x: 15, y: 12 },
  punti: 0,
  intervallo: INTERVALLO_INIZIALE,
  finita: false,
})

describe('creaStato', () => {
  it('parte con 3 celle al centro, direzione dx, 0 punti, 140 ms', () => {
    const s = creaStato(casualFissa)
    expect(s.serpente).toEqual([{ x: 9, y: 12 }, { x: 8, y: 12 }, { x: 7, y: 12 }])
    expect(s.direzione).toBe('dx')
    expect(s.coda).toEqual([])
    expect(s.punti).toBe(0)
    expect(s.intervallo).toBe(140)
    expect(s.finita).toBe(false)
  })

  it('posa il cibo su una cella libera usando l\'RNG fornito (0.9 → (11,21))', () => {
    // 2ª chiamata → 0.9; 429 libere: floor(0.9*429)=386 → 387ª libera = 389
    // (saltate le 3 occupate 223-225) → (11,21)
    const s = creaStato(casualFissa)
    expect(s.cibo).toEqual({ x: 11, y: 21 })
    expect(s.serpente.some((c) => c.x === 11 && c.y === 21)).toBe(false)
  })
})

describe('gira', () => {
  it('accoda una direzione valida (max 3, niente duplicati consecutivi)', () => {
    const s = gira(gira(gira(statoBase(), 'su'), 'sx'), 'giu')
    expect(s.coda).toEqual(['su', 'sx', 'giu'])
    expect(gira(s, 'dx').coda).toEqual(['su', 'sx', 'giu']) // coda piena: scartato
  })

  it('scarta l\'opposta della direzione effettiva (ultima in coda o corrente)', () => {
    const s = gira(statoBase(), 'su')
    expect(gira(s, 'giu').coda).toEqual(['su']) // opposta di 'su' in coda
    const d = gira(statoBase(), 'dx')
    expect(d.coda).toEqual([]) // 'dx' è già la direzione corrente
  })

  it('ignora i comandi non direzionali', () => {
    expect(gira(statoBase(), 'conferma').coda).toEqual([])
    expect(gira(statoBase(), 'punta' as StatoSnake['direzione']).coda).toEqual([])
  })

  it('non cambia la direzione corrente: cambia solo al tick', () => {
    expect(gira(statoBase(), 'su').direzione).toBe('dx')
  })
})

describe('tick', () => {
  it('avanza la testa nella direzione corrente', () => {
    const s = tick(statoBase())
    expect(s.serpente[0]).toEqual({ x: 10, y: 12 })
    expect(s.serpente).toHaveLength(3)
  })

  it('applica la coda: ogni tick consuma un comando', () => {
    const s = tick(gira(statoBase(), 'su'))
    expect(s.direzione).toBe('su')
    expect(s.serpente[0]).toEqual({ x: 9, y: 11 })
  })

  it('muro: testa fuori griglia → finita, serpente immobile', () => {
    const s = tick({ ...statoBase(), serpente: [{ x: COLONNE - 1, y: 0 }, { x: COLONNE - 2, y: 0 }] })
    expect(s.finita).toBe(true)
    expect(s.serpente[0]).toEqual({ x: COLONNE - 1, y: 0 })
    expect(tick(s).serpente[0]).toEqual({ x: COLONNE - 1, y: 0 }) // tick dopo la fine: no-op
  })

  it('auto-collisione: testa su una cella del corpo → finita', () => {
    // A U: la testa in (5,5) va in (4,5), occupata dal corpo (non la coda (4,6))
    const s = tick({
      ...statoBase(),
      serpente: [
        { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 5, y: 4 },
        { x: 4, y: 4 }, { x: 4, y: 5 }, { x: 4, y: 6 },
      ],
      direzione: 'sx',
    })
    expect(s.finita).toBe(true)
  })

  it('cibo: cresce di 1, +10 punti, intervallo −5 ms, nuovo cibo dall\'RNG (0 → (0,0))', () => {
    // cibo sotto il prossimo passo della testa; 3ª chiamata RNG → 0
    const s = tick({ ...statoBase(), cibo: { x: 10, y: 12 } }, casualFissa)
    expect(s.serpente).toHaveLength(4)
    expect(s.punti).toBe(PUNTI_PER_CIBO)
    expect(s.intervallo).toBe(135)
    expect(s.cibo).toEqual({ x: 0, y: 0 })
  })

  it('intervallo mai sotto il minimo', () => {
    let s: StatoSnake = { ...statoBase(), intervallo: INTERVALLO_MINIMO, cibo: { x: 10, y: 12 } }
    s = tick(s)
    expect(s.intervallo).toBe(INTERVALLO_MINIMO)
  })

  it('soda: il cibo non spawn mai sulla serpente (RNG dedicato 0.9 → (11,21))', () => {
    // RNG dedicato (non la sequenza condivisa): 428 libere dopo il pasto,
    // floor(0.9*428)=385 → 386ª libera = 389 (saltate le 4 occupate 223-226)
    // → (11,21), non occupato dalla serpente.
    const s = tick({ ...statoBase(), cibo: { x: 10, y: 12 } }, () => 0.9)
    expect(s.cibo).toEqual({ x: 11, y: 21 })
    expect(s.serpente.some((c) => c.x === 11 && c.y === 21)).toBe(false)
  })

  it('griglia piena → finita senza cercare cibo (vittoria)', () => {
    // 431 celle: l'unica libera (10,12) è il cibo; la testa ci arriva, mangia
    // e completa la griglia → vittoria, senza chiamare ciboRandom.
    const celle: StatoSnake['serpente'] = [{ x: 9, y: 12 }]
    for (let y = 0; y < RIGHE; y++) for (let x = 0; x < COLONNE; x++) {
      if (x === 10 && y === 12 || x === 9 && y === 12) continue
      celle.push({ x, y })
    }
    const piena = { ...statoBase(), serpente: celle, cibo: { x: 10, y: 12 } }
    const s = tick(piena)
    expect(s.finita).toBe(true)
    expect(s.serpente).toHaveLength(COLONNE * RIGHE)
  })
})

describe('ciboRandom', () => {
  it('usa l\'RNG per scegliere tra le celle libere (0.9, 429 libere) → (11,21)', () => {
    // floor(0.9*429)=386 → 387ª libera = 389 (saltate le 3 occupate 223-225)
    expect(ciboRandom(statoBase(), () => 0.9)).toEqual({ x: 11, y: 21 })
  })
})
