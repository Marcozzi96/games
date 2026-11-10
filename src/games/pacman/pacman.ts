// Pac-Man: gioco continuo. La logica pura vive in logica.ts; qui solo loop
// requestAnimationFrame (delta time cap 50ms), input da ctx.comanda,
// rendering su canvas 2D, audio beep e lifecycle (pausa/riprendi/reset/smonta).

import type { Comando, CtxGioco, Gioco, HandleGioco } from '@/core/types'
import { beep } from '@/core/audio'
import { COLONNE, RIGHE, FRUTTA_POSIZIONE } from '@/games/pacman/labirinto'
import { creaStato, comando, tick } from '@/games/pacman/logica'
import type { StatoPacman } from '@/games/pacman/logica'
import type { Direzione } from '@/games/pacman/labirinto'

// Type guard: solo i comandi direzionali (su/giu/sx/dx) sono inoltrati alla
// logica; gli altri (es. 'conferma') sono ignorati dal gioco.
const èDirezione = (c: Comando): c is Direzione => c === 'su' || c === 'giu' || c === 'sx' || c === 'dx'

const DT_CAP = 0.05 // 50ms: evita il "jump" al resume da background.

const DELTA: Record<string, { dcol: number; drow: number }> = {
  su: { dcol: 0, drow: -1 },
  giu: { dcol: 0, drow: 1 },
  sx: { dcol: -1, drow: 0 },
  dx: { dcol: 1, drow: 0 },
}

const COLORE_GHOST: Record<number, string> = {
  0: '#ef4444', // Blinky (rosso)
  1: '#f9a8d4', // Pinky (rosa)
  2: '#22d3ee', // Inky (ciano)
  3: '#fb923c', // Clyde (arancio)
}

