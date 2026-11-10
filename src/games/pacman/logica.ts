// Logica di gioco Pac-Man: stato puro + tick. Movimento sub-tile, collisioni,
// scoring, frutta, fasi scatter/chase, livelli. Immutabile (pattern snake):
// creaStato/comando/tick restituiscono uno stato NUOVO senza mutare l'input.

import type { Tile, Direzione } from './labirinto'
import {
  COLONNE,
  TUNNEL_RIGA,
  PACMAN_START,
  GHOST_HOUSE,
  GHOST_DOOR,
  FRUTTA_POSIZIONE,
  creaLabirinto,
  tileAt,
  pacmanPuPassare,
  ghostPuPassare,
  èCrossroad,
} from './labirinto'
import type { Fantasma, StatoFantasma } from './fantasmi'
import {
  VEL_BASE,
  VEL_SCATTER,
  VEL_SPAAVENTATO,
  VEL_OCCHIO,
  creaFantasmi,
  targetFantasma,
  scegliDirezione,
} from './fantasmi'

export type Frutto = {
  tipo: number // 0..7
  punti: number
  timer: number // secondi rimanenti
}

export type StatoPacman = {
  pacman: {
    col: number
    riga: number
    dir: Direzione
    dirPrevista: Direzione | null
    progresso: number // 0..1 (avanzamento tra tile)
  }
  fantasmi: Fantasma[]
  labirinto: Tile[][]
  pelletTotali: number
  pelletMangiati: number
  punti: number
  vite: number
  livello: number
  catena: number
  frutto: Frutto | null
  timerModa: number
  indiceModa: number // 0..7
  timerSpaventati: number
  statoFase: 'gioco' | 'morte' | 'reset' | 'fine'
  timerFase: number
  extraVitaData: boolean
}

// Costanti di gioco.
export const VITE_INIZIALI = 3
export const PUNTI_PELLET = 10
export const PUNTI_POWER = 50
export const PUNTI_GHOST_BASE = 200
export const PUNTI_EXTRA_VITA = 7000
export const LIVELLO_MAX = 99
export const FRUTTA_PUNTI: readonly [100, 300, 500, 700, 1000, 2000, 3000, 5000] = [
  100, 300, 500, 700, 1000, 2000, 3000, 5000,
]

