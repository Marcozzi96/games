// Registro dei giochi: ogni gioco si aggiunge registrandosi qui,
// senza toccare il resto dell'app (anti-goal del design).

import type { Gioco } from '@/core/types';

const giochiRegistrati: Gioco[] = [];
const idUsati = new Set<string>();

export function registra(g: Gioco): void {
  if (idUsati.has(g.id)) {
    throw new Error(`Gioco già registrato con id: ${g.id}`);
  }
  idUsati.add(g.id);
  giochiRegistrati.push(g);
}

// Ordine di presentazione nel menù: per nome, locale italiano.
export function giochi(): Gioco[] {
  return [...giochiRegistrati].sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
}
