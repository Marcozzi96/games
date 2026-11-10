# Joystick touch per Snake — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Snake si controlla al touch col joystick flottante, identico a Pac-Man.

**Architecture:** Il joystick è già una feature generica della shell (`input.ts`,
`screen.ts`, `styles.css`) pilotata dal flag `Gioco.joystick`. Il piano dichiara
il flag su Snake e lo fissa col test del contratto; nessun altro codice cambia.

**Tech Stack:** TypeScript, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-10-snake-joystick-design.md`

## Global Constraints

- I giochi non toccano il DOM: pad/joystick/legenda sono affari della shell.
- Regola shell esistente: `joystick: true` ⇒ nessun `.pad` e nessun gestore
  `punta`/swipe (documentata in `src/core/input.ts` e testata in
  `tests/core/input.test.ts`, describe "joystick").
- `comandi: ['su', 'giu', 'sx', 'dx']` di Snake resta invariato: le direzioni
  emesse dal joystick sono esattamente quelle che `onComando` di Snake gestisce.
- Stile del progetto: no semicoloni, `import type`, commit message in italiano
  col prefisso `feat(scope):`.

## Review Focus

Input/failure mode che la spec implica ma che il test del task non esercita
direttamente, già coperti da test esistenti della shell (citate, non duplicate):

1. **Primo gesto joystick avvia un gioco non ancora avviato (lazy start)** —
   atteso: la prima direzione emessa dal joystick avvia Snake come farebbe una
   freccia. Pin: `tests/smoke/screen.test.ts:156` (end-to-end `joystick: true`)
   + `tests/games/snake/snake.test.ts` "avvio pigro" (stesso path `onComando`).
2. **Secondo dito durante un drag** — atteso: ignorato, nessun comando doppio.
   Pin: `tests/core/input.test.ts` (guardia `stick !== undefined`).
3. **Movimento sotto la deadzone (20px)** — atteso: nessun comando emesso.
   Pin: `tests/core/input.test.ts` (describe "joystick").
4. **Rilascio e nuovo gesto nella stessa direzione** — atteso: ri-emette
   (memoria azzerata al `pointerup`). Pin: `tests/core/input.test.ts`.
5. **Teardown (`smonta`)** — atteso: listener rimossi, `.joystick` rimosso dal
   DOM, nessun comando dopo lo smontaggio. Pin: `tests/core/input.test.ts`
   "teardown: niente più comandi e nessun .joystick residuo".

---

### Task 1: Dichiarare `joystick: true` su Snake

**Files:**
- Modify: `src/games/snake/snake.ts:169-175` (dichiarazione `export const snake: Gioco`)
- Test: `tests/games/snake/snake.test.ts:34-39` (test "è registrato col contratto atteso")

**Interfaces:**
- Consumes: `Gioco.joystick?: boolean` (già definito in `src/core/types.ts`);
  `apriSchermo` (`src/app/screen.ts`) lo legge per `CollegaInput` e `legendaTasti`.
- Produces: `snake.joystick === true` (contratto del gioco, letto dalla shell).

- [ ] **Step 1: Scrivi il test fallente**

Nella suite di `tests/games/snake/snake.test.ts`, nel test esistente
`'è registrato col contratto atteso'` (dopo l'asercione su `comandi`), aggiungi:

```ts
    expect(snake.joystick).toBe(true)
```

- [ ] **Step 2: Esegui il test, verifica che fallisca**

Run: `npx vitest run tests/games/snake/snake.test.ts`
Expected: FAIL — `expected undefined to be true` (o equivalente: l'asercione
sul flag fallisce perché `snake.joystick` è `undefined`).

- [ ] **Step 3: Implementa**

In `src/games/snake/snake.ts`, nella dichiarazione `export const snake: Gioco`
(oggi righe 169-175), aggiungi `joystick: true,` dopo `comandi`, replicando
l'ordine usato in `src/games/pacman/pacman.ts`:

```ts
export const snake: Gioco = {
  id: 'snake',
  nome: 'Snake',
  icona: '/icons/icon-snake.svg',
  comandi: ['su', 'giu', 'sx', 'dx'],
  joystick: true,
  crea,
}
```

- [ ] **Step 4: Esegui il test, verifica che passi**

Run: `npx vitest run tests/games/snake/snake.test.ts`
Expected: PASS (tutti i test della suite, inclusi i 7+ preesistenti).

- [ ] **Step 5: Esegui la suite completa**

Run: `npm test`
Expected: PASS — nessun regressione (in particolare
`tests/core/input.test.ts` e `tests/smoke/screen.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/games/snake/snake.ts tests/games/snake/snake.test.ts
git commit -m "feat(snake): joystick touch al posto del pad a pulsanti"
```
