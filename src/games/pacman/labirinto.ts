// Labirinto Pac-Man: griglia 28×31 (layout classico Namco 1980) + helper tile.
// Mappa in formato testo: #=muro .=pellet o=power " "=passo T=tunnel D=porta C=casa.
// La griglia è simmetrica allo specchio (colonna c ↔ 27-c).

export type Tile = 'muro' | 'passo' | 'pellet' | 'power' | 'porta' | 'casa' | 'tunnel'

export type Direzione = 'su' | 'giu' | 'sx' | 'dx'

export const COLONNE = 28
export const RIGHE = 31

const MAPPA: readonly string[] = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o#  #.#   #.##.#   #.#  #o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###DD### ##.#     ',
  '######.## #CCCCCC# ##.######',
  'T     .   #CCCCCC#   .     T',
  '######.## #CCCCCC# ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
]

const CODICI: Record<string, Tile> = {
  '#': 'muro',
  '.': 'pellet',
  o: 'power',
  ' ': 'passo',
  T: 'tunnel',
  D: 'porta',
  C: 'casa',
}

// Griglia iniziale (con pellet e power).
export function creaLabirinto(): Tile[][] {
  return MAPPA.map((riga) => [...riga].map((ch) => CODICI[ch] ?? 'muro'))
}

// Tile a una posizione (fuori griglia → 'muro').
export function tileAt(lab: Tile[][], col: number, riga: number): Tile {
  if (riga < 0 || riga >= RIGHE || col < 0 || col >= COLONNE) return 'muro'
  return lab[riga][col]
}

// Pac-Man può passare? (non muro, non porta, non casa)
export function pacmanPuPassare(lab: Tile[][], col: number, riga: number): boolean {
  const t = tileAt(lab, col, riga)
  return t !== 'muro' && t !== 'porta' && t !== 'casa'
}

// Ghost può passare? (non muro; porta/casa/tunnel ok)
export function ghostPuPassare(lab: Tile[][], col: number, riga: number): boolean {
  return tileAt(lab, col, riga) !== 'muro'
}

const SPOSTAMENTO: Record<Direzione, { dcol: number; drow: number }> = {
  su: { dcol: 0, drow: -1 },
  giu: { dcol: 0, drow: 1 },
  sx: { dcol: -1, drow: 0 },
  dx: { dcol: 1, drow: 0 },
}

const ORDI: readonly Direzione[] = ['su', 'giu', 'sx', 'dx']

// Direzioni disponibili da una posizione per un dato attore.
export function direzioniDisponibili(lab: Tile[][], col: number, riga: number, eGhost: boolean): Direzione[] {
  const passa = eGhost ? ghostPuPassare : pacmanPuPassare
  return ORDI.filter((d) => passa(lab, col + SPOSTAMENTO[d].dcol, riga + SPOSTAMENTO[d].drow))
}

const OPPOSTA: Record<Direzione, Direzione> = {
  su: 'giu',
  giu: 'su',
  sx: 'dx',
  dx: 'sx',
}

// È un crossroad? (≥ 2 direzioni disponibili escluse l'invertita di quella corrente,
// cioè ≥ 3 vie totali considerando anche quella da cui si viene).
export function èCrossroad(lab: Tile[][], col: number, riga: number, dirCorrente: Direzione, eGhost: boolean): boolean {
  const avanti = direzioniDisponibili(lab, col, riga, eGhost).filter((d) => d !== OPPOSTA[dirCorrente])
  return avanti.length >= 2
}

// Posizioni chiave (layout classico).
export const PACMAN_START = { col: 13, riga: 23 } as const
export const GHOST_HOUSE = { col: 13, riga: 14 } as const
// Varco della porta (tile sinistro; il varco completo è (13,12)-(14,12)).
export const GHOST_DOOR = { col: 13, riga: 12 } as const
export const POWER_POSIZIONI: ReadonlyArray<{ col: number; riga: number }> = [
  { col: 1, riga: 3 },
  { col: 26, riga: 3 },
  { col: 1, riga: 23 },
  { col: 26, riga: 23 },
]
export const FRUTTA_POSIZIONE = { col: 13, riga: 17 } as const
export const TUNNEL_RIGA = 14
