import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caricaMute } from '@/core/storage';

type AudioApi = typeof import('@/core/audio');

// Mock globale AudioContext (jsdom non lo fornisce).
function installaAudioContextMock() {
  const osc = {
    type: '',
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gainNode = {
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
  };
  const ctx = {
    destination: {},
    currentTime: 0,
    resume: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(() => osc),
    createGain: vi.fn(() => gainNode),
  };
  // Implementazione con funzione classica (non arrow): con `new`, Vitest
  // delega all'implementazione via Reflect.construct e le arrow non sono
  // costruibili (anche dopo vi.restoreAllMocks).
  const Ctor = vi.fn(function (this: unknown) {
    return ctx;
  });
  (globalThis as { AudioContext?: unknown }).AudioContext = Ctor;
  return { Ctor, ctx, osc, gainNode };
}

// Il modulo audio ha stato interno (AudioContext lazy): ogni test riparte
// da un'istanza fresca per non dipendere dall'ordine.
let audio: AudioApi;

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetModules();
  audio = await import('@/core/audio');
});

afterEach(() => {
  delete (globalThis as { AudioContext?: unknown }).AudioContext;
});

describe('mute', () => {
  it('iniziale con storage vuoto → false', () => {
    expect(audio.mute()).toBe(false);
  });

  it('setMute(true) → mute() true e persistito in storage', () => {
    audio.setMute(true);
    expect(audio.mute()).toBe(true);
    expect(caricaMute()).toBe(true);
  });
});

describe('beep', () => {
  it('non lancia se inizia() non è mai stata chiamata (nessun AudioContext)', () => {
    expect(() => audio.beep(440, 0.1)).not.toThrow();
  });

  it('dopo inizia() usa osc.connect/start/stop', () => {
    const { osc } = installaAudioContextMock();
    audio.inizia();
    audio.beep(440, 0.1);
    expect(osc.connect).toHaveBeenCalled();
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });

  it('con mute attivo non crea oscillatori', () => {
    const { ctx } = installaAudioContextMock();
    audio.inizia();
    audio.setMute(true);
    audio.beep(440, 0.1);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });
});
