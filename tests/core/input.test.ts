import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comando } from '@/core/types';

type InputApi = typeof import('@/core/input');
type AudioApi = typeof import('@/core/audio');

let input: InputApi;
let audio: AudioApi;
let canvas: HTMLCanvasElement;
const onComando = vi.fn();

// Ogni CollegaInput aggiunge listener su window: se non li smontiamo a
// ogni test, i listener dei test precedenti (stesso jsdom window) ricevono
// gli eventi e falsano gli assert. Tracciamo i handle e li smontiamo tutti.
const handle: { smonta(): void }[] = [];

function collega(comandi: Comando[], pad?: boolean) {
  const h = input.CollegaInput({ canvas, comandi, pad, onComando });
  handle.push(h);
  return h;
}

function keydown(code: string) {
  const evt = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  window.dispatchEvent(evt);
  return evt;
}

function pointerdown(el: Element, x = 0, y = 0, id = 1) {
  const evt = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    clientX: x,
    clientY: y,
  });
  el.dispatchEvent(evt);
  return evt;
}

function pointermove(el: Element, x = 0, y = 0, id = 1) {
  const evt = new PointerEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    clientX: x,
    clientY: y,
  });
  el.dispatchEvent(evt);
  return evt;
}

function pointerup(el: Element, x = 0, y = 0, id = 1) {
  const evt = new PointerEvent('pointerup', {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    clientX: x,
    clientY: y,
  });
  el.dispatchEvent(evt);
  return evt;
}

function pointercancel(el: Element, x = 0, y = 0, id = 1) {
  const evt = new PointerEvent('pointercancel', {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    clientX: x,
    clientY: y,
  });
  el.dispatchEvent(evt);
  return evt;
}

// jsdom: i client rect sono tutti 0; mock deterministico per i test 'punta'.
function mockaRect(left = 10, top = 20, width = 300, height = 400) {
  return vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockReturnValue({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => undefined } as DOMRect);
}

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  onComando.mockClear();
  canvas = document.createElement('canvas');
  document.body.innerHTML = '';
  document.body.appendChild(canvas);
  input = await import('@/core/input');
  audio = await import('@/core/audio');
});

afterEach(() => {
  for (const h of handle.splice(0)) h.smonta();
  document.body.innerHTML = '';
});

