# Piano: tasto "su" = ruota nel Tetris + popup legenda comandi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nel Tetris ↑/W e il bottone "Su" ruotano il pezzo; su ogni gioco un bottone `(i)` in basso a destra apre un popup con la legenda dei comandi da tastiera.

**Architecture:** alias locale nel Tetris (dichiara `su`, lo tratta come `ruota`); la shell espone `legendaTasti()` da `input.ts` (deriva le righe dai comandi dichiarati + tasti di sistema) e `screen.ts` aggiunge il bottone `(i)` + un secondo overlay riutilizzando il pattern dell'overlay esistente.

**Tech Stack:** TypeScript strict, Vitest + jsdom, CSS singolo (`styles.css`).

**Spec:** `docs/superpowers/specs/2026-07-18-tetris-legenda-design.md`

## Global Constraints

- No semicoloni; `import type` per i tipi; funzioni senza ritorno significativo dichiarate `void`.
- I giochi non toccano il DOM: la legenda è responsabilità della shell (`screen.ts`), non di Tetris.
- Il popup NON mette in pausa il gioco e NON si apre con il tasto `i` (solo col clic sul bottone).
- R/Escape/P restano riservati al core (`screen.ts`); `input.ts` non li emette mai.
- jsdom non ha 2d context: i test del rendering sono no-op silenziosi; si testano DOM/flusso.

## Review Focus

- **Pausa + popup aperti insieme**: Escape/P devono continuare a gestire pausa/riprendi anche col popup aperto (il popup non intercetta i tasti).
- **Clic fuori dal popup** (sullo sfondo scuro) lo chiude; il clic sul bottone `(i)` mentre è aperto lo chiude (toggle).
- **Teardown con popup aperto**: `✕` (o `esci`) con il popup visibile deve smontare tutto senza listener orfani.
- **Pad touch del Tetris**: con `su` dichiarato il pad ha 6 pulsanti (Su in row 1) — il layout grid 3×3 + row 3 full-width non deve rompersi.
- **`legendaTasti` con `punta` dichiarato**: `punta` non ha tasti → la riga viene omessa (legenda da tastiera).

---

### Task 1: Tetris — `su` come alias di `ruota`

**Files:**
- Modify: `src/games/tetris/tetris.ts` (comandi + `applicaComando`)
- Test: `tests/games/tetris/tetris.test.ts`

**Interfaces:**
- Consumes: Task 1 non dipende da altri task.
- Produces: `tetris.comandi === ['su', 'sx', 'dx', 'giu', 'ruota', 'conferma']`; un comando `'su'` ha lo stesso effetto di `'ruota'`.

- [ ] **Step 1: Scrivi i test fallenti**

In `tests/games/tetris/tetris.test.ts`:

1. Aggiorna il test "è registrato col contratto atteso":

```ts
expect(tetris.comandi).toEqual(['su', 'sx', 'dx', 'giu', 'ruota', 'conferma'])
```

2. Aggiungi un test dopo "hard drop: …":

```ts
it('su è alias di ruota: la forma cambia come con ruota', () => {
  const { ctx, comanda } = ctxFinto()
  comanda('sx') // avvia (I orizzontale)
  comanda('su') // alias di ruota: I diventa verticale 4×1
  // ghost verticale da y=0 = 16 → hard drop = 32 (come il test "hard drop")
  comanda('conferma')
  expect(ctx.invia.punteggio).toHaveBeenCalledWith(32)
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run tests/games/tetris/tetris.test.ts`
Expected: FAIL — `tetris.comandi` non include `su`; il comando `su` non fa nulla (punteggio 38, non 32).

- [ ] **Step 3: Implementa l'alias**

