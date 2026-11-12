# Design: doppio tap per la rotazione (Tetris)

**Data:** 2026-11-12
**Stato:** proposto

## Intent e perché

Nel Tetris touch la rotazione oggi è un flick verso l'alto veloce e lungo (≥ 56px,
≥ 0.5 px/ms): gesto impreciso e scomodo. Il doppio tap sul canvas è più semplice e
affidabile. Decisione dell'utente: il doppio tap **sostituisce** la rotazione da
flick su, non si aggiunge ad essa.

## Obiettivi

- Due tap entro una finestra temporale sul canvas → comando `doppio-tap` (core,
  riutilizzabile da altri giochi).
- Tetris: la rotazione touch passa al doppio tap; `swipe-su` rimosso dai comandi
  del gioco.
- Tastiera invariata (X / Invio / ↑ / W ruotano).
- Invariati: flick orizzontali (gettata), flick giù (hard drop), drag orizzontale
  (segue il dito), singolo tap (resta muto).

## Non-obiettivi

- Nessuna distanza massima tra i due tap: ogni tap è già < 24px di spostamento,
  l'esclusione degli swipe è già gestita dalla soglia esistente.
- Nessun doppio tap sui pulsanti del pad (Tetris ha `pad: false`; i pulsanti del
  core restano invariati).
- Nessun cambio di comportamento per gli altri giochi (2048, snake, pacman non
  dichiarano `doppio-tap`).

## Vincoli

- La riconoscimento dei gesti touch vive in `CollegaInput` (`src/core/input.ts`):
  è lì che va la rilevazione del doppio tap, in coerenza con swipe e joystick.
- Il tap singolo è già muto → nessun ritardo da introdurre: il doppio tap si
  emette subito sul secondo tap, senza conflitti con un comportamento di tap
  singolo da rinviare.
- Nuovo comando = aggiornamento di `Comando` (`types.ts`), `ETICHETTE` +
  `legendaTasti` (`input.ts`) e test. Niente CSS (nessun pulsante pad) e niente
  voci in `MAPPA_TASTI` (è un gesto touch-only).

## Approcci (scelti in conversazione)

- **A) Core: comando `doppio-tap` rilevato da `input.ts`** — SCELTO. Riutilizzabile,
  logica del tempo in un punto solo, coerente con la gestione esistente degli
  swipe.
- **B) Core emette un `tap` generico, ogni gioco conta i doppi** — scartato: ogni
  gioco reimplementerebbe il timing; il core ha già il riconoscimento degli
  altri gesti.

## Design concreto

### `src/core/types.ts`
- Unione `Comando`: aggiunta di `'doppio-tap'`.

### `src/core/input.ts`
- Nuova costante `SOGLIA_DOPPIO_TAP = 300` (ms).
- In `rilascia()`, ramo tap (sotto `SOGLIA_SWIPE`):
  - se `Date.now() - ultimoTap <= SOGLIA_DOPPIO_TAP` (con `ultimoTap` definita) e
    `doppio-tap` è dichiarato → `onComando('doppio-tap')`, `ultimoTap = undefined`
    (reset: tre tap rapidi = un solo doppio tap + un nuovo tap pendente);
  - altrimenti `ultimoTap = Date.now()` (tap pendente).
  - ramo swipe: `ultimoTap = undefined` (uno swipe "rompe" la sequenza: swipe+tap non
    conta come doppio tap — call del builder).
- `ETICHETTE`: `'doppio-tap': 'Doppio tap'`.
- `legendaTasti()`: caso dedicato (come `punta`/swipe), nessuna tastiera:
  `{ tasti: 'Doppio tocco', etichetta: 'Doppio tap' }` (solo se dichiarato).
- Aggiornare il commento di header ("la rotazione di Tetris è uno swipe su" →
  doppio tap) e il commento del ramo tap in `rilascia`.
- `smonta()`: azzerare `ultimoTap`.
- Condizione di aggancio dei listener pointer sul canvas: aggiungere
  `dichiarati.has('doppio-tap')` all'OR esistente (così anche un gioco che
  dichiara solo `doppio-tap` riceve gli eventi).

### `src/games/tetris/tetris.ts`
- `comandi`: toglie `'swipe-su'`, aggiunge `'doppio-tap'`.
- `applicaComando()`: `case 'swipe-su'` diventa `case 'doppio-tap'`: ruota (+ beep
  se la forma cambia), senza gating di velocità (il doppio tap è già un gesto
  qualificato). Pulizia dello stato gesto (`seg`, `gestoAttivo`) come nel caso
  `ruota`.
- Aggiornare i commenti che citano il flick su come rotazione.
- Edge case noto (accettato): dopo un tap il core non emette nulla al rilascio,
  quindi `gestoAttivo` resta `true` e `t0` va in stallo; il handler di
  `doppio-tap` lo azzera, e uno `t0` stantio rende i flick successivi solo più
  "lenti" (`classificaRilascio` → `'nessuno'`), mai azioni spurie.

### Test
- `tests/core/input.test.ts`:
  - doppio tap entro 300ms con `doppio-tap` dichiarato → emesso esattamente una
    volta, sul secondo tap (mockato `Date.now`);
  - tap distanti > 300ms → non emesso;
  - `doppio-tap` non dichiarato → non emesso (tap resta muto);
  - swipe tra i due tap → non emesso (sequenza rotta);
  - tre tap rapidi → un solo `doppio-tap`;
  - aggiornamento del test "tap sotto la soglia: muto anche se ruota è
    dichiarato" (il tap singolo resta muto; la motivazione del commento cambia:
    la rotazione passa al doppio tap);
  - aggiornamento dei test `legendaTasti` (contratto Tetris: via `Swipe su`,
    in più la riga doppio tap; contratto 2048 invariato).
- `tests/games/tetris/`: la rotazione via touch si verifica con `doppio-tap`;
  `swipe-su` non fa più nulla (non è più nei comandi dichiarati).
- Verifica: `npm test` completo + `npm run build`.

## Call del builder (marchiate, correggibili)

- Finestra doppio tap: **300 ms** (range usuale 200–350).
- Nessuna distanza massima tra i due tap.
- Uno swipe annulla il tap pendente (swipe+tap ≠ doppio tap).
