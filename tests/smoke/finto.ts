// Fixture di test per lo schermo di gioco (Task 8): gioco minimale che muove
// un quadrato con i comandi direzionali ed emette invia.punteggio(10) a ogni
// comando. Dopo 10 secondi (smoke manuale) emette invia.fine(42).
// NON registrato nel registry: è solo una fixture in tests/.

import type { Comando, Gioco } from '@/core/types';

export const finto: Gioco = {
  id: 'finto',
  nome: 'Finto',
  icona: '/icons/icon.svg',
  comandi: ['su', 'giu', 'sx', 'dx'],
  crea(ctx) {
    let x = 100;
    let y = 100;
    let punti = 0;
    let smontato = false;

    const disegna = (): void => {
      const c = ctx.canvas.getContext('2d');
      if (!c) return; // jsdom: nessun contesto 2d
      c.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      c.fillStyle = '#4ade80';
      c.fillRect(x, y, 32, 32);
    };
    disegna();

    const timer = window.setTimeout(() => {
      if (!smontato) ctx.invia.fine(42);
    }, 10_000);

    const onComando = (c: Comando | [Comando, number, number]): void => {
      if (typeof c !== 'string') return;
      if (c === 'su') y -= 10;
      if (c === 'giu') y += 10;
      if (c === 'sx') x -= 10;
      if (c === 'dx') x += 10;
      punti += 10;
      ctx.invia.punteggio(punti);
      disegna();
    };
    ctx.comanda(onComando);

    return {
      pausa(): void {},
      riprendi(): void {},
      reset(): void {
        x = 100;
        y = 100;
        punti = 0;
        ctx.invia.punteggio(0);
        disegna();
      },
      smonta(): void {
        smontato = true;
        window.clearTimeout(timer);
      },
    };
  },
};
