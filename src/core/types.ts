// Tipi condivisi della shell (fonte di verità per giochi e core).

export type Comando = 'su' | 'giu' | 'sx' | 'dx' | 'conferma' | 'ruota' | 'punta';

export type HandleGioco = {
  pausa(): void;
  riprendi(): void;
  reset(): void;
  smonta(): void;
};

export type CtxGioco = {
  canvas: HTMLCanvasElement;
  invia: {
    punteggio(v: number): void; // aggiorna HUD
    fine(v: number): void; // game over → overlay
  };
  // Registra un listener sui comandi; il core smonta al teardown.
  // Il payload 'punta' arriva come tuple ['punta', x, y] in coordinate CSS
  // relative al canvas.
  comanda: (fn: (c: Comando | [Comando, number, number]) => void) => void;
};

export type Gioco = {
  id: string;
  nome: string;
  icona: string; // path SVG pubblico
  comandi: Comando[];
  orientazione?: 'verticale' | 'orizzontale'; // default 'verticale'
  crea: (ctx: CtxGioco) => HandleGioco;
};
