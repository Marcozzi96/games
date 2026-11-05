# Design: tasto "su" = ruota nel Tetris + popup legenda comandi

**Data:** 2026-07-18
**Stato:** proposta

## Intent

Due migliorie piccole al gioco:

1. Nel Tetris il tasto freccia-su (e il pulsante touch "Su") devono ruotare il
   pezzo: è l'abitudine standard nei Tetris, oggi ↑/W non fa nulla perché il
   Tetris non dichiara `su`.
2. Su ogni schermo di gioco, un bottone `(i)` in basso a destra apre un popup
   con la legenda dei comandi da tastiera, derivata dai comandi dichiarati dal
   gioco + i tasti di sistema.

## Goals / Non-goals

- **Goal:** ↑/W e "Su" ruotano nel Tetris (X/Invio restano validi); bottone `(i)`
  cliccabile in basso a destra; popup legenda chiudibile.
- **Non-goal:** binding del tasto `i` (il popup si apre SOLO col clic sul
  bottone); keymap personalizzabile per gioco; modifiche a Snake o ad altri giochi.

## Approaches

| Opzione | Pro | Contro |
|---------|-----|--------|
| **A. Alias nel gioco** (scelta) | zero modifiche al core; 1 file | il pad touch del Tetris guadagna un bottone "Su" (coerente con la richiesta) |
| B. Keymap per gioco nel core (`Gioco.tasti`) | generale | cambiamento di tipi + input + test: overkill |
| C. Rimappatura globale ↑ = ruota | 1 riga | rompe il Snake (usa `su` per salire) |

**Scelta: A** — il Tetris dichiara `su` e la tratta come alias di `ruota`.

## Design

### 1. Tetris: `su` = `ruota`

- `comandi: ['su', 'sx', 'dx', 'giu', 'ruota', 'conferma']`
- In `applicaComando`, `case 'su'` cade in `case 'ruota'` (alias).
- Effetto: freccia-su/W ruotano; il pad touch mostra anche "Su" (stessa azione).

### 2. Bottone `(i)` + popup legenda (shell, tutti i giochi)

- `src/core/input.ts`: esporta `legendaTasti(comandi: Comando[]): { tasti: string; etichetta: string }[]`
  — una riga per comando dichiarato (tasti reali da `MAPPA_TASTI`, etichetta da
  `ETICHETTE`), più le righe fisse `P/Escape → Pausa` e `R → Riavvia`.
- `src/app/screen.ts`: bottone `(i)` posizionato in basso a destra dello schermo
  (`position: fixed`, sopra il pad); al clic apre un overlay (stesso pattern
  dell'overlay esistente) con titolo "Comandi" e la lista; si chiude col
  bottone "Chiudi" o cliccando fuori dall'overlay.
- Il popup NON mette in pausa il gioco: si apre sopra, il gioco continua.
  (Se il gioco è in pausa, il popup si apre sopra l'overlay pausa.)
- `src/styles.css`: classi `.legend-btn` e `.legend` (overlay riutilizzato o
  variante).

### 3. Test

- `tests/games/tetris/tetris.test.ts`: contratto aggiornato (comandi include `su`);
  un comando `su` ruota (stesso effetto di `ruota`).
- `tests/core/input.test.ts` (o nuovo): `legendaTasti` restituisce le righe attese
  per un set di comandi.
- Smoke: il bottone `(i)` esiste, apre il popup, "Chiudi" lo nasconde.

## Rischio

Basso: niente logica di gioco toccata, niente API pubblica cambiata (solo un
export aggiunto in input.ts).
