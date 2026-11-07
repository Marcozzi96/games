// Logica pura del 2048: griglia 4×4, slide + fusione (una volta per tessera
// per mossa), spawn 90% 2 / 10% 4 solo se la mossa cambia la griglia.
// Nessun import dalla shell: RNG iniettato per i test (default Math.random).

export const LATI = 4

export type Direzione = 'su' | 'giu' | 'sx' | 'dx'

export type Stato2048 = {
  griglia: number[][] // [riga][colonna], 0 = vuota; riga 0 = alto
  punti: number
  finita: boolean
  giàVinto: boolean
}

const vuoto = (): number[][] =>
  Array.from({ length: LATI }, () => Array(LATI).fill(0))

const celleLibere = (g: number[][]): Array<[number, number]> => {
  const libere: Array<[number, number]> = []
  for (let r = 0; r < LATI; r++)
    for (let c = 0; c < LATI; c++)
      if (g[r][c] === 0) libere.push([r, c])
  return libere
}

// Spawn: 1 valore di rng per la tessera (90% 2 / 10% 4) + 1 per la cella
// libera (uniforme, ordine riga-maggiorante).
const spawn = (g: number[][], rng: () => number): void => {
  const valore = rng() < 0.9 ? 2 : 4
  const libere = celleLibere(g)
  if (libere.length === 0) return
  const [r, c] = libere[Math.floor(rng() * libere.length)]
  g[r][c] = valore
}

export function creaStato(rng: () => number = Math.random): Stato2048 {
  const griglia = vuoto()
  spawn(griglia, rng)
  spawn(griglia, rng)
  return { griglia, punti: 0, finita: false, giàVinto: false }
}

// Compatta e fonde una linea (già orientata verso il bordo): ogni tessera si
// fonde al massimo una volta per mossa.
const scorri = (linea: number[]): { nuova: number[]; punti: number } => {
  const tessere = linea.filter((v) => v !== 0)
  const nuova: number[] = []
  let punti = 0
  let fusa = false
  for (const t of tessere) {
    const ultima = nuova[nuova.length - 1]
    if (ultima === t && !fusa) {
      nuova[nuova.length - 1] = t * 2
      punti += t * 2
      fusa = true
    } else {
      nuova.push(t)
      fusa = false
    }
  }
  while (nuova.length < LATI) nuova.push(0)
  return { nuova, punti }
}

export function muovi(
  stato: Stato2048,
  dir: Direzione,
  rng: () => number = Math.random,
): { stato: Stato2048; cambiato: boolean } {
  if (stato.finita) return { stato, cambiato: false }

  const vecchia = stato.griglia
  const griglia = vecchia.map((riga) => [...riga])
  let puntiFuse = 0

  for (let i = 0; i < LATI; i++) {
    let linea: number[]
    if (dir === 'sx') linea = griglia[i]
    else if (dir === 'dx') linea = [...griglia[i]].reverse()
    else if (dir === 'su') linea = griglia.map((riga) => riga[i])
    else linea = griglia.map((riga) => riga[i]).reverse()

    const { nuova, punti } = scorri(linea)
    puntiFuse += punti

    for (let j = 0; j < LATI; j++) {
      if (dir === 'sx') griglia[i][j] = nuova[j]
      else if (dir === 'dx') griglia[i][LATI - 1 - j] = nuova[j]
      else if (dir === 'su') griglia[j][i] = nuova[j]
      else griglia[LATI - 1 - j][i] = nuova[j]
    }
  }

  const cambiato = griglia.some((riga, r) => riga.some((v, c) => v !== vecchia[r][c]))
  if (cambiato) spawn(griglia, rng)

  return {
    stato: {
      griglia,
      punti: stato.punti + puntiFuse,
      finita: grigliaPiena(griglia) && !ciSonoMosse(griglia),
      giàVinto:
        stato.giàVinto || (griglia.flat().includes(2048) && !vecchia.flat().includes(2048)),
    },
    cambiato,
  }
}

export function grigliaPiena(g: number[][]): boolean {
  return g.flat().every((v) => v !== 0)
}

export function ciSonoMosse(g: number[][]): boolean {
  if (g.flat().some((v) => v === 0)) return true
  for (let r = 0; r < LATI; r++) {
    for (let c = 0; c < LATI; c++) {
      if (c + 1 < LATI && g[r][c] === g[r][c + 1]) return true
      if (r + 1 < LATI && g[r][c] === g[r + 1][c]) return true
    }
  }
  return false
}
