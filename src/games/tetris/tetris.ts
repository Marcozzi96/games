// Tetris: gioco a tick su griglia 10×20. La logica pura vive in logica.ts;
// qui solo loop (setInterval), input da ctx.comanda, rendering su canvas e invia.

import type { Comando, CtxGioco, Gioco, HandleGioco } from '@/core/types'
import { beep } from '@/core/audio'
import {
  COLONNE, RIGHE,
  COLORE_TESSERA, FORME,
  SOFT_DROP_MS, INTERVALLO_SOFT_DROP,
  creaStato, avvia, muovi, ruota, softDrop, hardDrop, tick, ghost,
  intervalloGravita,
} from '@/games/tetris/logica'
import type { StatoTetris } from '@/games/tetris/logica'

const ALTEZZA_NEXT = 48

function crea(ctx: CtxGioco): HandleGioco {
  let stato: StatoTetris = creaStato()
  let avviata = false
  let pauSata = false
  let smontata = false
  let timer: number | undefined
  let timerSoft: number | undefined

  const disegna = (): void => {
    const c = ctx.canvas.getContext('2d')
    if (!c) return // jsdom: nessun contesto 2d
    // La shell applica setTransform(dpr,...): qui coordinate in unità CSS.
    const larg = ctx.canvas.clientWidth || ctx.canvas.width
    const alt = ctx.canvas.clientHeight || ctx.canvas.height
    const cella = Math.min(larg / COLONNE, (alt - ALTEZZA_NEXT) / RIGHE)
    const offX = (larg - cella * COLONNE) / 2
    const offY = ALTEZZA_NEXT + (alt - ALTEZZA_NEXT - cella * RIGHE) / 2

    // Sfondo griglia + area next.
    c.fillStyle = '#0f172a'
    c.fillRect(0, 0, larg, alt)
    c.fillStyle = '#1e293b'
    c.fillRect(0, 0, larg, ALTEZZA_NEXT)

    // Griglia sottile.
    c.strokeStyle = 'rgba(148,163,184,0.08)'
    c.lineWidth = 1
    for (let x = 0; x <= COLONNE; x++) {
      c.beginPath()
      c.moveTo(offX + x * cella, offY)
      c.lineTo(offX + x * cella, offY + RIGHE * cella)
      c.stroke()
    }
    for (let y = 0; y <= RIGHE; y++) {
      c.beginPath()
      c.moveTo(offX, offY + y * cella)
      c.lineTo(offX + COLONNE * cella, offY + y * cella)
      c.stroke()
    }

    const blocco = (gx: number, gy: number, colore: string): void => {
      c.fillStyle = colore
      c.fillRect(offX + gx * cella + 1, offY + gy * cella + 1, cella - 2, cella - 2)
      c.strokeStyle = 'rgba(0,0,0,0.35)'
      c.strokeRect(offX + gx * cella + 1, offY + gy * cella + 1, cella - 2, cella - 2)
    }

    // Pila.
    stato.griglia.forEach((id, idx) => {
      if (id === 'libero') return
      blocco(idx % COLONNE, Math.floor(idx / COLONNE), COLORE_TESSERA[id as keyof typeof COLORE_TESSERA])
    })

    const tessera = stato.tessera
    if (tessera) {
      // Ghost (proiezione dell'atterraggio).
      const d = ghost(stato)
      if (d > 0) {
        c.globalAlpha = 0.25
        tessera.forma.forEach((riga, i) => {
          riga.forEach((v, j) => {
            if (v) blocco(tessera.x + j, tessera.y + i + d, COLORE_TESSERA[tessera.id])
          })
        })
        c.globalAlpha = 1
      }
      // Tessera corrente.
      tessera.forma.forEach((riga, i) => {
        riga.forEach((v, j) => {
          if (v) blocco(tessera.x + j, tessera.y + i, COLORE_TESSERA[tessera.id])
        })
      })
    }

    // Next: bag[0] centrata nell'area in alto.
    const next = stato.bag[0]
    if (next) {
      const forma = FORME[next]
      const largForma = forma[0].length * cella
      const altForma = forma.length * cella * 0.6
      const nx = (larg - largForma) / 2
      const ny = (ALTEZZA_NEXT - altForma) / 2
      const cellaNext = cella * 0.6
      forma.forEach((riga, i) => {
        riga.forEach((v, j) => {
          if (!v) return
          c.fillStyle = COLORE_TESSERA[next]
          c.fillRect(nx + j * cellaNext + 1, ny + i * cellaNext + 1, cellaNext - 2, cellaNext - 2)
        })
      })
    }

    if (!avviata) {
      c.fillStyle = '#94a3b8'
      c.font = '16px system-ui'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText('Premi un tasto per iniziare', larg / 2, (ALTEZZA_NEXT + alt) / 2)
    }
  }

  const stopTimer = (): void => {
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
    if (timerSoft !== undefined) {
      window.clearTimeout(timerSoft)
      timerSoft = undefined
    }
  }

  const avviaTimer = (): void => {
    if (timer !== undefined) {
      window.clearInterval(timer)
    }
    timer = window.setInterval(step, intervalloGravita(stato.livello))
  }

  const step = (): void => {
    const livelloPrima = stato.livello
    const lineePrima = stato.linee
    stato = tick(stato)
    if (stato.linee > lineePrima) {
      ctx.invia.punteggio(stato.punti)
      if (stato.linee - lineePrima === 4) {
        beep(660, 0.08)
        window.setTimeout(() => beep(880, 0.12), 240)
      } else {
        beep(660, 0.08)
      }
    }
    if (stato.livello > livelloPrima) beep(523, 0.15)
    disegna()
    if (stato.fine) {
      stopTimer()
      ctx.invia.fine(stato.punti)
      return
    }
    if (stato.livello !== livelloPrima) avviaTimer()
  }

  const applicaComando = (c: Comando): void => {
    switch (c) {
      case 'sx':
        stato = muovi(stato, -1)
        break
      case 'dx':
        stato = muovi(stato, 1)
        break
      case 'giu': {
        const prima = stato.punti
        stato = softDrop(stato)
        if (stato.punti > prima) {
          ctx.invia.punteggio(stato.punti)
          beep(150, 0.03)
          // Finestra soft-drop: gravità a 50 ms per SOFT_DROP_MS, poi torna normale.
          if (timer !== undefined) window.clearInterval(timer)
          timer = window.setInterval(step, INTERVALLO_SOFT_DROP)
          if (timerSoft !== undefined) window.clearTimeout(timerSoft)
          timerSoft = window.setTimeout(() => {
            timerSoft = undefined
            avviaTimer()
          }, SOFT_DROP_MS)
        }
        break
      }
      case 'su': // alias di ruota (Tetris: ↑/W ruotano)
      case 'ruota': {
        const formaPrima = stato.tessera?.forma
        stato = ruota(stato)
        if (stato.tessera?.forma !== formaPrima) beep(330, 0.04)
        break
      }
      case 'conferma':
        stato = hardDrop(stato)
        ctx.invia.punteggio(stato.punti)
        beep(110, 0.05)
        break
    }
    disegna()
  }

  const onComando = (c: Comando | [Comando, number, number]): void => {
    if (typeof c !== 'string') return
    // Controlli qui e non solo nella shell: i test usano una fake che inoltra.
    if (smontata || pauSata || stato.fine) return
    if (!avviata) {
      avviata = true
      stato = avvia(stato)
      if (stato.fine) {
        ctx.invia.fine(stato.punti)
        return
      }
      applicaComando(c)
      avviaTimer()
      return
    }
    applicaComando(c)
  }

  ctx.comanda(onComando)
  disegna()

  return {
    pausa(): void {
      if (smontata || pauSata) return
      pauSata = true
      stopTimer()
    },
    riprendi(): void {
      if (smontata || !pauSata) return
      pauSata = false
      if (avviata && !stato.fine) {
        avviaTimer()
      }
    },
    reset(): void {
      if (smontata) return
      stopTimer()
      stato = creaStato()
      avviata = false
      pauSata = false // riparte pulita: anche se la shell era in pausa
      ctx.invia.punteggio(0)
      disegna()
    },
    smonta(): void {
      smontata = true
      stopTimer()
    },
  }
}

export const tetris: Gioco = {
  id: 'tetris',
  nome: 'Tetris',
  icona: '/icons/icon-tetris.svg',
  comandi: ['su', 'sx', 'dx', 'giu', 'ruota', 'conferma'],
  crea,
}
