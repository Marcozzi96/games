// Input unificato: normalizza tastiera e touch in Comandi astratti.
// - Tastiera: listener keydown su window; emette solo i comandi dichiarati
//   dal gioco (R/P/Escape sono riservati al core di app/screen.ts).
// - Touch: pulsanti in un .pad inserito dopo il canvas (layout applicato da
//   app/screen.ts; soppresso con pad: false); per 'punta', drag diretto sul
//   canvas **col dito premuto** (solo dal pointer attivo), coordinate CSS
//   relative al canvas (setPointerCapture).
// - swipe-*: gesto riconosciuto al rilascio (pointerup/pointercancel del
//   pointer attivo): max(|dx|,|dy|) >= 24px → comando sull'asse dominante;
//   sotto soglia = tap → muto (la rotazione di Tetris è uno swipe su).
// - joystick: thumbstick flottante (compare dove poggia il dito, lo segue,
//   scompare al rilascio); emette direzione dominante solo al cambio di
//   direzione; sopprime il pad e i gestori punta/swipe.
// - Il primo gesto (keydown o pointerdown) chiama audio.inizia() per
//   sbloccare l'AudioContext (politiche di autoplay).

import { inizia as iniziaAudio } from '@/core/audio';
import type { Comando } from '@/core/types';

export type CavalcaturaInput = {
  canvas: HTMLCanvasElement;
  comandi: Comando[]; // solo questi generano pulsanti/gesti
  pad?: boolean; // default true: false sopprime i pulsanti touch
  joystick?: boolean; // default false: thumbstick flottante (sopprime pad e swipe/punta)
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
const SOGLIA_JOYSTICK = 20; // px CSS: sotto non si emette nulla
const MAX_SPOSTAMENTO_KNOB = 28; // px CSS: spostamento max del knob

export type RigaLegenda = { tasti: string; etichetta: string }

export function legendaTasti(comandi: Comando[], joystick = false): RigaLegenda[] {
  const righe: RigaLegenda[] = []
  for (const c of comandi) {
    if (c === 'punta') {
      // 'punta' non ha tasti ma è un gesto touch (drag): lo mostro in legenda.
      righe.push({ tasti: 'Trascina', etichetta: 'Muovi' })
      continue
    }
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
  if (joystick) {
    righe.push({ tasti: 'Trascina', etichetta: 'Joystick' })
  }
  righe.push({ tasti: 'P/Escape', etichetta: 'Pausa' })
  righe.push({ tasti: 'R', etichetta: 'Riavvia' })
  return righe
}

export function CollegaInput({ canvas, comandi, pad = true, joystick = false, onComando }: CavalcaturaInput): {
  smonta(): void;
} {
  const dichiarati = new Set(comandi);
  let attivo = true;
  let pointerAttivo: { id: number; x: number; y: number } | undefined;

  // Stato joystick
  let stick: { id: number; x0: number; y0: number } | undefined;
  let ultimoDir: Comando | undefined;
  let stickEl: HTMLElement | undefined;
  let knobEl: HTMLElement | undefined;

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

  const pulsanti: Comando[] = joystick
    ? []
    : [
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
  // Attivi solo se joystick non è attivo (il joystick vince sulla mutua esclusione).
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
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SOGLIA_SWIPE) {
      // Tap sotto la soglia: muto. La rotazione si fa con uno swipe su
      // (Tetris); qui il tap non genera più comandi (evita rotazioni casuali
      // quando si vuole solo spostare il pezzo di poco).
      return;
    }
    const dir: Comando = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'swipe-dx' : 'swipe-sx')
      : (dy > 0 ? 'swipe-giu' : 'swipe-su');
    if (dichiarati.has(dir)) onComando(dir);
  };

  if (!joystick && (dichiarati.has('punta') || SWIPE.some((c) => dichiarati.has(c)))) {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', rilascia);
    canvas.addEventListener('pointercancel', rilascia);
  }

  // --- Joystick (thumbstick flottante) --------------------------------------
  // Compare dove poggia il dito, lo segue, scompare al rilascio.
  // Emette la direzione dominante solo al cambio di direzione (non a ogni move).
  const onStickDown = (e: PointerEvent): void => {
    if (!attivo) return;
    if (stick !== undefined) return; // secondo dito: ignorato
    e.preventDefault();
    iniziaAudio();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer già rilasciato o id non valido
    }
    stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
    // L'overlay è position:absolute rispetto a host (.canvas-wrap in prod):
    // le coordinate vanno calcolate rispetto a host, NON al canvas (che nella
    // wrap è centrato via flex center), altrimenti lo stick è spostato dal dito.
    const host = canvas.parentElement ?? canvas;
    const rect = host.getBoundingClientRect();
    stickEl = document.createElement('div');
    stickEl.className = 'joystick';
    stickEl.style.left = `${e.clientX - rect.left}px`;
    stickEl.style.top = `${e.clientY - rect.top}px`;
    knobEl = document.createElement('div');
    knobEl.className = 'joystick-knob';
    stickEl.appendChild(knobEl);
    host.appendChild(stickEl);
  };

  const onStickMove = (e: PointerEvent): void => {
    if (!attivo) return;
    if (stick === undefined || e.pointerId !== stick.id) return;
    const dx = e.clientX - stick.x0;
    const dy = e.clientY - stick.y0;
    const m = Math.hypot(dx, dy);
    // Sposta il knob (clampato a MAX_SPOSTAMENTO_KNOB)
    if (knobEl) {
      const k = m > MAX_SPOSTAMENTO_KNOB ? MAX_SPOSTAMENTO_KNOB / m : 1;
      knobEl.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    }
    // Emissione: solo oltre deadzone e solo al cambio di direzione
    if (m < SOGLIA_JOYSTICK) return;
    const dir: Comando = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'dx' : 'sx')
      : (dy > 0 ? 'giu' : 'su');
    if (!dichiarati.has(dir) || dir === ultimoDir) return;
    ultimoDir = dir;
    onComando(dir);
  };

  const rilasciaJoystick = (e: PointerEvent): void => {
    if (!attivo) return;
    if (stick === undefined || e.pointerId !== stick.id) return;
    stick = undefined;
    ultimoDir = undefined; // memoria azzerata: un nuovo gesto ri-emette la stessa direzione
    stickEl?.remove();
    stickEl = undefined;
    knobEl = undefined;
  };

  if (joystick) {
    canvas.addEventListener('pointerdown', onStickDown);
    canvas.addEventListener('pointermove', onStickMove);
    canvas.addEventListener('pointerup', rilasciaJoystick);
    canvas.addEventListener('pointercancel', rilasciaJoystick);
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
      stick = undefined;
      ultimoDir = undefined;
      stickEl?.remove();
      stickEl = undefined;
      knobEl = undefined;
      window.removeEventListener('keydown', onKeydown);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', rilascia);
      canvas.removeEventListener('pointercancel', rilascia);
      canvas.removeEventListener('pointerdown', onStickDown);
      canvas.removeEventListener('pointermove', onStickMove);
      canvas.removeEventListener('pointerup', rilasciaJoystick);
      canvas.removeEventListener('pointercancel', rilasciaJoystick);
      padEl.remove();
    },
  };
}
