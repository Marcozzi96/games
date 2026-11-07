// Input unificato: normalizza tastiera e touch in Comandi astratti.
// - Tastiera: listener keydown su window; emette solo i comandi dichiarati
//   dal gioco (R/P/Escape sono riservati al core di app/screen.ts).
// - Touch: pulsanti in un .pad inserito dopo il canvas (layout applicato da
//   app/screen.ts; soppresso con pad: false); per 'punta', drag diretto sul
//   canvas **col dito premuto** (solo dal pointer attivo), coordinate CSS
//   relative al canvas (setPointerCapture).
// - swipe-*: gesto riconosciuto al rilascio (pointerup/pointercancel del
//   pointer attivo): max(|dx|,|dy|) >= 24px → comando sull'asse dominante;
//   un solo swipe per gesto (sotto soglia = tap, nessun comando).
// - Il primo gesto (keydown o pointerdown) chiama audio.inizia() per
//   sbloccare l'AudioContext (politiche di autoplay).

import { inizia as iniziaAudio } from '@/core/audio';
import type { Comando } from '@/core/types';

export type CavalcaturaInput = {
  canvas: HTMLCanvasElement;
  comandi: Comando[]; // solo questi generano pulsanti/gesti
  pad?: boolean; // default true: false sopprime i pulsanti touch
  onComando: (c: Comando | [Comando, number, number]) => void;
};

const MAPPA_TASTI: Record<string, Comando> = {
  ArrowUp: 'su',
  KeyW: 'su',
  ArrowDown: 'giu',
  KeyS: 'giu',
  ArrowLeft: 'sx',
  KeyA: 'sx',
  ArrowRight: 'dx',
  KeyD: 'dx',
  Space: 'conferma',
  KeyX: 'ruota', // spec: decisione 9 (Tetris)
  Enter: 'ruota',
};

const NOME_TASTO: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  KeyW: 'W',
  KeyS: 'S',
  KeyA: 'A',
  KeyD: 'D',
  Space: 'Spazio',
  KeyX: 'X',
  Enter: 'Invio'
}

const ETICHETTE: Record<Comando, string> = {
  su: 'Su',
  giu: 'Giù',
  sx: 'Sinistra',
  dx: 'Destra',
  conferma: 'Conferma',
  ruota: 'Ruota',
  punta: 'Punta',
  'swipe-su': 'Swipe su',
  'swipe-giu': 'Swipe giù',
  'swipe-sx': 'Swipe sinistra',
  'swipe-dx': 'Swipe destra',
};

const DIREZIONI: Comando[] = ['su', 'giu', 'sx', 'dx'];
const SWIPE: Comando[] = ['swipe-su', 'swipe-giu', 'swipe-sx', 'swipe-dx'];
const SOGLIA_SWIPE = 24; // px CSS: sotto è un tap, non uno swipe

export type RigaLegenda = { tasti: string; etichetta: string }

export function legendaTasti(comandi: Comando[]): RigaLegenda[] {
  const righe: RigaLegenda[] = []
  for (const c of comandi) {
    if (c === 'punta') continue // non ha tasti: legenda solo da tastiera
    if (SWIPE.includes(c)) {
      righe.push({ tasti: 'Trascina', etichetta: ETICHETTE[c] })
      continue
    }
    const tasti = Object.keys(MAPPA_TASTI)
      .filter((k) => MAPPA_TASTI[k] === c)
      .map((k) => NOME_TASTO[k])
      .join('/')
    righe.push({ tasti, etichetta: ETICHETTE[c] })
  }
  righe.push({ tasti: 'P/Escape', etichetta: 'Pausa' })
  righe.push({ tasti: 'R', etichetta: 'Riavvia' })
  return righe
}