function crea(ctx: CtxGioco): HandleGioco {
  let stato: StatoPacman = creaStato()
  let avviata = false
  let pauSata = false
  let smontata = false
  let terminata = false
  let raf: number | undefined
  let last: number | null = null
  let ultimiPunti = 0
  let waka = false

  const disegna = (): void => {
    const c = ctx.canvas.getContext('2d')
    if (!c) return // jsdom: nessun contesto 2d
    // La shell applica setTransform(dpr,...): qui coordinate in unità CSS.
    const larg = ctx.canvas.clientWidth || ctx.canvas.width
    const alt = ctx.canvas.clientHeight || ctx.canvas.height
    const cella = Math.min(larg / COLONNE, alt / RIGHE)
    const offX = (larg - cella * COLONNE) / 2
    const offY = (alt - cella * RIGHE) / 2
    const fase = (t: number) => 0.5 + 0.5 * Math.sin(t / 120) // 0..1 oscillante

    c.fillStyle = '#000000'
    c.fillRect(0, 0, larg, alt)

    // Labirinto: muri (linee blu) e pellet/power.
    for (let r = 0; r < RIGHE; r++) {
      for (let col = 0; col < COLONNE; col++) {
        const t = stato.labirinto[r][col]
        const cx = offX + (col + 0.5) * cella
        const cy = offY + (r + 0.5) * cella
        if (t === 'muro') {
          c.strokeStyle = '#1e3a8a'
          c.lineWidth = 2
          c.strokeRect(offX + col * cella + 2, offY + r * cella + 2, cella - 4, cella - 4)
        } else if (t === 'pellet') {
          c.fillStyle = '#fbbf24'
          c.beginPath()
          c.arc(cx, cy, Math.max(2, cella * 0.12), 0, Math.PI * 2)
          c.fill()
        } else if (t === 'power') {
          c.globalAlpha = 0.5 + 0.5 * fase(performance.now())
          c.fillStyle = '#fbbf24'
          c.beginPath()
          c.arc(cx, cy, Math.max(5, cella * 0.3), 0, Math.PI * 2)
          c.fill()
          c.globalAlpha = 1
        }
      }
    }

    // Frutta (se presente).
    if (stato.frutto !== null) {
      const cx = offX + (FRUTTA_POSIZIONE.col + 0.5) * cella
      const cy = offY + (FRUTTA_POSIZIONE.riga + 0.5) * cella
      c.fillStyle = '#ef4444'
      c.beginPath()
      c.arc(cx, cy, cella * 0.3, 0, Math.PI * 2)
      c.fill()
    }

    // Pac-Man: cerchio giallo con "bocca" (arco oscillante), posizione interpolata.
    {
      const p = stato.pacman
      const d = DELTA[p.dir]
      const px = offX + (p.col + d.dcol * p.progresso + 0.5) * cella
      const py = offY + (p.riga + d.drow * p.progresso + 0.5) * cella
      const raggio = cella * 0.45
      const apr = 0.25 + 0.2 * fase(performance.now()) // apertura bocca in radianti
      const base = { su: -Math.PI / 2, giu: Math.PI / 2, sx: Math.PI, dx: 0 }[p.dir]
      c.fillStyle = '#fbbf24'
      c.beginPath()
      c.moveTo(px, py)
      c.arc(px, py, raggio, base + apr, base - apr + Math.PI * 2)
      c.closePath()
      c.fill()
    }

    // Fantasmi.
    for (const g of stato.fantasmi) {
      const d = DELTA[g.dir]
      const px = offX + (g.col + d.dcol * g.progresso + 0.5) * cella
      const py = offY + (g.riga + d.drow * g.progresso + 0.5) * cella
      const raggio = cella * 0.45

      if (g.stato === 'occhio') {
        // Solo occhi bianchi.
        occhioBianco(c, px, py, raggio)
        continue
      }

      let corpo = COLORE_GHOST[g.id]
      if (g.stato === 'spaventato') {
        const flash = stato.timerSpaventati < 2 && Math.floor(performance.now() / 150) % 2 === 0
        corpo = flash ? '#f8fafc' : '#3b82f6'
      }
      // Corpo: semicircolo superiore + "onde" inferiori.
      c.fillStyle = corpo
      c.beginPath()
      c.arc(px, py - raggio * 0.1, raggio, Math.PI, 0)
      const onde = 3
      const passo = (raggio * 2) / (onde * 2)
      for (let i = 0; i < onde * 2; i++) {
        const x = px + raggio - passo * (i + 1)
        const y = py + raggio * 0.5 + (i % 2 === 0 ? 0 : -raggio * 0.2)
        c.lineTo(x, y)
      }
      c.closePath()
      c.fill()
      // Occhi (gialli per spaventato, bianchi altrimenti).
      occhioFantasma(c, px, py, raggio, g.stato === 'spaventato')
    }

    if (!avviata) {
      c.fillStyle = '#94a3b8'
      c.font = '16px system-ui'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText('Premi una freccia per iniziare', larg / 2, alt / 2)
    }
  }

  const stopLoop = (): void => {
    if (raf !== undefined) {
      cancelAnimationFrame(raf)
      raf = undefined
    }
  }

  const loop = (now: number): void => {
    raf = undefined
    if (smontata || pauSata || terminata) return
    if (last === null) last = now
    let dt = (now - last) / 1000
    last = now
    if (dt < 0) dt = 0
    if (dt > DT_CAP) dt = DT_CAP

    // Snapshot pre-tick per rilevare le transizioni (audio).
    const primaFase = stato.statoFase
    const spaventatiPrima = stato.timerSpaventati
    const fruttaPrima = stato.frutto !== null
    const statiPrima = stato.fantasmi.map((g) => g.stato)
    const pelletPrima = stato.pelletMangiati

    stato = tick(stato, dt)

    // Audio (no-op nei test: AudioContext non inizializzato → beep() no-op).
    if (stato.pelletMangiati > pelletPrima) {
      waka = !waka
      beep(waka ? 440 : 880, 0.05)
    }
    if (stato.timerSpaventati > 0 && spaventatiPrima <= 0) beep(220, 0.2)
    if (stato.fantasmi.some((g, i) => g.stato === 'occhio' && statiPrima[i] !== 'occhio')) {
      beep(400, 0.1)
      beep(800, 0.1)
      beep(1200, 0.1)
    }
    if (stato.statoFase === 'morte' && primaFase !== 'morte') {
      beep(600, 0.2)
      beep(400, 0.2)
      beep(200, 0.4)
    }
    if (fruttaPrima && stato.frutto === null && stato.punti > 0) {
      beep(660, 0.1)
      beep(660, 0.1)
      beep(660, 0.1)
    }

    // Punteggio: solo a ogni variazione.
    if (stato.punti !== ultimiPunti) {
      ctx.invia.punteggio(stato.punti)
      ultimiPunti = stato.punti
    }

    disegna()

    if (stato.statoFase === 'fine') {
      terminata = true
      ctx.invia.fine(stato.punti)
      return // stop loop: nessun rAF richiesto
    }
    raf = requestAnimationFrame(loop)
  }

  const avviaLoop = (): void => {
    stopLoop()
    last = null // evita il "jump" di dt al (ri)avvio
    raf = requestAnimationFrame(loop)
  }

  const onComando = (c: Comando | [Comando, number, number]): void => {
    if (typeof c !== 'string') return
    if (!èDirezione(c)) return
    // Controlli qui e non solo nella shell: i test usano una fake che inoltra.
    if (smontata || pauSata || terminata) return
    if (!avviata) {
      avviata = true
      stato = comando(stato, c)
      avviaLoop()
      return
    }
    stato = comando(stato, c)
  }

  ctx.comanda(onComando)
  disegna()

  return {
    pausa(): void {
      if (smontata || pauSata || terminata) return
      pauSata = true
      stopLoop()
    },
    riprendi(): void {
      if (smontata || !pauSata || terminata) return
      pauSata = false
      if (avviata && stato.statoFase !== 'fine') avviaLoop()
    },
    reset(): void {
      if (smontata) return
      stopLoop()
      stato = creaStato()
      avviata = false
      pauSata = false // riparte pulita: anche se la shell era in pausa
      terminata = false
      ultimiPunti = 0
      waka = false
      ctx.invia.punteggio(0)
      disegna()
    },
    smonta(): void {
      smontata = true
      stopLoop()
    },
  }
}