const SPOSTAMENTO: Record<Direzione, { dcol: number; drow: number }> = {
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

// Velocità Pac-Man al livello corrente (tile/s).
export function velPacman(livello: number): number {
  return Math.min(10, 8 + (livello - 1) * 0.25)
}

// Velocità ghost al livello corrente (tile/s). RULING: la spec è silente sul
// scaling dei ghost; curva dolce dal VEL_BASE (8) con cap 10 come Pac-Man.
export function velGhost(livello: number): number {
  return Math.min(10, VEL_BASE + (livello - 1) * 0.1)
}

// Durata frightened al livello corrente (secondi).
export function durataSpaventati(livello: number): number {
  return Math.max(2, 6 - (livello - 1) * 0.5)
}

// Durata scatter al livello corrente (secondi); da 7 in poi lo scatter è eliminato.
export function durataScatter(livello: number): number {
  return Math.max(0, 7 - (livello - 1) * 1.5)
}

// Destinazione (col,riga) + attraversabilità di un passo nella direzione dir,
// con wrap del tunnel (riga 14: col fuori griglia → wrap).
type Passabile = (col: number, riga: number) => boolean
function prossimoTile(col: number, riga: number, dir: Direzione, passabile: Passabile): { col: number; riga: number; ok: boolean } {
  const sp = SPOSTAMENTO[dir]
  let nc = col + sp.dcol
  const nr = riga + sp.drow
  if (nr === TUNNEL_RIGA) {
    if (nc < 0) nc = COLONNE - 1
    else if (nc >= COLONNE) nc = 0
  }
  return { col: nc, riga: nr, ok: passabile(nc, nr) }
}

// Contatore pellet+power nel labirinto.
function contaPellet(lab: Tile[][]): number {
  let n = 0
  for (const riga of lab) for (const t of riga) if (t === 'pellet' || t === 'power') n++
  return n
}

// Clona lo stato in modo profondo-così-come-bisogna (pacman, fantasmi, labirinto, frutto).
function clona(s: StatoPacman): StatoPacman {
  return {
    ...s,
    pacman: { ...s.pacman },
    fantasmi: s.fantasmi.map((g) => ({ ...g })),
    labirinto: s.labirinto.map((riga) => [...riga]),
    frutto: s.frutto ? { ...s.frutto } : null,
  }
}

// Crea lo stato iniziale per un dato livello.
export function creaStato(livello = 1, casual: () => number = Math.random): StatoPacman {
  const labirinto = creaLabirinto()
  return {
    pacman: { col: PACMAN_START.col, riga: PACMAN_START.riga, dir: 'sx', dirPrevista: null, progresso: 0 },
    fantasmi: creaFantasmi(livello),
    labirinto,
    pelletTotali: contaPellet(labirinto),
    pelletMangiati: 0,
    punti: 0,
    vite: VITE_INIZIALI,
    livello,
    catena: 0,
    frutto: null,
    timerModa: durataScatter(livello),
    indiceModa: 0,
    timerSpaventati: 0,
    statoFase: 'gioco',
    timerFase: 0,
    extraVitaData: false,
  }
}

// Gestisce un comando direzionale (buffer): dirPrevista = dir (anche invert).
export function comando(stato: StatoPacman, dir: Direzione): StatoPacman {
  const s = clona(stato)
  s.pacman.dirPrevista = dir
  return s
}

// Avanza il gioco di dt secondi.
export function tick(stato: StatoPacman, dt: number, casual: () => number = Math.random): StatoPacman {
  const s = clona(stato)

  // 1. Fasi non-gioco: countdown timerFase + transizioni.
  if (s.statoFase !== 'gioco') {
    s.timerFase -= dt
    if (s.timerFase <= 0) {
      if (s.statoFase === 'morte') {
        if (s.vite <= 0) {
          s.statoFase = 'fine'
          s.timerFase = 0
        } else {
          // RULING: la morte fa solo reset posizioni (stesso livello, stesso labirinto).
          resetPosizioni(s)
          s.statoFase = 'gioco'
          s.timerFase = 0
        }
      } else if (s.statoFase === 'reset') {
        // Vittoria livello: rigenera labirinto + posizioni (livello++ già fatto al trigger).
        const lab = creaLabirinto()
        s.labirinto = lab
        s.pelletTotali = contaPellet(lab)
        s.pelletMangiati = 0
        s.frutto = null
        s.catena = 0
        resetPosizioni(s)
        s.statoFase = 'gioco'
        s.timerFase = 0
      }
      // 'fine' resta in 'fine' (il Task 4 chiama invia.fine).
    }
    return s
  }

  // 2. Avanza Pac-Man.
  muoviPacman(s, dt)

  // 3. Avanza ogni fantasma.
  for (const g of s.fantasmi) muoviFantasma(s, g, dt, casual)

  // 4. Collisioni Pac-Man/ghost (dopo movimento, stesso tick).
  gestisciCollisioni(s)

  // 5. Timer globali: moda (fasi), spaventati, frutta.
  aggiornaTimer(s, dt)

  // 6. Vittoria livello.
  if (s.statoFase === 'gioco' && s.pelletMangiati >= s.pelletTotali) {
    s.statoFase = 'reset'
    s.timerFase = 2
    s.livello = Math.min(LIVELLO_MAX, s.livello + 1)
  }

  // 7. Extra vita.
  if (s.statoFase === 'gioco' && s.punti >= PUNTI_EXTRA_VITA && !s.extraVitaData) {
    s.vite += 1
    s.extraVitaData = true
  }

  // 8. Game over alla vita finale: gestito dalla transizione timerFase (step 1),
  //    DOPO l'animazione di morte (spec riga 205/235: 2s di shrink poi game over
  //    se vite=0). Nessun trigger immediato qui: convertirlo nello stesso tick
  //    della morte saltrebbe l'animazione. (Ruling su difetto del piano.)

  return s
}

// Avanza Pac-Man (velocità dipendente dal livello) con consumo di dirPrevista
// al confine di tile, wrap tunnel e consumo pellet/power/frutta.
function muoviPacman(s: StatoPacman, dt: number): void {
  const p = s.pacman
  const passabile: Passabile = (c, r) => pacmanPuPassare(s.labirinto, c, r)
  p.progresso += velPacman(s.livello) * dt
  let guard = 0
  while (p.progresso >= 1 && guard < 16) {
    guard++
    // Applica la svolta bufferizzata (dirPrevista) se il tile nella nuova
    // direzione è attraversabile e non è l'invertito.
    let dir = p.dir
    if (p.dirPrevista !== null && p.dirPrevista !== OPPOSTA[p.dir]) {
      const d = prossimoTile(p.col, p.riga, p.dirPrevista, passabile)
      if (d.ok) dir = p.dirPrevista
    }
    const dest = prossimoTile(p.col, p.riga, dir, passabile)
    if (!dest.ok) {
      p.progresso = 0 // fermo al confine
      break
    }
    p.col = dest.col
    p.riga = dest.riga
    p.dir = dir
    p.progresso -= 1
    if (dir === p.dirPrevista) p.dirPrevista = null
    // Consumo al tile di arrivo.
    const t = tileAt(s.labirinto, p.col, p.riga)
    if (t === 'pellet') {
      s.labirinto[p.riga][p.col] = 'passo'
      s.pelletMangiati++
      s.punti += PUNTI_PELLET
      forseFrutta(s)
    } else if (t === 'power') {
      s.labirinto[p.riga][p.col] = 'passo'
      s.pelletMangiati++
      s.punti += PUNTI_POWER
      s.timerSpaventati = durataSpaventati(s.livello)
      s.catena = 0
      for (const g of s.fantasmi) if (g.stato === 'attivo' || g.stato === 'uscita') g.stato = 'spaventato'
    } else if (t === 'passo') {
      // Frutta (spawna su un tile passo): la mangia passando sopra.
      if (s.frutto !== null && p.col === FRUTTA_POSIZIONE.col && p.riga === FRUTTA_POSIZIONE.riga) {
        s.punti += s.frutto.punti
        s.frutto = null
      }
    }
  }
}

// Avanza un fantasma (velocità per stato) con wrap tunnel, casa→uscita→attivo,
// occhio→casa, scelta direzione ai crossroad e wall-collision.
function muoviFantasma(s: StatoPacman, g: Fantasma, dt: number, casual: () => number): void {
  const lab = s.labirinto
  const passabile: Passabile = (c, r) => ghostPuPassare(lab, c, r)
  const modalità: 'scatter' | 'chase' = s.indiceModa % 2 === 0 ? 'scatter' : 'chase'

  if (g.stato === 'casa') {
    g.timerCasa -= dt
    if (g.timerCasa <= 0) {
      g.stato = 'uscita'
      g.dir = 'su'
      g.col = GHOST_HOUSE.col
      g.riga = GHOST_HOUSE.riga
      g.progresso = 0
    }
    return
  }

  // Velocità per stato (Step 4).
  let vel: number
  if (g.stato === 'occhio') vel = VEL_OCCHIO
  else if (g.stato === 'spaventato') vel = VEL_SPAAVENTATO
  else if (g.stato === 'uscita') vel = 1
  else vel = modalità === 'scatter' ? VEL_SCATTER : velGhost(s.livello)

  g.progresso += vel * dt
  let guard = 0
  while (g.progresso >= 1 && guard < 16) {
    guard++
    const dest = prossimoTile(g.col, g.riga, g.dir, passabile)
    if (!dest.ok) {
      // Wall: inverti se possibile, altrimenti fermati al confine.
      const inv = OPPOSTA[g.dir]
      const dInv = prossimoTile(g.col, g.riga, inv, passabile)
      if (dInv.ok) g.dir = inv
      else {
        g.progresso = 0
        break
      }
      continue
    }
    g.col = dest.col
    g.riga = dest.riga
    g.progresso -= 1

    if (g.stato === 'uscita') {
      if (g.col === GHOST_DOOR.col && g.riga === GHOST_DOOR.riga - 1) {
        g.stato = 'attivo'
        g.progresso = 0
      }
      continue
    }
    if (g.stato === 'occhio') {
      if (g.col === GHOST_HOUSE.col && g.riga === GHOST_HOUSE.riga) {
        g.stato = 'casa'
        g.timerCasa = 0
        g.progresso = 0
      }
      continue
    }
    // 'attivo' o 'spaventato': scelta direzione ai crossroad.
    if (èCrossroad(lab, g.col, g.riga, g.dir, true)) {
      let target: { col: number; riga: number }
      if (g.stato === 'spaventato') target = { col: 0, riga: 0 }
      else {
        const blinky = s.fantasmi[0]
        const pm = { col: s.pacman.col, riga: s.pacman.riga, dir: s.pacman.dir }
        target = targetFantasma(g, pm, blinky, modalità)
      }
      g.dir = scegliDirezione(g, lab, target, casual)
    }
  }
}

// Collisioni Pac-Man/ghost: stessa tile oppure scambio di tile.
function gestisciCollisioni(s: StatoPacman): void {
  const p = s.pacman
  for (const g of s.fantasmi) {
    if (g.stato === 'casa' || g.stato === 'occhio') continue
    // Stessa tile oppure swap (Pac-Man va in A e ghost in B, e viceversa).
    const stessa = g.col === p.col && g.riga === p.riga
    const dP = SPOSTAMENTO[p.dir]
    const dG = SPOSTAMENTO[g.dir]
    const swap = p.col + dP.dcol === g.col && p.riga + dP.drow === g.riga &&
      g.col + dG.dcol === p.col && g.riga + dG.drow === p.riga
    if (!stessa && !swap) continue

    if (g.stato === 'attivo') {
      s.vite--
      if (s.vite < 0) {
        s.statoFase = 'fine'
        s.timerFase = 0
      } else {
        s.statoFase = 'morte'
        s.timerFase = 2
      }
      return
    }
    if (g.stato === 'spaventato') {
      s.punti += PUNTI_GHOST_BASE * 2 ** s.catena
      s.catena++
      g.stato = 'occhio'
      g.col = GHOST_HOUSE.col
      g.riga = GHOST_HOUSE.riga
      g.dir = 'su'
      g.progresso = 0
    }
  }
}

// Spawn frutta: esatta soglia di pellet (70, 170) e frutto ancora assente.
function forseFrutta(s: StatoPacman): void {
  if (s.frutto === null && (s.pelletMangiati === 70 || s.pelletMangiati === 170)) {
    const tipo = (s.livello - 1) % 8
    s.frutto = { tipo, punti: FRUTTA_PUNTI[tipo], timer: 9.9 }
  }
}

// Timer globali: fasi scatter/chase (8), frightened, frutta.
function aggiornaTimer(s: StatoPacman, dt: number): void {
  // 5a. Fasi scatter/chase.
  s.timerModa -= dt
  if (s.timerModa <= 0) {
    if (s.indiceModa < 7) {
      s.indiceModa++
      const durata = s.indiceModa % 2 === 0 ? durataScatter(s.livello) : 20
      s.timerModa = durata
    } else {
      s.timerModa = 0 // fase 7 = chase infinito
    }
    // I ghost attivi invertono direzione a ogni cambio di fase.
    for (const g of s.fantasmi) if (g.stato === 'attivo') g.dir = OPPOSTA[g.dir]
  }

  // 5b. Frightened.
  if (s.timerSpaventati > 0) {
    s.timerSpaventati -= dt
    if (s.timerSpaventati <= 0) {
      s.timerSpaventati = 0
      s.catena = 0
      for (const g of s.fantasmi) if (g.stato === 'spaventato') g.stato = 'attivo'
    }
  }

  // 5c. Frutta.
  if (s.frutto !== null) {
    s.frutto.timer -= dt
    if (s.frutto.timer <= 0) s.frutto = null
  }
}

// Reset posizioni (Pac-Man + fantasmi) dopo una morte: stesso livello, stesso labirinto.
function resetPosizioni(s: StatoPacman): void {
  s.pacman = { col: PACMAN_START.col, riga: PACMAN_START.riga, dir: 'sx', dirPrevista: null, progresso: 0 }
  s.fantasmi = creaFantasmi(s.livello)
  s.catena = 0
  s.timerSpaventati = 0
  s.timerModa = durataScatter(s.livello)
  s.indiceModa = 0
  // La frutta persiste (in Pac-Man reale non sparisce alla morte).
}
