// 2048: gioco event-driven (senza tick): le mosse arrivano da ctx.comanda
// (frecce + swipe), le transizioni di scivolamento girano con requestAnimationFrame,
// il rendering è canvas e gli invii sono su ctx.invia. La logica pura è in logica.ts.

import type { Comando, CtxGioco, Gioco, HandleGioco } from '@/core/types'
import { beep } from '@/core/audio'
import { LATI, creaStato, muovi } from '@/games/2048/logica'
import type { Direzione, Stato2048 } from '@/games/2048/logica'

export const DURATA_TRANSIZIONE = 120
export const DURATA_POP = 100

const SWIPE_DIR: Record<string, Direzione> = {
  'swipe-sx': 'sx',
  'swipe-dx': 'dx',
  'swipe-su': 'su',
  'swipe-giu': 'giu',
}

// Palette classiche 2048: valore → [sfondo tessera, colore testo]
const TESSERE: Record<number, [string, string]> = {
  2: ['#eee4da', '#776e65'],
  4: ['#ede0c8', '#776e65'],
  8: ['#f2b179', '#f9f6f2'],
  16: ['#f59563', '#f9f6f2'],
  32: ['#f67c5f', '#f9f6f2'],
  64: ['#f65e3b', '#f9f6f2'],
  128: ['#edcf72', '#f9f6f2'],
  256: ['#edcc61', '#f9f6f2'],
  512: ['#edc850', '#f9f6f2'],
  1024: ['#edc53f', '#f9f6f2'],
  2048: ['#edc22e', '#f9f6f2'],
}
const TESSERA_SUP: [string, string] = ['#3c3a32', '#f9f6f2']

// Una tessera in animazione: dalla cella (daR, daC) alla cella (aR, aC).
// "nuova" = spawn: entra con pop (scala 0.6 → 1) invece dello scivolamento.
type AnimTessera = {
  daR: number
  daC: number
  aR: number
  aC: number
  valore: number
  nuova: boolean
  fusione: boolean
}

