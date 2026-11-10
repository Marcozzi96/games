# Joystick touch per Snake — Design

**Data:** 2026-11-10
**Stato:** approvata (cambiamento piccolo)

## Intent e why

Il committente vuole lo stesso controllo touch di Pac-Man anche su Snake: il
thumbstick flottante al posto del pad a pulsanti, identico comportamento.

## Goals / non-goals / anti-goals

- **Goal:** Snake gestibile al touch col joystick flottante, stesso pattern di Pac-Man.
- **Non-goal:** modifiche alla logica del joystick (già completa e testata in `input.ts`),
  doppio controllo (joystick + pad), velocità proporzionale all'inclinazione.
- **Anti-goal:** cambiare il comportamento di Snake da tastiera o la sua logica di gioco.

## Vincoli

- Shell-only: i giochi non toccano il DOM; tutto il comportamento joystick
  è già generico in `input.ts`, `screen.ts` e `styles.css` (flag `g.joystick`).
- Snake dichiara già `comandi: ['su', 'giu', 'sx', 'dx']`: le direzioni emesse
  dal joystick (`su/giu/sx/dx`) sono già quelle gestite da `onComando`.

## Approaches considerati

1. **Unire il joystick alla shell di Snake** (scelto): già fatto — basta
   dichiarare `joystick: true` nel `Gioco` di Snake. È l'unico modo che non
   duplica codice; la spec del joystick lo prevede esplicitamente ("riutilizzabile,
   es. snake").
2. **Pad dedicato a Snake** (scartato): è ciò che il committente vuole sostituire.
3. **Joystick fisso in un angolo** (scartato): già scartato nella spec del joystick.

## Design

- `src/games/snake/snake.ts`: aggiungere `joystick: true` alla dichiarazione
  di `Gioco` (stesso identico campo di `pacman.ts`).
- Conseguenze automatiche della shell, nessuna modifica aggiuntiva:
  - `joystick: true` ⇒ nessun `.pad` (i pulsanti spariscono, il canvas guadagna l'altezza).
  - Legenda `(i)`: riga "Trascina — Joystick" aggiunta da `legendaTasti`.
  - I gestori `punta`/swipe non sono registrati (Snake non li dichiara comunque).
- Test: `tests/games/snake/snake.test.ts`, nel test "è registrato col contratto
  atteso": `expect(snake.joystick).toBe(true)` (pattern identico a
  `tests/games/pacman/pacman.test.ts`).
- Verifica end-to-end già coperta dalla smoke test del joystick generico
  (`tests/smoke/screen.test.ts`), che usa `joystick: true` su un gioco finto.

## Lasciato al builder

- Nulla: l'implementazione è determinata (una riga di codice + un'asercione di test).
