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

function collega(comandi: Comando[]) {
  const h = input.CollegaInput({ canvas, comandi, onComando });
  handle.push(h);
  return h;
}

function keydown(code: string) {
  const evt = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  window.dispatchEvent(evt);
  return evt;
}

function pointerdown(el: Element, x = 0, y = 0) {
  const evt = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    clientX: x,
    clientY: y,
  });
  el.dispatchEvent(evt);
  return evt;
}

function pointermove(el: Element, x = 0, y = 0) {
  const evt = new PointerEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
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
});
