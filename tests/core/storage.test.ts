import { beforeEach, describe, expect, it, vi } from 'vitest';
import { caricaMute, caricaRecord, salvaMute, salvaRecord } from '@/core/storage';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('caricaRecord', () => {
  it('ritorna 0 con storage vuoto', () => {
    expect(caricaRecord('snake')).toBe(0);
  });

  it('ritorna 0 e non lancia se getItem fallisce (storage non disponibile)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(caricaRecord('snake')).toBe(0);
  });
});

describe('salvaRecord', () => {
  it('registra un nuovo record e lo rende leggibile', () => {
    expect(salvaRecord('snake', 10)).toBe(true);
    expect(caricaRecord('snake')).toBe(10);
  });

  it('non sovrascrive un record più alto', () => {
    salvaRecord('snake', 10);
    expect(salvaRecord('snake', 5)).toBe(false);
    expect(caricaRecord('snake')).toBe(10);
  });

  it('rifiuta un punteggio non finito senza scrivere', () => {
    expect(salvaRecord('snake', Number.NaN)).toBe(false);
    expect(caricaRecord('snake')).toBe(0);
    expect(localStorage.getItem('games:score:snake')).toBeNull();
  });
});

describe('mute', () => {
  it('vuoto → false; salvaMute(true) persiste; valore corrotto → false', () => {
    expect(caricaMute()).toBe(false);
    salvaMute(true);
    expect(caricaMute()).toBe(true);
    localStorage.setItem('games:mute', 'xyz');
    expect(caricaMute()).toBe(false);
  });
});
