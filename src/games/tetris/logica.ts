// Logica pura del Tetris: stato immutabile + funzioni pure, RNG iniettato.
// Il gioco (tetris.ts) usa solo questo modulo per muovere lo stato.

export type IdTessera = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
export type Forma = number[][] // righe di 0/1, forma corrente
export type Tessera = { id: IdTessera; forma: Forma; x: number; y: number }

export type StatoTetris = {
  griglia: string[] // COLONNE*RIGHE; 'libero' | IdTessera; idx = y*COLONNE+x
  tessera: Tessera | null // null = in attesa del primo input
  bag: IdTessera[] // pezzi in attesa; bag[0] = prossimo (anteprima)
  punti: number
  linee: number
  livello: number
  fine: boolean
}

export const COLONNE = 10
export const RIGHE = 20
export const INTERVALLO_INIZIALE = 800
export const RALLENTAMENTO_PER_LIVELLO = 70
export const INTERVALLO_MINIMO = 100
export const LINEE_PER_LIVELLO = 10
export const PUNTI_LINIE = [0, 100, 300, 500, 800]
export const PUNTI_SOFT_DROP = 1
export const PUNTI_HARD_DROP = 2
export const SOFT_DROP_MS = 150
export const INTERVALLO_SOFT_DROP = 50

export const FORME: Record<IdTessera, Forma> = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
}

export const COLORE_TESSERA: Record<IdTessera, string> = {
  I: '#22d3ee', O: '#facc15', T: '#a78bfa', S: '#4ade80',
  Z: '#f87171', J: '#60a5fa', L: '#fb923c',
}

