// Schermo di gioco: canvas dimensionato su viewport (DPR gestito), HUD
// comune (punti, record, pausa, chiudi), overlay pausa/game over, teardown
// completo al ritorno al menù. Il gioco riceve un CtxGioco e non tocca il DOM.

import { CollegaInput, legendaTasti } from '@/core/input';
import type { RigaLegenda } from '@/core/input';
import { caricaRecord, salvaRecord } from '@/core/storage';
import { beep } from '@/core/audio';
import type { Comando, Gioco, HandleGioco } from '@/core/types';

type Stato = 'attivo' | 'pausa' | 'fine';

export function apriSchermo(g: Gioco, host: HTMLElement, onEsci: () => void): void {
  host.textContent = '';

  // --- Layout ----------------------------------------------------------------
  const schermo = document.createElement('div');
  schermo.className = 'schermo';

  const hud = document.createElement('div');
  hud.className = 'hud';
  const puntiEl = document.createElement('span');
  puntiEl.className = 'hud-punti';
  puntiEl.dataset.teste = 'punti';
  const recordEl = document.createElement('span');
  recordEl.className = 'hud-record';
  recordEl.dataset.teste = 'record';
  const pausaBtn = document.createElement('button');
  pausaBtn.type = 'button';
  pausaBtn.className = 'hud-btn';
  pausaBtn.dataset.teste = 'pausa';
  pausaBtn.textContent = '⏸';
  pausaBtn.setAttribute('aria-label', 'Pausa');
  const chiudiBtn = document.createElement('button');
  chiudiBtn.type = 'button';
  chiudiBtn.className = 'hud-btn';
  chiudiBtn.dataset.teste = 'chiudi';
  chiudiBtn.textContent = '✕';
  chiudiBtn.setAttribute('aria-label', 'Torna al menù');
  hud.append(puntiEl, recordEl, pausaBtn, chiudiBtn);

  const wrap = document.createElement('div');
  wrap.className = 'canvas-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'canvas';
  wrap.appendChild(canvas);

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.hidden = true;

  // --- Popup legenda comandi (bottone (i), in basso a destra) -----------------
  const legend = document.createElement('div')
  legend.className = 'legend'
  legend.hidden = true
  const pannelloLegenda = document.createElement('div')
  const titoloLegenda = document.createElement('h2')
  titoloLegenda.textContent = 'Comandi'
  const righeLegenda = document.createElement('div')
  righeLegenda.className = 'legend-righe'
  const righe: RigaLegenda[] = legendaTasti(g.comandi)
  for (const riga of righe) {
    const rigaEl = document.createElement('div')
    rigaEl.className = 'legend-riga'
    const tasti = document.createElement('span')
    tasti.textContent = riga.tasti
    const etichetta = document.createElement('span')
    etichetta.textContent = riga.etichetta
    rigaEl.append(tasti, etichetta)
    righeLegenda.appendChild(rigaEl)
  }
  const chiudiLegendaBtn = document.createElement('button')
  chiudiLegendaBtn.type = 'button'
  chiudiLegendaBtn.className = 'btn'
  chiudiLegendaBtn.dataset.teste = 'chiudi-legenda'
  chiudiLegendaBtn.textContent = 'Chiudi'
  pannelloLegenda.append(titoloLegenda, righeLegenda, chiudiLegendaBtn)
  legend.appendChild(pannelloLegenda)

  const legendBtn = document.createElement('button')
  legendBtn.type = 'button'
  legendBtn.className = 'legend-btn'
  legendBtn.dataset.teste = 'legenda'
  legendBtn.textContent = '(i)'
  legendBtn.setAttribute('aria-label', 'Comandi da tastiera')

  schermo.append(hud, wrap, overlay, legend, legendBtn)
  host.appendChild(schermo)

  // --- Stato ------------------------------------------------------------------
  let stato: Stato = 'attivo';
  let record = caricaRecord(g.id);
  let smontato = false;
  let giocoComanda: ((c: Comando | [Comando, number, number]) => void) | undefined;

  // --- Input di gioco (tastiera + touch) ---------------------------------------
  // Creato prima del dimensionamento: il pad (se presente) va misurato per
  // lasciare spazio al canvas.
  const input = CollegaInput({
    canvas,
    comandi: g.comandi,
    pad: g.pad ?? true,
    onComando: (c: Comando | [Comando, number, number]) => {
      if (stato !== 'attivo') return;
      giocoComanda?.(c);
    },
  });

  // --- Dimensionamento canvas (viewport + orientazione + DPR) -----------------
  // Il canvas deve stare nel viewport insieme a HUD e pad: si misurano
  // gli elementi reali (offsetHeight) e il canvas prende lo spazio residuo.
  const orientazione = g.orientazione ?? 'verticale';
  function dimensiona(): void {
    const larg = window.innerWidth;
    const pad = schermo.querySelector<HTMLElement>('.pad');
    const alt = Math.max(window.innerHeight - hud.offsetHeight - (pad?.offsetHeight ?? 0), 100);
    // Rapporto larg/alt: verticale 3:4, orizzontale 4:3 — centrato nel viewport.
    const rapporto = orientazione === 'verticale' ? 3 / 4 : 4 / 3;
    let cssW = larg;
    let cssH = larg / rapporto;
    if (cssH > alt) {
      cssH = alt;
      cssW = alt * rapporto;
    }
    canvas.style.width = `${Math.floor(cssW)}px`;
    canvas.style.height = `${Math.floor(cssH)}px`;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    const ctx2d = canvas.getContext('2d');
    if (ctx2d) ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0); // unità CSS
  }
  dimensiona();
  window.addEventListener('resize', dimensiona);

  const aggiornaHud = (punti: number): void => {
    puntiEl.textContent = `Punti: ${punti}`;
    recordEl.textContent = `Record: ${record}`;
  };
  aggiornaHud(0);

  const mostraOverlay = (titolo: string, dettaglio: string, badge: string | null, bottoni: [string, string, () => void][]): void => {
    overlay.textContent = '';
    const h2 = document.createElement('h2');
    h2.textContent = titolo;
    const p = document.createElement('p');
    p.textContent = dettaglio;
    overlay.append(h2, p);
    if (badge) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = badge;
      overlay.appendChild(b);
    }
    for (const [classe, etichetta, azione] of bottoni) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${classe}`;
      btn.dataset.teste = classe;
      btn.textContent = etichetta;
      btn.addEventListener('click', () => {
        beep(600, 0.04);
        azione();
      });
      overlay.appendChild(btn);
    }
    overlay.hidden = false;
  };

  const nascondiOverlay = (): void => {
    overlay.hidden = true;
    overlay.textContent = '';
  };

  // --- Flusso ------------------------------------------------------------------
  const pausa = (): void => {
    if (stato !== 'attivo') return;
    stato = 'pausa';
    handle?.pausa();
    mostraOverlay('Pausa', '', null, [
      ['riprendi', 'Riprendi', riprendi],
      ['menu', 'Menù', esci],
    ]);
  };

  const riprendi = (): void => {
    if (stato !== 'pausa') return;
    stato = 'attivo';
    handle?.riprendi();
    nascondiOverlay();
  };

  const riavvia = (): void => {
    handle?.reset();
    stato = 'attivo';
    aggiornaHud(0);
    nascondiOverlay();
  };

  const fine = (v: number): void => {
    if (stato === 'fine') return;
    stato = 'fine';
    const nuovo = salvaRecord(g.id, v);
    record = caricaRecord(g.id);
    aggiornaHud(v);
    // Beep: game over (2 note discendenti) + nuovo record (2 note ascendenti).
    beep(392, 0.12);
    window.setTimeout(() => beep(262, 0.2), 130);
    if (nuovo) window.setTimeout(() => beep(523, 0.1), 260);
    if (nuovo) window.setTimeout(() => beep(659, 0.15), 380);
    mostraOverlay('Game over', `Punteggio: ${v}`, nuovo ? 'Nuovo record!' : null, [
      ['rigioca', 'Rigioca', riavvia],
      ['menu', 'Menù', esci],
    ]);
  };

  const esci = (): void => {
    teardown();
    onEsci();
  };

  const apriLegenda = (): void => {
    legend.hidden = false
  }

  const chiudiLegenda = (): void => {
    legend.hidden = true
  }

  legendBtn.addEventListener('click', () => {
    if (legend.hidden) apriLegenda()
    else chiudiLegenda()
  })
  legend.addEventListener('click', (e: MouseEvent) => {
    if (e.target === legend) chiudiLegenda() // clic sullo sfondo
  })
  chiudiLegendaBtn.addEventListener('click', chiudiLegenda)

  // --- Tasti riservati al core (P/Escape pausa, R riavvio) ---------------------
  const onKey = (e: KeyboardEvent): void => {
    if (smontato) return;
    if (e.code === 'Escape' && !legend.hidden) {
      e.preventDefault()
      chiudiLegenda()
      return // il popup non mette in pausa il gioco
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      if (stato === 'attivo') pausa();
      else if (stato === 'pausa') riprendi();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      riavvia();
    }
  };
  window.addEventListener('keydown', onKey);

  // Auto-pausa quando la tab/app passa in background (Review Focus).
  const onVisibilita = (): void => {
    if (document.hidden) pausa();
  };
  document.addEventListener('visibilitychange', onVisibilita);

  // --- Pulsanti HUD -------------------------------------------------------------
  pausaBtn.addEventListener('click', () => {
    beep(600, 0.04);
    pausa();
  });
  chiudiBtn.addEventListener('click', () => {
    beep(600, 0.04);
    esci();
  });

  // --- Avvio del gioco -----------------------------------------------------------
  let handle: HandleGioco | undefined;
  handle = g.crea({
    canvas,
    invia: {
      punteggio(v: number): void {
        aggiornaHud(v);
      },
      fine,
    },
    comanda(fn: (c: Comando | [Comando, number, number]) => void): void {
      giocoComanda = fn;
    },
  });

  // --- Teardown completo ----------------------------------------------------------
  function teardown(): void {
    if (smontato) return;
    smontato = true;
    input.smonta();
    handle?.smonta();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', dimensiona);
    document.removeEventListener('visibilitychange', onVisibilita);
    host.textContent = '';
  }
}