export function CollegaInput({ canvas, comandi, pad = true, onComando }: CavalcaturaInput): {
  smonta(): void;
} {
  const dichiarati = new Set(comandi);
  let attivo = true;
  let pointerAttivo: { id: number; x: number; y: number } | undefined;

  // --- Tastiera -----------------------------------------------------------
  const onKeydown = (e: KeyboardEvent): void => {
    if (!attivo) return;
    const comando = MAPPA_TASTI[e.code];
    // undefined copre anche R/P/Escape: riservati al core, mai emessi qui.
    if (comando === undefined || !dichiarati.has(comando)) return;
    e.preventDefault(); // altrimenti la pagina scrolla (frecce/spazio)
    iniziaAudio();
    onComando(comando);
  };
  window.addEventListener('keydown', onKeydown);

  // --- Pulsanti touch ------------------------------------------------------
  // pad: false (es. 2048, dove il touch è solo lo swipe) sopprime il pad.
  const padEl = document.createElement('div');
  padEl.className = 'pad';

  const pulsanti: Comando[] = [
    ...DIREZIONI.filter((c) => dichiarati.has(c)),
    ...(dichiarati.has('conferma') ? ['conferma' as Comando] : []),
    ...(dichiarati.has('ruota') ? ['ruota' as Comando] : []),
  ];

  for (const c of pulsanti) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.comando = c;
    b.className = `pad-btn pad-btn-${c}`;
    b.textContent = ETICHETTE[c];
    b.setAttribute('aria-label', ETICHETTE[c]);
    b.addEventListener('pointerdown', (e: PointerEvent) => {
      if (!attivo) return;
      e.preventDefault();
      iniziaAudio();
      onComando(c);
    });
    padEl.appendChild(b);
  }

  // --- Punta (drag col dito premuto) + swipe (*) ---------------------------
  const punta = (e: PointerEvent): [Comando, number, number] => {
    const rect = canvas.getBoundingClientRect();
    return ['punta', e.clientX - rect.left, e.clientY - rect.top];
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (!attivo) return;
    if (pointerAttivo !== undefined) return; // secondo dito: ignorato
    e.preventDefault();
    iniziaAudio();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer già rilasciato o id non valido: il drag prosegue lo stesso
    }
    // Punto di partenza in coordinate client: il delta del gesto è
    // e.clientX - inizio.x (px CSS), indipendente dalla posizione del canvas.
    pointerAttivo = { id: e.pointerId, x: e.clientX, y: e.clientY };
    if (dichiarati.has('punta')) onComando(punta(e));
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!attivo) return;
    if (pointerAttivo === undefined || e.pointerId !== pointerAttivo.id) return;
    if (dichiarati.has('punta')) onComando(punta(e));
  };

  // pointerup/pointercancel: al rilascio del pointer attivo, se il gesto
  // supera la soglia → comando swipe sull'asse dominante (solo se dichiarato).
  const rilascia = (e: PointerEvent): void => {
    if (!attivo) return;
    if (pointerAttivo === undefined || e.pointerId !== pointerAttivo.id) return;
    const dx = e.clientX - pointerAttivo.x;
    const dy = e.clientY - pointerAttivo.y;
    pointerAttivo = undefined;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SOGLIA_SWIPE) return; // tap
    const dir: Comando = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'swipe-dx' : 'swipe-sx')
      : (dy > 0 ? 'swipe-giu' : 'swipe-su');
    if (dichiarati.has(dir)) onComando(dir);
  };

  if (dichiarati.has('punta') || SWIPE.some((c) => dichiarati.has(c))) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', rilascia);
    canvas.addEventListener('pointercancel', rilascia);
  }

  // Inserisci il pad DOPO il canvas nel DOM (solo se abilitato e ci sono
  // pulsanti): app/screen.ts gli applicherà il layout.
  if (pad && pulsanti.length > 0) {
    canvas.after(padEl);
  }

  return {
    smonta(): void {
      attivo = false;
      pointerAttivo = undefined;
      window.removeEventListener('keydown', onKeydown);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', rilascia);
      canvas.removeEventListener('pointercancel', rilascia);
      padEl.remove();
    },
  };
}