In `src/games/tetris/tetris.ts`:
- `comandi: ['su', 'sx', 'dx', 'giu', 'ruota', 'conferma']`
- In `applicaComando`, `case 'su':` cade dentro `case 'ruota':` (fall-through, nessun `break` intermedio).

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run tests/games/tetris/tetris.test.ts`
Expected: PASS (tutti i test, incluso "19 tick di gravità" — `sx` avvia, `su` non è più un comando sconosciuto).

- [ ] **Step 5: Commit**

```bash
git add src/games/tetris/tetris.ts tests/games/tetris/tetris.test.ts
git commit -m "feat(tetris): su/W come alias di ruota (tastiera + pad touch)"
```

---

### Task 2: `legendaTasti()` in `input.ts`

**Files:**
- Modify: `src/core/input.ts`
- Test: `tests/core/input.test.ts`

**Interfaces:**
- Consumes: `MAPPA_TASTI` e `ETICHETTE` (già presenti in `input.ts`).
- Produces:

```ts
export type RigaLegenda = { tasti: string; etichetta: string }
export function legendaTasti(comandi: Comando[]): RigaLegenda[]
```

- [ ] **Step 1: Scrivi i test fallenti**

In `tests/core/input.test.ts`, dentro `describe('input')`:

```ts
it('legendaTasti: una riga per comando dichiarato (ordine dichiarato) + Pausa/Riavvia', () => {
  expect(input.legendaTasti(['sx', 'dx', 'giu', 'ruota', 'conferma'])).toEqual([
    { tasti: '←/A', etichetta: 'Sinistra' },
    { tasti: '→/D', etichetta: 'Destra' },
    { tasti: '↓/S', etichetta: 'Giù' },
    { tasti: 'X/Invio', etichetta: 'Ruota' },
    { tasti: 'Spazio', etichetta: 'Conferma' },
    { tasti: 'P/Escape', etichetta: 'Pausa' },
    { tasti: 'R', etichetta: 'Riavvia' },
  ])
})

