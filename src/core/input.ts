// Input unificato: normalizza tastiera e touch in Comandi astratti.
// - Tastiera: listener keydown su window; emette solo i comandi dichiarati
//   dal gioco (R/P/Escape sono riservati al core di app/screen.ts).
// - Touch: pulsanti in un .pad inserito dopo il canvas (layout applicato da
//   app/screen.ts); per 'punta', drag diretto sul canvas con coordinate CSS
//   relative al canvas (setPointerCapture).
// - Il primo gesto (keydown o pointerdown) chiama audio.inizia() per
//   sbloccare l'AudioContext (politiche di autoplay).

import { inizia as iniziaAudio } from '@/core/audio';
import type { Comando } from '@/core/types';

export type CavalcaturaInput = {
  canvas: HTMLCanvasElement;
  comandi: Comando[]; // solo questi generano pulsanti/gesti
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

const ETICHETTE: Record<Comando, string> = {
  su: 'Su',
  giu: 'Giù',
  sx: 'Sinistra',
  dx: 'Destra',
  conferma: 'Conferma',
  ruota: 'Ruota',
  punta: 'Punta',
};

const DIREZIONI: Comando[] = ['su', 'giu', 'sx', 'dx'];

export function CollegaInput({ canvas, comandi, onComando }: CavalcaturaInput): {
  smonta(): void;
} {
  const dichiarati = new Set(comandi);
  let attivo = true;

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
  const pad = document.createElement('div');
  pad.className = 'pad';

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
    pad.appendChild(b);
  }

  // --- Punta (drag sul canvas) ---------------------------------------------
  const punta = (e: PointerEvent): [Comando, number, number] => {
    const rect = canvas.getBoundingClientRect();
    return ['punta', e.clientX - rect.left, e.clientY - rect.top];
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (!attivo) return;
    e.preventDefault();
    iniziaAudio();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer già rilasciato o id non valido: il drag prosegue lo stesso
    }
    onComando(punta(e));
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!attivo) return;
    onComando(punta(e));
  };

  if (dichiarati.has('punta')) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
  }

  // Inserisci il pad DOPO il canvas nel DOM (solo se ci sono pulsanti):
  // app/screen.ts gli applicherà il layout.
  if (pulsanti.length > 0) {
    canvas.after(pad);
  }

  return {
    smonta(): void {
      attivo = false;
      window.removeEventListener('keydown', onKeydown);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      pad.remove();
    },
  };
}