describe('input', () => {
  it('frecce/WASD/spazio emettono i comandi dichiarati e il primo gesto sblocca l\'audio', () => {
    const Ctor = vi.fn(function (this: unknown) {
      return { destination: {}, currentTime: 0, resume: vi.fn().mockResolvedValue(undefined) };
    });
    (globalThis as { AudioContext?: unknown }).AudioContext = Ctor;
    collega(['su', 'giu', 'sx', 'dx', 'conferma']);
    keydown('ArrowUp');
    keydown('KeyD');
    keydown('KeyW');
    keydown('Space');
    expect(onComando).toHaveBeenNthCalledWith(1, 'su');
    expect(onComando).toHaveBeenNthCalledWith(2, 'dx');
    expect(onComando).toHaveBeenNthCalledWith(3, 'su');
    expect(onComando).toHaveBeenNthCalledWith(4, 'conferma');
    // primo keydown = gesto utente → inizia() crea l'AudioContext
    expect(Ctor).toHaveBeenCalledTimes(1);
  });

  it('chiama preventDefault() sui tasti gestiti (la pagina non deve scrollare)', () => {
    collega(['su', 'conferma']);
    const su = keydown('ArrowUp');
    const spazio = keydown('Space');
    expect(su.defaultPrevented).toBe(true);
    expect(spazio.defaultPrevented).toBe(true);
  });

  it('R, P ed Escape sono riservati al core: non emettono comandi', () => {
    collega(['su', 'conferma']);
    keydown('KeyR');
    keydown('KeyP');
    keydown('Escape');
    expect(onComando).not.toHaveBeenCalled();
  });

  it('X e Invio emettono ruota se dichiarato (spec: decisione 9)', () => {
    collega(['ruota']);
    keydown('KeyX');
    keydown('Enter');
    expect(onComando).toHaveBeenNthCalledWith(1, 'ruota');
    expect(onComando).toHaveBeenNthCalledWith(2, 'ruota');
  });

  it('4 direzioni → 4 pulsanti nel pad dopo il canvas; punta → nessun pulsante', () => {
    collega(['su', 'giu', 'sx', 'dx']);
    const pad = document.querySelector('.pad');
    expect(pad).not.toBeNull();
    expect(canvas.nextElementSibling).toBe(pad);
    expect(pad!.querySelectorAll('button').length).toBe(4);

    document.body.innerHTML = '';
    document.body.appendChild(canvas);
    collega(['punta']);
    expect(document.querySelector('.pad')).toBeNull();
  });

  it('tap sul pulsante dx → onComando(dx) e il gesto sblocca l\'audio', () => {
    const Ctor = vi.fn(function (this: unknown) {
      return { destination: {}, currentTime: 0, resume: vi.fn().mockResolvedValue(undefined) };
    });
    (globalThis as { AudioContext?: unknown }).AudioContext = Ctor;
    collega(['dx']);
    const pulsante = document.querySelector('.pad button[data-comando="dx"]');
    expect(pulsante).not.toBeNull();
    pointerdown(pulsante!);
    expect(onComando).toHaveBeenCalledWith('dx');
    expect(Ctor).toHaveBeenCalledTimes(1);
  });

  it('pointerdown + pointermove → onComando([punta, x, y]) in coordinate CSS relative al canvas', () => {
    mockaRect(10, 20, 300, 400);
    collega(['punta']);
    const down = pointerdown(canvas, 55, 75);
    expect(down.defaultPrevented).toBe(true);
    pointermove(canvas, 88, 144);
    expect(onComando).toHaveBeenNthCalledWith(1, ['punta', 45, 55]);
    expect(onComando).toHaveBeenNthCalledWith(2, ['punta', 78, 124]);
  });

  it('comando non dichiarato: Space non emette conferma', () => {
    collega(['su', 'giu']);
    keydown('Space');
    expect(onComando).not.toHaveBeenCalled();
  });

  it('smonta(): niente più comandi da tasti/pulsanti/pointer, pulsanti rimossi dal DOM', () => {
    mockaRect(0, 0, 300, 400);
    const h = collega(['su', 'dx', 'punta']);
    expect(document.querySelector('.pad')).not.toBeNull();
    h.smonta();
    expect(document.querySelector('.pad')).toBeNull();
    keydown('ArrowUp');
    pointerdown(canvas, 10, 10);
    expect(onComando).not.toHaveBeenCalled();
  });

  it('legendaTasti: una riga per comando dichiarato (ordine dichiarato) + Pausa/Riavvia', () => {
    expect(input.legendaTasti(['sx', 'dx', 'giu', 'ruota', 'conferma'])).toEqual([
      { tasti: '←/A', etichetta: 'Sinistra' },
      { tasti: '→/D', etichetta: 'Destra' },
      { tasti: '↓/S', etichetta: 'Giù' },
      { tasti: 'X/Invio', etichetta: 'Ruota' },
      { tasti: 'Spazio', etichetta: 'Conferma' },
      { tasti: 'P/Escape', etichetta: 'Pausa' },
      { tasti: 'R', etichetta: 'Riavvia' },
    ])
  })

  it('legendaTasti: punta omessa (non ha tasti)', () => {
    expect(input.legendaTasti(['punta', 'conferma'])).toEqual([
      { tasti: 'Spazio', etichetta: 'Conferma' },
      { tasti: 'P/Escape', etichetta: 'Pausa' },
      { tasti: 'R', etichetta: 'Riavvia' },
    ])
  })

  it('swipe oltre soglia: le 4 direzioni emettono il comando al rilascio (nessun comando durante il move)', () => {
    mockaRect(10, 20, 300, 400);
    collega(['swipe-sx', 'swipe-dx', 'swipe-su', 'swipe-giu']);
    pointerdown(canvas, 100, 100);
    pointermove(canvas, 150, 105); // durante il drag: niente comandi
    expect(onComando).not.toHaveBeenCalled();
    pointerup(canvas, 200, 110); // dx=100, dy=10 → orizzontale destra
    expect(onComando).toHaveBeenLastCalledWith('swipe-dx');
    pointerdown(canvas, 100, 100);
    pointerup(canvas, 100, 200); // dy=100 → verticale giù (y cresce verso il basso)
    expect(onComando).toHaveBeenLastCalledWith('swipe-giu');
    pointerdown(canvas, 200, 100);
    pointerup(canvas, 100, 110); // dx=-100 → sinistra
    expect(onComando).toHaveBeenLastCalledWith('swipe-sx');
    pointerdown(canvas, 100, 200);
    pointerup(canvas, 100, 100); // dy=-100 → su
    expect(onComando).toHaveBeenLastCalledWith('swipe-su');
  });

  it('swipe: asse dominante con delta 30x10 → orizzontale; soglia esatta 24px → emesso', () => {
    mockaRect(10, 20, 300, 400);
    collega(['swipe-sx', 'swipe-dx', 'swipe-su', 'swipe-giu']);
    pointerdown(canvas, 100, 100);
    pointerup(canvas, 130, 110); // |dx|=30 > |dy|=10, oltre soglia
    expect(onComando).toHaveBeenLastCalledWith('swipe-dx');
    pointerdown(canvas, 100, 100);
    pointerup(canvas, 124, 100); // max = 24 → >= soglia: emesso
    expect(onComando).toHaveBeenLastCalledWith('swipe-dx');
  });

  it('tap sotto la soglia (max |d| < 24) → nessun comando', () => {
    mockaRect(10, 20, 300, 400);
    collega(['swipe-sx', 'swipe-dx', 'swipe-su', 'swipe-giu']);
    pointerdown(canvas, 100, 100);
    pointerup(canvas, 110, 105); // max = 10 < 24
    expect(onComando).not.toHaveBeenCalled();
    pointerdown(canvas, 100, 100);
    pointerup(canvas, 100, 100); // tap secco
    expect(onComando).not.toHaveBeenCalled();
  });

  it('punta: pointermove SENZA pointerdown non emette più niente (regressione hover)', () => {
    mockaRect(10, 20, 300, 400);
    collega(['punta']);
    pointermove(canvas, 88, 144);
    expect(onComando).not.toHaveBeenCalled();
  });

  it('due swipe consecutivi: esattamente un comando per gesto (Review Focus)', () => {
    mockaRect(10, 20, 300, 400);
    collega(['swipe-sx', 'swipe-dx', 'swipe-su', 'swipe-giu']);
    pointerdown(canvas, 100, 100);
    pointerup(canvas, 200, 100);
    pointerdown(canvas, 200, 100);
    pointerup(canvas, 100, 100);
    expect(onComando).toHaveBeenCalledTimes(2);
    expect(onComando).toHaveBeenNthCalledWith(1, 'swipe-dx');
    expect(onComando).toHaveBeenNthCalledWith(2, 'swipe-sx');
  });

  it('secondo pointerdown durante un gesto: ignorato; il suo pointerup non emette (Review Focus)', () => {
    mockaRect(10, 20, 300, 400);
    collega(['swipe-sx', 'swipe-dx', 'swipe-su', 'swipe-giu']);
    pointerdown(canvas, 100, 100, 1);
    pointerdown(canvas, 50, 50, 2); // secondo dito: ignorato
    pointermove(canvas, 150, 102, 2); // move del secondo dito: niente
    pointerup(canvas, 60, 50, 2); // rilascio del secondo dito: niente
    pointerup(canvas, 200, 100, 1); // rilascio del primo: dx=100
    expect(onComando).toHaveBeenCalledTimes(1);
    expect(onComando).toHaveBeenNthCalledWith(1, 'swipe-dx');
  });

  it('pointercancel conta come rilascio (Review Focus)', () => {
    mockaRect(10, 20, 300, 400);
    collega(['swipe-sx', 'swipe-dx', 'swipe-su', 'swipe-giu']);
    pointerdown(canvas, 100, 100);
    pointercancel(canvas, 200, 100); // oltre soglia
    expect(onComando).toHaveBeenLastCalledWith('swipe-dx');
    pointerdown(canvas, 100, 100);
    pointercancel(canvas, 105, 100); // sotto soglia
    expect(onComando).toHaveBeenCalledTimes(1);
  });

  it('swipe non dichiarato: non emesso (listener agganciati ma filtro per comandi dichiarati)', () => {
    mockaRect(10, 20, 300, 400);
    collega(['swipe-dx']);
    pointerdown(canvas, 100, 100);
    pointerup(canvas, 100, 200); // verticale: swipe-giu non dichiarato
    expect(onComando).not.toHaveBeenCalled();
  });

  it('pad: false → nessun .pad nel DOM nemmeno con 4 direzioni dichiarate (come 2048)', () => {
    collega(['su', 'giu', 'sx', 'dx'], false);
    expect(document.querySelector('.pad')).toBeNull();
    document.body.innerHTML = '';
    document.body.appendChild(canvas);
    collega(['su', 'giu', 'sx', 'dx']); // default: pad presente con 4 pulsanti
    expect(document.querySelector('.pad')?.querySelectorAll('button').length).toBe(4);
  });

  it('smonta(): niente swipe né punta dopo il teardown (Review Focus)', () => {
    mockaRect(0, 0, 300, 400);
    const h = collega(['swipe-dx', 'punta']);
    h.smonta();
    pointerdown(canvas, 100, 100);
    pointerup(canvas, 200, 100);
    expect(onComando).not.toHaveBeenCalled();
  });

  it('legendaTasti: riga per comando 2048 completo (4 frecce + 4 swipe) + Pausa/Riavvia', () => {
    expect(input.legendaTasti(['su', 'giu', 'sx', 'dx', 'swipe-sx', 'swipe-dx', 'swipe-su', 'swipe-giu'])).toEqual([
      { tasti: '↑/W', etichetta: 'Su' },
      { tasti: '↓/S', etichetta: 'Giù' },
      { tasti: '←/A', etichetta: 'Sinistra' },
      { tasti: '→/D', etichetta: 'Destra' },
      { tasti: 'Trascina', etichetta: 'Swipe sinistra' },
      { tasti: 'Trascina', etichetta: 'Swipe destra' },
      { tasti: 'Trascina', etichetta: 'Swipe su' },
      { tasti: 'Trascina', etichetta: 'Swipe giù' },
      { tasti: 'P/Escape', etichetta: 'Pausa' },
      { tasti: 'R', etichetta: 'Riavvia' },
    ])
  })
});
