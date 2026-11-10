// Snake: gioco a tick su griglia. La logica pura vive in logica.ts; qui solo
// loop (setInterval), input da ctx.comanda, rendering su canvas e invia.

import type { Comando, CtxGioco, Gioco, HandleGioco } from '@/core/types'
import { beep } from '@/core/audio'
import {
  COLONNE, RIGHE,
  creaStato, gira, tick,
} from '@/games/snake/logica'
import type { StatoSnake } from '@/games/snake/logica'

function crea(ctx: CtxGioco): HandleGioco {
  let stato: StatoSnake = creaStato()
  let avviata = false
  let pauSata = false
  let smontata = false
  let timer: number | undefined
  let ultimiPunti = 0
  let intervalloAttuale = stato.intervallo

  const disegna = (): void => {
    const c = ctx.canvas.getContext('2d')
    if (!c) return // jsdom: nessun contesto 2d
    // La shell applica setTransform(dpr,...): qui coordinate in unità CSS.
    const larg = ctx.canvas.clientWidth || ctx.canvas.width
    const alt = ctx.canvas.clientHeight || ctx.canvas.height
    const cella = Math.min(larg / COLONNE, alt / RIGHE)
    const offX = (larg - cella * COLONNE) / 2
    const offY = (alt - cella * RIGHE) / 2

    c.fillStyle = '#0f172a'
    c.fillRect(0, 0, larg, alt)

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

    // Cibo (cerchio).
    c.fillStyle = '#f87171'
    c.beginPath()
    c.arc(
      offX + (stato.cibo.x + 0.5) * cella,
      offY + (stato.cibo.y + 0.5) * cella,
      cella * 0.35,
      0,
      Math.PI * 2,
    )
    c.fill()

    // Serpente (testa più chiara).
    stato.serpente.forEach((cellaCorpo, i) => {
      c.fillStyle = i === 0 ? '#4ade80' : '#22c55e'
      c.fillRect(
        offX + cellaCorpo.x * cella + 1,
        offY + cellaCorpo.y * cella + 1,
        cella - 2,
        cella - 2,
      )
    })

    if (!avviata) {
      c.fillStyle = '#94a3b8'
      c.font = '16px system-ui'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText('Premi una freccia per iniziare', larg / 2, alt / 2)
    }
  }

  const stopTimer = (): void => {
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  const avviaTimer = (): void => {
    stopTimer()
    timer = window.setInterval(() => {
      stato = tick(stato)
      if (stato.punti > ultimiPunti) {
        beep(880, 0.06)
        ctx.invia.punteggio(stato.punti)
      }
      ultimiPunti = stato.punti
      disegna()
      if (stato.finita) {
        stopTimer()
        ctx.invia.fine(stato.punti)
        return
      }
      // Intervallo cambiato (cibo mangiato): rigenera il timer col nuovo valore.
      if (stato.intervallo !== intervalloAttuale) {
        intervalloAttuale = stato.intervallo
        avviaTimer()
      }
    }, intervalloAttuale)
  }

  const onComando = (c: Comando | [Comando, number, number]): void => {
    if (typeof c !== 'string') return
    // Controlli qui e non solo nella shell: i test usano una fake che inoltra.
    if (smontata || pauSata || stato.finita) return
    if (!avviata) {
      avviata = true
      stato = gira(stato, c)
      stato = tick(stato)
      if (stato.punti > ultimiPunti) beep(880, 0.06)
      ultimiPunti = stato.punti
      disegna()
      if (stato.finita) {
        ctx.invia.fine(stato.punti)
        return
      }
      intervalloAttuale = stato.intervallo
      avviaTimer()
      return
    }
    stato = gira(stato, c)
    disegna()
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
      if (avviata && !stato.finita) {
        intervalloAttuale = stato.intervallo
        avviaTimer()
      }
    },
    reset(): void {
      if (smontata) return
      stopTimer()
      stato = creaStato()
      avviata = false
      pauSata = false // riparte pulita: anche se la shell era in pausa
      ultimiPunti = 0
      intervalloAttuale = stato.intervallo
      ctx.invia.punteggio(0)
      disegna()
    },
    smonta(): void {
      smontata = true
      stopTimer()
    },
  }
}

export const snake: Gioco = {
  id: 'snake',
  nome: 'Snake',
  icona: '/icons/icon-snake.svg',
  comandi: ['su', 'giu', 'sx', 'dx'],
  crea,
}
