// Smoke test dello schermo di gioco (Task 8): monta apriSchermo con il gioco
// finto e verifica il flusso base (HUD, comandi, pausa, game over, teardown).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finto } from './finto';

type ScreenApi = typeof import('@/app/screen');

let screen: ScreenApi;
let host: HTMLElement;
const onEsci = vi.fn();

function keydown(code: string): KeyboardEvent {
  const evt = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
  window.dispatchEvent(evt);
  return evt;
}

function apri(): void {
  screen.apriSchermo(finto, host, onEsci);
}

beforeEach(async () => {
  vi.resetModules();
  onEsci.mockClear();
  localStorage.clear();
  document.body.innerHTML = '';
  host = document.createElement('div');
  host.id = 'app';
  document.body.appendChild(host);
  screen = await import('@/app/screen');
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('apriSchermo', () => {
  it('costruisce HUD + canvas e il comando da tastiera aggiorna il punteggio', () => {
    apri();
    expect(host.querySelector('.hud')).not.toBeNull();
    expect(host.querySelector('canvas')).not.toBeNull();
    const punti = host.querySelector('[data-teste="punti"]')!;
    expect(punti.textContent).toBe('Punti: 0');
    keydown('ArrowUp');
    expect(punti.textContent).toBe('Punti: 10');
  });

  it('P pausa (overlay Riprendi/Menù) e P riprende', () => {
    apri();
    keydown('KeyP');
    expect(host.querySelector('.overlay')).not.toBeNull();
    expect(host.textContent).toContain('Riprendi');
    keydown('KeyP');
    expect((host.querySelector('.overlay') as HTMLElement).hidden).toBe(true);
  });

  it('R riavvia: punteggio a zero', () => {
    apri();
    keydown('ArrowUp');
    expect(host.querySelector('[data-teste="punti"]')!.textContent).toBe('Punti: 10');
    keydown('KeyR');
    expect(host.querySelector('[data-teste="punti"]')!.textContent).toBe('Punti: 0');
  });

  it('game over: overlay con punteggio, record e badge "Nuovo record!"', () => {
    vi.useFakeTimers();
    apri();
    vi.advanceTimersByTime(10_000); // il gioco finto emette fine(42)
    const overlay = host.querySelector('.overlay')!;
    expect(overlay.textContent).toContain('Game over');
    expect(overlay.textContent).toContain('42');
    expect(overlay.textContent).toContain('Nuovo record!');
    // il record è persistito
    expect(localStorage.getItem('games:score:finto')).toBe('42');
  });

  it('Rigioca dopo il game over: overlay nascosto, punteggio a zero', () => {
    vi.useFakeTimers();
    apri();
    vi.advanceTimersByTime(10_000);
    const rigioca = host.querySelector('[data-teste="rigioca"]')!;
    rigioca.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect((host.querySelector('.overlay') as HTMLElement).hidden).toBe(true);
    expect(host.querySelector('[data-teste="punti"]')!.textContent).toBe('Punti: 0');
  });

  it('✕ smonta: onEsci chiamato, host vuoto, nessun listener orfano', () => {
    apri();
    const chiudi = host.querySelector('[data-teste="chiudi"]')!;
    chiudi.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onEsci).toHaveBeenCalledTimes(1);
    expect(host.children.length).toBe(0);
    // nessun listener orfano: un keydown dopo il teardown non fa nulla
    keydown('ArrowUp');
    expect(host.textContent).toBe('');
  });

  it('dimensiona il canvas tenendo conto di HUD e pad (nessun overflow del viewport)', () => {
    // jsdom: offsetHeight = 0 sempre; mock a 50px per HUD e pad.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(50);
    apri();
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    // jsdom: innerHeight 768, innerWidth 1024, dpr 1.
    // alt disponibile = 768 - 50 (hud) - 50 (pad) = 668; verticale 3:4 → 501×668.
    expect(canvas.style.height).toBe('668px');
    expect(canvas.style.width).toBe('501px');
  });

  it('dopo due aperture consecutive i comandi non si duplicano', () => {
    apri();
    host.querySelector('[data-teste="chiudi"]' as string)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    apri();
    keydown('ArrowUp');
    expect(host.querySelector('[data-teste="punti"]')!.textContent).toBe('Punti: 10');
    // un solo comando → punteggio 10, non 20
    keydown('ArrowUp');
    expect(host.querySelector('[data-teste="punti"]')!.textContent).toBe('Punti: 20');
  });
});