const ORDI_7: IdTessera[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
const KICKS = [0, -1, 1, -2, 2]

function collisione(griglia: string[], forma: Forma, x: number, y: number): boolean {
  for (let i = 0; i < forma.length; i++) {
    for (let j = 0; j < forma[i].length; j++) {
      if (!forma[i][j]) continue
      const gx = x + j
      const gy = y + i
      if (gx < 0 || gx >= COLONNE || gy < 0 || gy >= RIGHE) return true
      if (griglia[gy * COLONNE + gx] !== 'libero') return true
    }
  }
  return false
}

export function mescolaBag(casual: () => number = Math.random): IdTessera[] {
  // Fisher-Yates forward: con casual() === 0 tutti gli scambi sono no-op
  // (bag invariata), utile per i test deterministici.
  const bag = [...ORDI_7]
  for (let i = 0; i < bag.length; i++) {
    const j = i + Math.floor(casual() * (bag.length - i))
    const tmp = bag[i]
    bag[i] = bag[j]
    bag[j] = tmp
  }
  return bag
}

function ruotaMatrice(f: Forma): Forma {
  const ri = f.length
  const rc = f[0].length
  const rot: Forma = Array.from({ length: rc }, () => Array(ri).fill(0))
  for (let i = 0; i < ri; i++) {
    for (let j = 0; j < rc; j++) {
      rot[j][ri - 1 - i] = f[i][j]
    }
  }
  return rot
}

export function creaStato(casual: () => number = Math.random): StatoTetris {
  return {
    griglia: Array(COLONNE * RIGHE).fill('libero'),
    tessera: null,
    bag: mescolaBag(casual),
    punti: 0,
    linee: 0,
    livello: 1,
    fine: false,
  }
}

// Spawna bag[0] al centro in cima; in collisione → block out (fine).
function spawn(stato: StatoTetris, bag: IdTessera[]): StatoTetris {
  const id = bag[0]
  const forma = FORME[id]
  const x = Math.floor((COLONNE - forma[0].length) / 2)
  const y = 0
  if (collisione(stato.griglia, forma, x, y)) {
    return { ...stato, bag: bag.slice(1), tessera: null, fine: true }
  }
  return { ...stato, bag: bag.slice(1), tessera: { id, forma, x, y } }
}

export function avvia(stato: StatoTetris, casual: () => number = Math.random): StatoTetris {
  if (stato.tessera !== null || stato.fine) return stato
  const bag = stato.bag.length > 0 ? stato.bag : mescolaBag(casual)
  return spawn(stato, bag)
}

export function muovi(stato: StatoTetris, dx: -1 | 1): StatoTetris {
  if (!stato.tessera || stato.fine) return stato
  const { tessera, griglia } = stato
  if (collisione(griglia, tessera.forma, tessera.x + dx, tessera.y)) return stato
  return { ...stato, tessera: { ...tessera, x: tessera.x + dx } }
}

export function ruota(stato: StatoTetris): StatoTetris {
  if (!stato.tessera || stato.fine) return stato
  const { tessera, griglia } = stato
  const nf = ruotaMatrice(tessera.forma)
  for (const off of KICKS) {
    if (!collisione(griglia, nf, tessera.x + off, tessera.y)) {
      return { ...stato, tessera: { id: tessera.id, forma: nf, x: tessera.x + off, y: tessera.y } }
    }
  }
  return stato
}

export function softDrop(stato: StatoTetris): StatoTetris {
  if (!stato.tessera || stato.fine) return stato
  const { tessera, griglia } = stato
  if (collisione(griglia, tessera.forma, tessera.x, tessera.y + 1)) return stato
  return {
    ...stato,
    tessera: { ...tessera, y: tessera.y + 1 },
    punti: stato.punti + PUNTI_SOFT_DROP,
  }
}

export function tick(stato: StatoTetris): StatoTetris {
  if (!stato.tessera || stato.fine) return stato
  const { tessera, griglia } = stato
  if (!collisione(griglia, tessera.forma, tessera.x, tessera.y + 1)) {
    return { ...stato, tessera: { ...tessera, y: tessera.y + 1 } }
  }
  return lock(stato, tessera)
}

export function ghost(stato: StatoTetris): number {
  if (!stato.tessera) return 0
  const { tessera, griglia } = stato
  let d = 0
  while (!collisione(griglia, tessera.forma, tessera.x, tessera.y + d + 1)) d++
  return d
}

export function hardDrop(stato: StatoTetris): StatoTetris {
  if (!stato.tessera || stato.fine) return stato
  const d = ghost(stato)
  const tessera = { ...stato.tessera, y: stato.tessera.y + d }
  return lock({ ...stato, punti: stato.punti + d * PUNTI_HARD_DROP }, tessera)
}

// 1) scrive la tessera in griglia; 2) rimuove le righe piene; 3) punti/linee/livello;
// 4) spawna la tessera successiva dal bag; 5) spawn in collisione → fine.
function lock(stato: StatoTetris, tessera: Tessera): StatoTetris {
  const griglia = stato.griglia.slice()
  tessera.forma.forEach((riga, i) => {
    riga.forEach((v, j) => {
      if (v) griglia[(tessera.y + i) * COLONNE + (tessera.x + j)] = tessera.id
    })
  })

  const restanti: string[] = []
  let rimosse = 0
  for (let y = 0; y < RIGHE; y++) {
    const riga = griglia.slice(y * COLONNE, (y + 1) * COLONNE)
    if (riga.every((c) => c !== 'libero')) rimosse++
    else restanti.push(...riga)
  }
  const nuova = Array(rimosse * COLONNE).fill('libero')
  nuova.push(...restanti)

  const punti = stato.punti + PUNTI_LINIE[rimosse] * stato.livello
  const linee = stato.linee + rimosse
  const livello = Math.floor(linee / LINEE_PER_LIVELLO) + 1
  const bag = stato.bag.length > 0 ? stato.bag : mescolaBag()

  return spawn({ ...stato, griglia: nuova, punti, linee, livello, bag }, bag)
}

export function intervalloGravita(livello: number): number {
  return Math.max(INTERVALLO_MINIMO, INTERVALLO_INIZIALE - (livello - 1) * RALLENTAMENTO_PER_LIVELLO)
}

// --- Controllo touch: "segue il dito" + gettata (throw) -----------------------
// Logica pura del drag orizzontale: converte lo spostamento in px in celle,
// ricordando l'ancora (posizione del dito al momento dell'ultima cella mossa)
// e la direzione dominante, così il gioco può rilanciare il pezzo al rilascio.

export type SegueDito = { ancora: number | undefined; dir: -1 | 1 | undefined }
export const PX_PER_CELLA = 24      // px di spostamento per 1 cella
export const CELLE_GETTA = 6        // distanza massima del throw (oppure il muro)
// Soglie del tocco: sotto VELOCITA_FLIK il gesto è un trascinamento lento (il
// pezzo resta dove l'hai messo); sopra è un flick (gettata/rotazione/hard drop).
// Gli swipe verticali devono anche superare SOGLIA_SWIPE_VERT (più lunghi dei
// movimenti) per evitare rotazioni/hard drop casuali.
export const VELOCITA_FLIK = 0.5    // px/ms: soglia del flick
export const SOGLIA_SWIPE_VERT = 56 // px: lunghezza minima dello swipe verticale

export type AsseSwipe = 'sx' | 'dx' | 'su' | 'giu'
export type EsitoRilascio = 'getta' | 'ruota' | 'hardDrop' | 'nessuno'

// Classifica il gesto al rilascio del dito. `dx`/`dy` = spostamento del dito
// (fine − inizio, px), `durata` = durata del gesto (ms), `asse` = l'asse
// dominante già riconosciuto dal core (swipe-sx/dx/su/giu).
export function classificaRilascio(dx: number, dy: number, durata: number, asse: AsseSwipe): EsitoRilascio {
  const distanza = Math.hypot(dx, dy)
  const veloce = durata > 0 && distanza / durata >= VELOCITA_FLIK
  if (!veloce) return 'nessuno' // trascinamento lento: il pezzo resta
  if (asse === 'sx' || asse === 'dx') return 'getta' // flick orizzontale
  if (Math.abs(dy) < SOGLIA_SWIPE_VERT) return 'nessuno' // verticale troppo corto
  return asse === 'su' ? 'ruota' : 'hardDrop'
}

export function seguiDito(stato: StatoTetris, seg: SegueDito, x: number): { stato: StatoTetris; seg: SegueDito } {
  if (seg.ancora === undefined) return { stato, seg: { ancora: x, dir: seg.dir } }
  let dx = x - seg.ancora
  let ancora = seg.ancora
  let dir = seg.dir
  let s = stato
  while (dx >= PX_PER_CELLA) { s = muovi(s, 1); ancora += PX_PER_CELLA; dx -= PX_PER_CELLA; dir = 1 }
  while (dx <= -PX_PER_CELLA) { s = muovi(s, -1); ancora -= PX_PER_CELLA; dx += PX_PER_CELLA; dir = -1 }
  return { stato: s, seg: { ancora, dir } }
}

// Gettata: sposta la tessera in `dir` finché non sbatte o esaurisce maxCelle.
// È la "traiettoria" che continua dopo il rilascio del dito.
export function getta(stato: StatoTetris, dir: -1 | 1, maxCelle: number = CELLE_GETTA): StatoTetris {
  if (!stato.tessera || stato.fine) return stato
  let s = stato
  for (let i = 0; i < maxCelle; i++) {
    const dopo = muovi(s, dir)
    if (dopo === s) break // sbattuto
    s = dopo
  }
  return s
}