it('legendaTasti: punta omessa (non ha tasti)', () => {
  expect(input.legendaTasti(['punta', 'conferma'])).toEqual([
    { tasti: 'Spazio', etichetta: 'Conferma' },
    { tasti: 'P/Escape', etichetta: 'Pausa' },
    { tasti: 'R', etichetta: 'Riavvia' },
  ])
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run tests/core/input.test.ts`
Expected: FAIL — `input.legendaTasti` non è definita.

- [ ] **Step 3: Implementa `legendaTasti`**

In `src/core/input.ts`, vicino a `MAPPA_TASTI`:

```ts
const NOME_TASTO: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  KeyW: 'W',
  KeyS: 'S',
  KeyA: 'A',
  KeyD: 'D',
  Space: 'Spazio',
  KeyX: 'X',
  Enter: 'Invio',
}
```

`legendaTasti(comandi)`: per ogni comando in `comandi` (ordine dichiarato), salta `'punta'`,
raccolge i codici da `MAPPA_TASTI` che lo mappano (ordine di `MAPPA_TASTI`), li converte con
`NOME_TASTO` e li giunge con `'/'`; etichetta da `ETICHETTE`. In coda le righe fisse
`{ tasti: 'P/Escape', etichetta: 'Pausa' }` e `{ tasti: 'R', etichetta: 'Riavvia' }`.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run tests/core/input.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/input.ts tests/core/input.test.ts
git commit -m "feat(input): legendaTasti() — legenda comandi da tastiera per gioco"
```

---

### Task 3: Bottone `(i)` + popup legenda in `screen.ts`

**Files:**
- Modify: `src/app/screen.ts`
- Modify: `src/styles.css`
- Test: `tests/smoke/screen.test.ts`

**Interfaces:**
- Consumes: `legendaTasti(comandi): RigaLegenda[]` da `@/core/input` (Task 2); `g.comandi`.
- Produces: bottone `button.legend-btn[data-teste="legenda"]` (testo `(i)`) in basso a destra;
  overlay `.legend` (hidden di default) con `h2` "Comandi", righe `tasti — etichetta`,
  bottone `button.btn[data-teste="chiudi-legenda"]` "Chiudi".

- [ ] **Step 1: Scrivi i test fallenti**

In `tests/smoke/screen.test.ts`, dentro `describe('apriSchermo')`:

```ts
it('(i) apre il popup legenda con le righe dei comandi del gioco', () => {
  apri()
  const btn = host.querySelector('[data-teste="legenda"]') as HTMLButtonElement
  expect(btn).not.toBeNull()
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const legend = host.querySelector('.legend') as HTMLElement
  expect(legend).not.toBeNull()
  expect(legend.hidden).toBe(false)
  expect(legend.textContent).toContain('Comandi')
  expect(legend.textContent).toContain('↑/W') // finto dichiara 'su'
  expect(legend.textContent).toContain('P/Escape')
})

it('Chiudi e clic sullo sfondo chiudono il popup; (i) è toggle', () => {
  apri()
  const btn = host.querySelector('[data-teste="legenda"]') as HTMLButtonElement
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  const legend = host.querySelector('.legend') as HTMLElement
  const chiudi = legend.querySelector('[data-teste="chiudi-legenda"]') as HTMLButtonElement
  chiudi.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(legend.hidden).toBe(true)
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) // riapre
  expect(legend.hidden).toBe(false)
  legend.dispatchEvent(new MouseEvent('click', { bubbles: true })) // clic sullo sfondo
  expect(legend.hidden).toBe(true)
})

it('Escape chiude il popup senza toccare la pausa', () => {
  apri()
  const btn = host.querySelector('[data-teste="legenda"]') as HTMLButtonElement
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  keydown('Escape')
  const legend = host.querySelector('.legend') as HTMLElement
  expect(legend.hidden).toBe(true)
  expect((host.querySelector('.overlay') as HTMLElement).hidden).toBe(true) // nessuna pausa
})

it('teardown con popup aperto: nessun listener orfano', () => {
  apri()
  host.querySelector('[data-teste="legenda"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  host.querySelector('[data-teste="chiudi"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(host.children.length).toBe(0)
})
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run tests/smoke/screen.test.ts`
Expected: FAIL — `[data-teste="legenda"]` non esiste.

- [ ] **Step 3: Implementa bottone + popup**

In `src/app/screen.ts`:

- Importa `legendaTasti` da `@/core/input` (tipo `RigaLegenda` con `import type`).
- Dopo `overlay`, crea `legend` (`div.legend`, `hidden = true`) dentro `schermo`:
  dentro un pannello (`div`) un `h2` "Comandi", un `div.legend-righe` con una
  `div.legend-riga` per riga di `legendaTasti(g.comandi)` — ogni riga con due span
  (`<span>`tasti`</span><span>`etichetta`</span>`, giustificati a sinistra/destra) —
  e `button.btn[data-teste="chiudi-legenda"]` "Chiudi".
- Crea `legendBtn` (`button.legend-btn[data-teste="legenda"]`, testo `(i)`,
  `aria-label="Comandi da tastiera"`) dentro `schermo`.
- `apriLegenda()`: `legend.hidden = false`.
- `chiudiLegenda()`: `legend.hidden = true`.
- `legendBtn` click → toggle: se `legend.hidden` → `apriLegenda()`, altrimenti `chiudiLegenda()`.
- `legend` click (bubbles dal click sullo sfondo): `if (e.target === legend) chiudiLegenda()`.
- Bottone "Chiudi" → `chiudiLegenda()`.
- In `onKey`: se `e.code === 'Escape'` e il popup è aperto → `chiudiLegenda()`,
  `preventDefault`, return (la pausa NON scatta). Il resto di `onKey` invariato.
- In `teardown()`: niente da aggiungere (il popup è nel DOM di `schermo`, rimosso da
  `host.textContent = ''`; il listener di `onKey` è già rimosso).

In `src/styles.css`:

```css
.legend-btn {
  position: fixed;
  right: 12px;
  bottom: 12px;
  min-width: 44px;
  min-height: 44px;
  background: var(--surface);
  color: #9ca3af;
  border: 1px solid #1f2937;
  border-radius: 10px;
  cursor: pointer;
  z-index: 20;
}

.legend {
  /* stesso pattern di .overlay ma più piccolo: pannello centrato */
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(11, 16, 32, 0.85);
  z-index: 30;
}

.legend[hidden] {
  display: none;
}

.legend > div {
  background: var(--surface);
  border: 1px solid #1f2937;
  border-radius: 12px;
  padding: 20px 24px;
  min-width: 240px;
}

.legend h2 {
  margin: 0 0 12px;
  font-size: 1.2rem;
}

.legend-riga {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 4px 0;
  color: #9ca3af;
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run tests/smoke/screen.test.ts`
Expected: PASS (i test esistenti non devono regredire, in particolare "P pausa" e "✕ smonta").

- [ ] **Step 5: Test completi + build**

Run: `npm test && npm run build`
Expected: tutti i test PASS, build senza errori.

- [ ] **Step 6: Commit**

```bash
git add src/app/screen.ts src/styles.css tests/smoke/screen.test.ts
git commit -m "feat(screen): bottone (i) + popup legenda comandi da tastiera"
```

---

## Note per chi esegue

- Il pad touch del Tetris con `su` dichiarato ha 6 pulsanti: Su (row 1 col 2), sx/giu/dx
  (row 2), Conferma+Ruota (row 3 full-width). La grid `.pad` è `3 col × auto row` —
  la row 3 esiste già (`grid-row: 3`), niente cambio CSS.
- `legendaTasti` itera `comandi` nell'ordine dichiarato: per il finto
  (`['su','giu','sx','dx']`) la prima riga è `↑/W — Su`.
- Se il test "(i) apre il popup" fallisce per il testo `↑/W`, ricontrolla `NOME_TASTO`
  e l'ordine di `MAPPA_TASTI` (ArrowUp prima di KeyW) invece di cambiare l'atteso.
