# Tetris — design

**Data:** 2026-11-05
**Dimensione:** piccolo (un gioco, terzo della lista candidata della spec shell)

## Intent

Inserire il terzo gioco nel game shell: un Tetris **classico moderno** —
abbastanza fedele da essere "vero Tetris", abbastanza magro da stare nella
shell mobile-first senza UI extra. Il contratto `Gioco` è già validato da
Snake; qui si usa lo stesso pattern (logica pura + renderer).

## Decisioni approvate (dalla conversazione)

- **Scope: opzione 2 "classico moderno"** (scelta dell'utente): 7-bag,
  ghost piece, anteprima next (1 tessera), hard drop, wall-kick semplice.
  **No** hold, **no** 3 anteprime, **no** T-spin/back-to-back.
- **Comandi dichiarati:** `['sx', 'dx', 'giu', 'ruota', 'conferma']` —
  tutti già supportati da `core/input.ts` (`ruota` mappata anche su X/Invio
  per la spec shell, decisione 9).

## Decisioni del builder (da confermare)

- **Griglia 10×20**, orientamento verticale (default shell). La griglia è
  scalata per adattarsi al canvas (`cella = min(larg/10, alt/20)`),
  centrata con offset — stesso approccio di Snake.
- **Tessere:** le 7 standard (I, O, T, S, Z, J, L) con colori classici
  (I ciano, O giallo, T viola, S verde, Z rosso, J blu, L arancio).
  Spawn: al centro in cima; **block out** (collisione allo spawn) = fine.
- **Rotazione:** 90° in senso orario, con **wall-kick semplice**: si prova
  l'offset 0 e poi ±1, ±2 colonne; la prima posizione libera vince. (Non è
  SRS: più semplice, comportamento prevedibile.)
- **Randomizer: 7-bag** — si mescolano le 7 tessere e si distribuiscono;
  a borsa vuota se ne genera una nuova. L'anteprima mostra la prossima
  tessera della stessa sequenza (quella che arriva davvero).
- **Gravità:** 800 ms per passo al livello 1; −70 ms per livello; minimo
  100 ms. **+1 livello ogni 10 linee** eliminate.
- **Punteggio (guideline classica):** 1/2/3/4 linee = 100/300/500/800 ×
  livello corrente; soft drop +1 per cella; hard drop +2 per cella.
- **Comportamento dei comandi:**
  - `sx`/`dx`: sposta di 1 cella se possibile; la ripetizione del tasto
    (auto-repeat del browser) fa da DAS "gratis".
  - `giu` (soft drop): 1 passo immediato, +1 punto, e per ~150 ms la
    gravità passa a 50 ms (discesa accelerata finché si continua a
    premere; poi torna alla gravità normale).
  - `ruota`: rotazione oraria con wall-kick.
  - `conferma` (hard drop): scende fino al ghost e blocca immediatamente,
    +2 per cella.
  - Dopo il lock (o dopo l'hard drop) la tessera successiva scende dal
    bag: nessun lock delay nella v1.
- **Ghost piece:** copia semitrasparente (stessa tessera, alpha ~0.25)
  proiettata sulla posizione di atterraggio.
- **Suoni (beep WebAudio, stile Snake):** soft/hard drop (tono corto
  basso), rotazione (tono medio), linea (tono alto), più linee (corta
  sequenza), livello (tono più lungo), game over (tono discendente).
  Tutti via `beep()` esistente; nessun nuovo asset.
- **Avvio:** la prima tessera aspetta un input ("Premi un tasto per
  iniziare"), come Snake; poi il loop riparte. `reset`/`smonta`/pausa
  seguono il pattern di Snake (timer `setInterval`, niente rAF).
- **Rendering:** sfondo scuro, griglia sottile, tessere come quadrati
  con bordo interno (effetto blocco), ghost semitrasparente, next
  disegnata in alto nel canvas (area di ~2 righe dedicate sopra la
  griglia, non nel HUD della shell).

## Approcci considerati

1. **Logica pura separata + renderer canvas** (scelto, come Snake): stato
   (griglia, tessera corrente, bag, next, punti, linee, livello) in
   funzioni pure testabili con Vitest; `crea()` tiene solo timer, input,
   disegno. La fisica del Tetris (collisioni, rotazioni, bag, scoring) è
   la parte più interessante da testare: qui vale la pena.
2. Tutto dentro `crea()`: più corto, ma la logica di rotazione/bag sarebbe
   intestabile in modo significativo (jsdom non ha canvas 2d).
3. Loop continuo (rAF) con accumulatore di tempo: più flessibile per
   animazioni, ma il gioco è a step discreti; `setInterval` basta e costa
   meno codice.

## Struttura

```
src/games/tetris/
├── logica.ts      # stato + funzioni pure: creaStato, bag, muovi, ruota,
│                  # softDrop, hardDrop, lock, tick, ghost
└── tetris.ts      # Gioco: crea(ctx) → loop setInterval, rendering, invia
public/icons/icon-tetris.svg
tests/games/tetris/logica.test.ts
```

- `main.ts` fa `registra(tetris)` (import del gioco), come Snake.
- Il gioco non tocca file fuori dalla sua cartella (anti-goal della spec
  shell): zero modifiche a `core/` o `app/`.

## Vincoli

- Niente dipendenze nuove, niente asset (icona SVG a mano come snake).
- Giocabile in verticale su telefono con i pulsanti del pad generati
  dalla shell (5 pulsanti: sx, dx, giu + ruota + conferma).

## Lasciato al builder

- Estetica esatta (spessori, sfumature leggere, dimensioni del next box).
- Valori precisi dei beep (frequenze/durata), coerenti con i giochi
  esistenti.
- Dettagli di edge case del lock (es. lock sulla riga 20 → la riga è
  eliminabile prima del block out).