// Occhi bianchi centrati (per ghost in stato 'occhio').
function occhioBianco(c: CanvasRenderingContext2D, px: number, py: number, raggio: number): void {
  c.fillStyle = '#f8fafc'
  for (const s of [-1, 1]) {
    c.beginPath()
    c.arc(px + s * raggio * 0.35, py - raggio * 0.1, raggio * 0.28, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#1e3a8a'
    c.beginPath()
    c.arc(px + s * raggio * 0.35, py - raggio * 0.05, raggio * 0.14, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#f8fafc'
  }
}

// Occhi del fantasma (pupille che seguono la direzione).
function occhioFantasma(c: CanvasRenderingContext2D, px: number, py: number, raggio: number, spaventato: boolean): void {
  const r = raggio * 0.28
  for (const s of [-1, 1]) {
    c.fillStyle = '#f8fafc'
    c.beginPath()
    c.arc(px + s * raggio * 0.35, py - raggio * 0.15, r, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = spaventato ? '#1e3a8a' : '#0f172a'
    c.beginPath()
    c.arc(px + s * raggio * 0.4, py - raggio * 0.15, r * 0.5, 0, Math.PI * 2)
    c.fill()
  }
}

export const pacman: Gioco = {
  id: 'pacman',
  nome: 'Pac-Man',
  icona: '/icons/icon-pacman.svg',
  comandi: ['su', 'giu', 'sx', 'dx'],
  crea,
}
