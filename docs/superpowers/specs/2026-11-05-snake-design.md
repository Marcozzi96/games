# Snake — design

**Data:** 2026-11-05
**Dimensione:** piccolo (un gioco, primo della lista candidata della spec shell)

## Intent

Inserire il primo gioco nel game shell: Snake classico, per validare il contratto
`Gioco` in un gioco reale (loop a tick, griglia, punteggio, game over) e dare
qualcosa di giocabile nel menù.

## Decisioni approvate

- **Griglia 18×24** (rapporto 3:4, orientamento verticale = default). Il
  gioco non tocca la dimensione del canvas (la gestisce la shell): la griglia
  è scalata per adattarsi, `cella = min(larg/18, alt/24)`, centrata con offset.
  Al resize la shell ridimensiona; il gioco ridisegna allo step successivo
  (o su richiesta, ricalcolando le metriche da `canvas.width/height` a ogni
  disegno — unità CSS via DPR già impostato dalla shell).
- **Muri = morte** (variante classica); morte anche per auto-collisione.
- **Velocità:** ~7 tick/s all'inizio (intervallo ≈ 140 ms), −5 ms per ogni
  cibo, minimo 70 ms.
- **Punteggio:** +10 per cibo.
- **Cibo:** mai spawnato sopra la serpente; se la griglia è piena → vittoria
  (game over con il punteggio).
- **Avvio pigro:** la serpente parte ferma, messaggio "Premi una freccia per
  iniziare"; la prima freccia (o pulsante pad direzionale) avvia il movimento
  nella direzione premuta. Nessun comando `conferma` dichiarato: P/Escape/R
  della shell restano i soli tasti di flusso.
- **Input:** comandi dichiarati `['su', 'giu', 'sx', 'dx']`. Un comando
  opposto alla direzione corrente è ignorato; i comandi si accodano in una
  coda (max ~3) così due giri rapidi consecutivi non si perdono.

## Approcci considerati

1. **Logica pura separata + renderer canvas** (scelto): lo stato del gioco
   (griglia, serpente, direzione, cibo, tick) vive in funzioni pure testabili
   con Vitest/jsdom; `crea()` tiene solo loop, input e disegno. I test
   coprono movimento, crescita, collisioni e spawn senza toccare il canvas.
2. Tutto dentro `crea()` con timer: più corto, ma la logica non sarebbe
   testabile in modo significativo (jsdom non ha canvas 2d) e i test
   diventerebbero smoke.
3. Loop continuo (rAF) invece di tick: più codice e niente da guadagnare per
   un Snake a griglia.

## Struttura

```
src/games/snake/
├── logica.ts      # stato + funzioni pure: creaStato, tick, gira, ciboRandom
└── snake.ts       # Gioco: crea(ctx) → loop setInterval, rendering, invia
public/icons/icon-snake.svg
tests/games/snake/logica.test.ts
```

- `snake.ts` registra l'oggetto `Gioco` (`id: 'snake'`, `nome: 'Snake'`,
  `icona: '/icons/icon-snake.svg'`) e `main.ts` fa `registra(snake)`
  (import del gioco).
- Rendering: sfondo scuro, griglia sottile, serpente verde (testa più chiara),
  cibo rosso/arancio; font per il messaggio di attesa e per "game over"
  gestiti dall'overlay della shell (il gioco solo smette di disegnare il
  messaggio).
- Beep: uso `beep()` del core per cibo e game over è già della shell.
- `reset()` → nuovo stato in attesa; `smonta()` → clearInterval.
- Stile: niente semicoloni, `void` esplicito, `import type`, alias `@/`.

## Non-obiettivi

- Nessuna difficoltà selezionabile, nessun wrap, nessuna memoria locale extra
  (il record è già gestito dalla shell per id), nessun asset audio/immagine
  oltre all'icona SVG.
