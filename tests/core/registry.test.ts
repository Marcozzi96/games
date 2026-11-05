import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Gioco } from '@/core/types';

type RegistryApi = typeof import('@/core/registry');

let registry: RegistryApi;

// Gioco fittizio minimale (il contratto Gioco richiede crea, ma il registry
// non lo chiama: un no-op basta).
function finto(id: string, nome: string): Gioco {
  return {
    id,
    nome,
    icona: `/icons/${id}.svg`,
    comandi: ['su'],
    crea: () => ({ pausa() {}, riprendi() {}, reset() {}, smonta() {} }),
  };
}

// Il registry è un modulo con stato: ogni test parte da un'istanza fresca.
beforeEach(async () => {
  vi.resetModules();
  registry = await import('@/core/registry');
});

describe('registry', () => {
  it('giochi() iniziale → []', () => {
    expect(registry.giochi()).toEqual([]);
  });

  it('registra + giochi() → contiene il gioco', () => {
    const g = finto('snake', 'Snake');
    registry.registra(g);
    expect(registry.giochi()).toContainEqual(g);
  });

  it('registra con id duplicato → throw', () => {
    registry.registra(finto('snake', 'Snake'));
    expect(() => registry.registra(finto('snake', 'Snake 2'))).toThrow(Error);
  });

  it('due giochi → ordinati per nome (localeCompare it)', () => {
    registry.registra(finto('zeta', 'Zeta'));
    registry.registra(finto('alfa', 'Alfa'));
    expect(registry.giochi().map((g) => g.nome)).toEqual(['Alfa', 'Zeta']);
  });
});
