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

// Palette classiche 2048: [sfondo tessera, colore testo]
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
}

function crea(ctx: CtxGioco): HandleGioco {
  let stato: Stato2048 = creaStato()
  let pauSata = false
  let smontata = false
  let transizioneInCorso = false
  let anim: AnimTessera[] = []
  let inizio = 0
  let rafId: number | undefined

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
    c.font = `bold ${Math.max(8, Math.floor(s * 0.4 * scala))}px system-ui`
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

  const disegnaSfondo = (c: CanvasRenderingContext2D, larg: number, alt: number, cella: number, offX: number, offY: number): void => {
    c.fillStyle = '#0f172a'
    c.fillRect(0, 0, larg, alt)
    c.fillStyle = 'rgba(148, 163, 184, 0.12)'
    const gap = Math.max(2, cella * 0.05)
    for (let r = 0; r < LATI; r++)
      for (let col = 0; col < LATI; col++)
        c.fillRect(offX + col * cella + gap, offY + r * cella + gap, cella - 2 * gap, cella - 2 * gap)
  }

  // Stato a riposo: griglia corrente.
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
  }

  // Frame della transizione: interpola le tessere e si riaccoda fino a t >= 1.
  const frameTransizione = (): void => {
    rafId = undefined
    if (smontata || pauSata) return
    const c = ctx.canvas.getContext('2d')
    if (!c) {
      // jsdom: senza contesto la transizione non parte (lo stato avanza puramente).
      transizioneInCorso = false
      return
    }
    const { larg, alt, cella, offX, offY } = geometria()
    const now = performance.now()
    const t = Math.min(1, (now - inizio) / DURATA_TRANSIZIONE)
    const e = 1 - (1 - t) ** 3 // ease-out
    disegnaSfondo(c, larg, alt, cella, offX, offY)
    for (const a of anim) {
      const r = a.daR + (a.aR - a.daR) * e
      const col = a.daC + (a.aC - a.daC) * e
      const pop = a.nuova ? 0.6 + 0.4 * Math.min(1, (now - inizio) / DURATA_POP) : 1
      disegnaTessera(c, a.valore, offX + col * cella, offY + r * cella, cella, pop)
    }
    if (t >= 1) {
      transizioneInCorso = false
      anim = []
      disegna() // stato a riposo
    } else {
      rafId = requestAnimationFrame(frameTransizione)
    }
  }

  // Costruisce le animazioni: per ogni linea (in ordine di movimento) mappa le tessere
  // vecchie sulle nuove preservando l'ordine; le fusioni partono dal primo operando,
  // le tessere senza origine (spawn) fanno il pop in posto.
  const avviaTransizione = (vecchia: number[][], nuova: number[][], dir: Direzione): void => {
    anim = []
    for (let i = 0; i < LATI; i++) {
      const vec: Array<[number, number]> = []
      const nuo: Array<[number, number, number]> = []
      for (let j = 0; j < LATI; j++) {
        const r = dir === 'sx' || dir === 'dx' ? i : dir === 'su' ? j : LATI - 1 - j
        const c = dir === 'sx' || dir === 'su' ? j : LATI - 1 - j
        if (vecchia[r][c] !== 0) vec.push([r, c])
        if (nuova[r][c] !== 0) nuo.push([r, c, nuova[r][c]])
      }
      let k = 0
      for (const [nr, nc, nv] of nuo) {
        const v0 = k < vec.length ? vecchia[vec[k][0]][vec[k][1]] : 0
        const v1 = k + 1 < vec.length ? vecchia[vec[k + 1][0]][vec[k + 1][1]] : 0
        if (v0 === nv / 2 && v1 === nv / 2) {
          anim.push({ daR: vec[k][0], daC: vec[k][1], aR: nr, aC: nc, valore: nv, nuova: false })
          k += 2
        } else if (v0 === nv) {
          anim.push({ daR: vec[k][0], daC: vec[k][1], aR: nr, aC: nc, valore: nv, nuova: false })
          k += 1
        } else {
          anim.push({ daR: nr, daC: nc, aR: nr, aC: nc, valore: nv, nuova: true })
        }
      }
    }
    inizio = performance.now()
    transizioneInCorso = true
    rafId = requestAnimationFrame(frameTransizione)
  }

  const comanda = (comando: Comando): void => {
    if (smontata || pauSata || transizioneInCorso) return
    const dir: Direzione | undefined =
      comando === 'su' || comando === 'giu' || comando === 'sx' || comando === 'dx'
        ? comando
        : SWIPE_DIR[comando]
    if (!dir) return
    const vecchio = stato
    const { stato: nuovo, cambiato } = muovi(stato, dir)
    if (!cambiato) return
    stato = nuovo
    ctx.invia.punteggio(stato.punti)
    if (!vecchio.giàVinto && stato.giàVinto) {
      beep(880, 0.12)
      beep(1175, 0.2)
      ctx.invia.vittoria()
    }
    if (nuovo.finita) {
      disegna()
      ctx.invia.fine(stato.punti)
      return
    }
    avviaTransizione(vecchio.griglia, stato.griglia, dir)
  }

  ctx.comanda('su', comanda)
  ctx.comanda('giu', comanda)
  ctx.comanda('sx', comanda)
  ctx.comanda('dx', comanda)
  ctx.comanda('swipe-su', comanda)
  ctx.comanda('swipe-giu', comanda)
  ctx.comanda('swipe-sx', comanda)
  ctx.comanda('swipe-dx', comanda)

  // Avvio pigro: nessun rendering finché non arriva la prima mossa valida.
  ctx.invia.punteggio(stato.punti)

  return {
    pausa(): void {
      if (smontata || pauSata) return
      pauSata = true
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      rafId = undefined
      transizioneInCorso = false
      ctx.invia.pausa()
    },
    riprendi(): void {
      if (smontata || !pauSata) return
      pauSata = false
      ctx.invia.riprendi()
      disegna()
    },
    reset(): void {
      if (smontata) return
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      rafId = undefined
      transizioneInCorso = false
      anim = []
      stato = creaStato()
      ctx.invia.punteggio(stato.punti)
      ctx.invia.reset()
      disegna()
    },
    smonta(): void {
      if (smontata) return
      smontata = true
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      rafId = undefined
    },
  }
}

export const gioco2048: Gioco = {
  id: '2048',
  nome: '2048',
  icona: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="14" fill="#faf8ef"/><rect x="8" y="8" width="40" height="40" rx="6" fill="#edc22e"/><rect x="52" y="8" width="40" height="40" rx="6" fill="#f2b179"/><rect x="8" y="52" width="40" height="40" rx="6" fill="#3c3a32"/><rect x="52" y="52" width="40" height="40" rx="6" fill="#eee4da"/><text x="28" y="38" font-family="system-ui, sans-serif" font-size="22" font-weight="bold" fill="#f9f6f2" text-anchor="middle">4K</text><text x="72" y="38" font-family="system-ui, sans-serif" font-size="22" font-weight="bold" fill="#f9f6f2" text-anchor="middle">8</text><text x="28" y="82" font-family="system-ui, sans-serif" font-size="22" font-weight="bold" fill="#f9f6f2" text-anchor="middle">64</text><text x="72" y="82" font-family="system-ui, sans-serif" font-size="22" font-weight="bold" fill="#776e65" text-anchor="middle">2</text></svg>`,
  comandi: ['su', 'giu', 'sx', 'dx', 'swipe-sx', 'swipe-dx', 'swipe-su', 'swipe-giu'],
  pad: false,
  crea,
}