function crea(ctx: CtxGioco): HandleGioco {
  let stato: Stato2048 = creaStato()
  let pauSata = false
  let smontata = false
  let transizioneInCorso = false
  let hintVisibile = true // finché non arriva la prima mossa valida
  let anim: AnimTessera[] = []
  let haFusioni = false
  let inizio = 0
  let rafId: number | undefined
  let fanfariaId: number | undefined

  const disegnaTessera = (
    c: CanvasRenderingContext2D,
    valore: number,
    x: number,
    y: number,
    s: number,
    scala: number
  ): void => {
    const [sfondo, testo] = TESSERE[valore] ?? TESSERA_SUP
    const l = s * scala
    const off = (s - l) / 2
    c.fillStyle = sfondo
    c.fillRect(x + off, y + off, l, l)
    c.fillStyle = testo
    const dimensione = s * (valore >= 1000 ? 0.32 : valore >= 100 ? 0.38 : 0.5) * scala
    c.font = `bold ${Math.max(8, Math.floor(dimensione))}px system-ui`
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(String(valore), x + s / 2, y + s / 2)
  }

  const geometria = (): { larg: number; alt: number; cella: number; offX: number; offY: number } => {
    const larg = ctx.canvas.clientWidth || ctx.canvas.width
    const alt = ctx.canvas.clientHeight || ctx.canvas.height
    const cella = Math.min(larg, alt) / LATI
    return { larg, alt, cella, offX: (larg - cella * LATI) / 2, offY: (alt - cella * LATI) / 2 }
  }

  const disegnaSfondo = (
    c: CanvasRenderingContext2D,
    larg: number,
    alt: number,
    cella: number,
    offX: number,
    offY: number
  ): void => {
    c.fillStyle = '#0f172a'
    c.fillRect(0, 0, larg, alt)
    c.fillStyle = 'rgba(148, 163, 184, 0.08)'
    const gap = Math.max(2, cella * 0.05)
    for (let r = 0; r < LATI; r++)
      for (let col = 0; col < LATI; col++)
        c.fillRect(offX + col * cella + gap, offY + r * cella + gap, cella - 2 * gap, cella - 2 * gap)
  }

  const disegnaHint = (c: CanvasRenderingContext2D, larg: number, alt: number): void => {
    c.fillStyle = '#94a3b8'
    c.font = '16px system-ui'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('Frecce/WASD o swipa', larg / 2, alt / 2)
  }

  // Stato a riposo: griglia corrente (+ hint finché non si muove).
  const disegna = (): void => {
    const c = ctx.canvas.getContext('2d')
    if (!c) return // jsdom: nessun contesto 2d
    const { larg, alt, cella, offX, offY } = geometria()
    disegnaSfondo(c, larg, alt, cella, offX, offY)
    stato.griglia.forEach((riga, r) =>
      riga.forEach((v, col) => {
        if (v !== 0) disegnaTessera(c, v, offX + col * cella, offY + r * cella, cella, 1)
      })
    )
    if (hintVisibile) disegnaHint(c, larg, alt)
  }

  // Frame della transizione: fase di scivolamento (DURATA_TRANSIZIONE) +
  // fase pop delle fusioni (DURATA_POP, solo se ci sono fusioni).
  const frameTransizione = (): void => {
    rafId = undefined
    if (smontata || pauSata) return
    const c = ctx.canvas.getContext('2d')
    if (!c) {
      transizioneInCorso = false
      return
    }
    const { larg, alt, cella, offX, offY } = geometria()
    const now = performance.now()
    const durataTotale = DURATA_TRANSIZIONE + (haFusioni ? DURATA_POP : 0)
    const t = Math.min(1, (now - inizio) / durataTotale)
    const tSlide = Math.min(1, (now - inizio) / DURATA_TRANSIZIONE)
    const e = 1 - (1 - tSlide) ** 3 // ease-out
    disegnaSfondo(c, larg, alt, cella, offX, offY)
    for (const a of anim) {
      if (a.fusione) {
        // Tessera risultante: visibile solo dopo lo scivolamento, con pop.
        if (tSlide < 1) continue
        const tPop = Math.min(1, Math.max(0, (now - inizio - DURATA_TRANSIZIONE) / DURATA_POP))
        const scala = 0.6 + 0.4 * tPop
        disegnaTessera(c, a.valore, offX + a.aC * cella, offY + a.aR * cella, cella, scala)
      } else {
        const r = a.daR + (a.aR - a.daR) * e
        const col = a.daC + (a.aC - a.daC) * e
        const pop = a.nuova ? 0.6 + 0.4 * Math.min(1, (now - inizio) / DURATA_POP) : 1
        disegnaTessera(c, a.valore, offX + col * cella, offY + r * cella, cella, pop)
      }
    }
    if (t >= 1) {
      transizioneInCorso = false
      anim = []
      disegna()
    } else {
      rafId = requestAnimationFrame(frameTransizione)
    }
  }

  // Costruisce le animazioni: per ogni linea (in ordine di movimento) mappa le tessere
  // vecchie sulle nuove preservando l'ordine; le fusioni partono dal primo operando,
  // le tessere senza origine (spawn) fanno il pop in posto.
  const avviaTransizione = (vecchia: number[][], nuova: number[][], dir: Direzione): void => {
    anim = []
    haFusioni = false
    for (let i = 0; i < LATI; i++) {
      const vec: Array<[number, number]> = []
      const nuo: Array<[number, number, number]> = []
      for (let j = 0; j < LATI; j++) {
        const r = dir === 'sx' || dir === 'dx' ? i : dir === 'su' ? j : LATI - 1 - j
        const c = dir === 'su' || dir === 'giu' ? i : dir === 'sx' ? j : LATI - 1 - j
        if (vecchia[r][c] !== 0) vec.push([r, c])
        if (nuova[r][c] !== 0) nuo.push([r, c, nuova[r][c]])
      }
      let k = 0
      for (const [nr, nc, nv] of nuo) {
        const v0 = k < vec.length ? vecchia[vec[k][0]][vec[k][1]] : 0
        const v1 = k + 1 < vec.length ? vecchia[vec[k + 1][0]][vec[k + 1][1]] : 0
        if (v0 === nv / 2 && v1 === nv / 2) {
          // Fusione: entrambi gli operandi scivolano mostrando il valore originale,
          // poi la tessera risultante appare con pop.
          anim.push({ daR: vec[k][0], daC: vec[k][1], aR: nr, aC: nc, valore: nv / 2, nuova: false, fusione: false })
          anim.push({ daR: vec[k + 1][0], daC: vec[k + 1][1], aR: nr, aC: nc, valore: nv / 2, nuova: false, fusione: false })
          anim.push({ daR: nr, daC: nc, aR: nr, aC: nc, valore: nv, nuova: false, fusione: true })
          haFusioni = true
          k += 2
        } else if (v0 === nv) {
          anim.push({ daR: vec[k][0], daC: vec[k][1], aR: nr, aC: nc, valore: nv, nuova: false, fusione: false })
          k += 1
        } else {
          anim.push({ daR: nr, daC: nc, aR: nr, aC: nc, valore: nv, nuova: true, fusione: false })
        }
      }
    }
    inizio = performance.now()
    transizioneInCorso = true
    rafId = requestAnimationFrame(frameTransizione)
  }

  const onComando = (c: Comando | [Comando, number, number]): void => {
    if (typeof c !== 'string') return
    // Controlli qui e non solo nella shell: i test usano una fake che inoltra.
    if (smontata || pauSata || stato.finita || transizioneInCorso) return
    const dir: Direzione | undefined =
      c === 'su' || c === 'giu' || c === 'sx' || c === 'dx' ? c : SWIPE_DIR[c]
    if (!dir) return
    const vecchio = stato
    const { stato: nuovo, cambiato } = muovi(stato, dir)
    if (!cambiato) return
    hintVisibile = false
    stato = nuovo
    if (nuovo.punti > vecchio.punti) beep(880, 0.06) // fusione
    else beep(660, 0.04) // mossa semplice
    ctx.invia.punteggio(nuovo.punti)
    if (nuovo.giàVinto && !vecchio.giàVinto) {
      // Fanfaria 2048: due note ascendenti, una tantum (lo stile game-over della shell).
      beep(659, 0.12)
      fanfariaId = window.setTimeout(() => beep(784, 0.2), 130)
    }
    if (nuovo.finita) {
      disegna()
      ctx.invia.fine(nuovo.punti)
      return
    }
    avviaTransizione(vecchio.griglia, nuovo.griglia, dir)
  }

  ctx.comanda(onComando)
  disegna() // render iniziale: senza tick loop, senza questo lo schermo resta vuoto

  return {
    pausa(): void {
      if (smontata || pauSata) return
      pauSata = true
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      rafId = undefined
      transizioneInCorso = false
    },
    riprendi(): void {
      if (smontata || !pauSata) return
      pauSata = false
      // Lo stato logico è già quello finale: si ridisegna a riposo, niente ripresa a metà.
      disegna()
    },
    reset(): void {
      if (smontata) return
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      rafId = undefined
      transizioneInCorso = false
      anim = []
      stato = creaStato()
      hintVisibile = true
      pauSata = false // riparte pulita: anche se la shell era in pausa
      ctx.invia.punteggio(0)
      disegna()
    },
    smonta(): void {
      if (smontata) return
      smontata = true
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      rafId = undefined
      if (fanfariaId !== undefined) clearTimeout(fanfariaId)
      fanfariaId = undefined
    },
  }
}

export const gioco2048: Gioco = {
  id: '2048',
  nome: '2048',
  icona: '/icons/icon-2048.svg',
  comandi: ['su', 'giu', 'sx', 'dx', 'swipe-sx', 'swipe-dx', 'swipe-su', 'swipe-giu'],
  pad: false,
  crea,
}
