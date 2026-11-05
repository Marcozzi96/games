// Persistenza in localStorage con degrado silenzioso:
// se lo storage non è disponibile (i-frame, private browsing, quota piena)
// ogni funzione degrada a 0 / false senza lanciare.

const chiaveScore = (id: string) => `games:score:${id}`;
const CHIAVE_MUTE = 'games:mute';

function leggi(chiave: string): string | null {
  try {
    return localStorage.getItem(chiave);
  } catch {
    return null;
  }
}

function scrivi(chiave: string, valore: string): boolean {
  try {
    localStorage.setItem(chiave, valore);
    return true;
  } catch {
    return false;
  }
}

export function caricaRecord(id: string): number {
  const grezzo = leggi(chiaveScore(id));
  const valore = grezzo === null ? Number.NaN : Number(grezzo);
  return Number.isFinite(valore) ? valore : 0;
}

// Ritorna true solo se è un nuovo record (punteggio finito e maggiore
// dell'attuale). Non scrive in nessun altro caso.
export function salvaRecord(id: string, punteggio: number): boolean {
  if (!Number.isFinite(punteggio)) return false;
  if (punteggio <= caricaRecord(id)) return false;
  return scrivi(chiaveScore(id), String(punteggio));
}

export function caricaMute(): boolean {
  return leggi(CHIAVE_MUTE) === '1';
}

export function salvaMute(v: boolean): void {
  scrivi(CHIAVE_MUTE, v ? '1' : '0');
}
