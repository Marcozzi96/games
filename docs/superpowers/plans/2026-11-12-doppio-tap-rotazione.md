# Piano di implementazione: doppio tap per la rotazione (Tetris)

> **Per i worker agentici:** SUB-SKILL RICHIESTA: usare superpowers:subagent-driven-development (consigliato) o superpowers:executing-plans per implementare il piano task per task. I passi usano la sintassi checkbox (`- [ ]`) per il tracking.

**Goal:** aggiungere il comando `doppio-tap` all'input core e, nel Tetris, sostituire la rotazione da flick su con il doppio tap sul canvas.

**Architecture:** la rilevazione vive in `CollegaInput` (`src/core/input.ts`): due tap (ognuno sotto la soglia swipe di 24px) a distanza `Date.now()` ≤ 300ms emettono `doppio-tap`, solo se dichiarato dal gioco. Tetris lo dichiara e lo mappa su `ruota()`; `swipe-su` esce dai suoi comandi. La logica pura (`src/games/tetris/logica.ts`) non cambia.

**Tech Stack:** TypeScript strict, Vitest (jsdom), Vite. Nessun nuovo dipendente.

**Spec:** `docs/superpowers/specs/2026-11-12-doppio-tap-rotazione-design.md`

## Global Constraints

- Finestra doppio tap: `SOGLIA_DOPPIO_TAP = 300` ms, confine incluso (`ora - ultimoTap <= 300`).
- Tap = gesto con `Math.max(|dx|, |dy|) < SOGLIA_SWIPE` (24px CSS). Nessuna distanza massima tra i due tap.
- `ultimoTap` è `number | undefined` (`undefined` = nessun tap pendente). Uno swipe lo azzera (swipe+tap ≠ doppio tap); `smonta()` lo azzera.
- Il tap singolo resta muto anche con `doppio-tap` dichiarato (niente ritardo: nessun comportamento da rinviare).
- `doppio-tap` è touch-only: nessuna voce in `MAPPA_TASTI`, nessun pulsante pad, niente CSS.
- Nessun cambio di comportamento per i giochi che non dichiarano `doppio-tap` (2048, snake, pacman, smoke).
- `ETICHETTE` è `Record<Comando, string>` (esauriente): estendere l'unione obbliga la nuova voce.
- Condizione di aggancio listener pointer sul canvas: `doppio-tap` dichiarato deve agganciare `onPointerDown`/`rilascia` anche senza `punta`/swipe.
- Stile: seguire quello già presente di ogni file (`input.ts` usa i punto e virgola, `tetris.ts` e i test di tetris no); type import con `import type`.
- Verifica: `npx vitest run <file>` per task; a fine Task 2 `npm test` (suite completa) e `npm run build`.

## Review Focus

1. **Secondo dito**: un tap del dito 2 mentre il dito 1 ha un gesto attivo non emette nulla e non avvia la sequenza (la guardia `e.pointerId !== pointerAttivo.id` in `rilascia` deve valere anche per il ramo tap). → test in Task 1.
2. **`pointercancel`**: un gesto cancellato sotto soglia conta come tap per la sequenza (pointercancel + tap entro 300ms → `doppio-tap`). → test in Task 1.
3. **Modalità joystick**: con `joystick: true` il `doppio-tap` non viene mai emesso (mutua esclusione col stick, coerente con swipe/punta). → test in Task 1.
4. **Tetris: doppio tap durante la pausa** non ruota (osservabile: l'hard drop successivo riporta la forma non ruotata: 38 punti, non 32). → test in Task 2.
5. **Tetris: doppio tap non invia punteggio** (`invia.punteggio` non viene chiamato sulla rotazione pura). → asserzione nel test principale `doppio-tap` del Task 2.

---

### Task 1: Core — comando `doppio-tap`

**Files:**
- Modify: `src/core/types.ts:3-4` (unione `Comando`)
- Modify: `src/core/input.ts` (commento header, `ETICHETTE`, `legendaTasti`, stato `ultimoTap`, `rilascia`, condizione listener, `smonta`)
- Test: `tests/core/input.test.ts`

**Interfaces:**
- Consumes: niente (primo task).
- Produces:
  - `Comando` (types.ts) include `'doppio-tap'`.
  - `CollegaInput({ canvas, comandi, pad, joystick, onComando })`: due tap (ciascuno < 24px) con distanza `Date.now()` ≤ 300ms → `onComando('doppio-tap')` esattamente una volta, sul secondo tap, solo se `'doppio-tap'` ∈ `comandi`.
  - `legendaTasti(comandi)`: riga `{ tasti: 'Doppio tocco', etichetta: 'Doppio tap' }` nella posizione del comando.

- [ ] **Step 1: scrivere i test che falliscono in `tests/core/input.test.ts`**

Nuovo blocco `describe('doppio-tap')` all'interno del `describe('input')`, subito dopo il test
`'tap sotto la soglia: non emette ruota se non dichiarato'` (intorno a linea 290).
I helper `collega`, `pointerdown`, `pointerup`, `pointercancel`, `onComando` sono già in scope.

```ts
describe('doppio-tap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // tap = pointerdown + pointerup con max |d| < 24
  const tap = (t: number, x = 100, y = 100): void => {
    vi.setSystemTime(t);
    pointerdown(canvas, x, y);
    pointerup(canvas, x + 2, y + 1);
  };

  it('due tap entro 300ms (dichiarato) → doppio-tap emesso una volta, sul secondo tap', () => {
    collega(['doppio-tap']);
    tap(0);
    expect(onComando).not.toHaveBeenCalled();
    tap(200);
    expect(onComando).toHaveBeenCalledTimes(1);
    expect(onComando).toHaveBeenCalledWith('doppio-tap');
  });

  it('a 300ms esatti → emesso (soglia inclusa)', () => {
    collega(['doppio-tap']);
    tap(0);
    tap(300);
    expect(onComando).toHaveBeenCalledTimes(1);
    expect(onComando).toHaveBeenCalledWith('doppio-tap');
  });

  it('a distanza > 300ms → nessun doppio-tap', () => {
    collega(['doppio-tap']);
    tap(0);
    tap(400);
    expect(onComando).not.toHaveBeenCalled();
  });

  it('tre tap rapidi → esattamente un doppio-tap', () => {
    collega(['doppio-tap']);
    tap(0);
    tap(200); // emesso: sequenza consumata
    tap(300); // tap pendente nuovo: niente emissione
    expect(onComando).toHaveBeenCalledTimes(1);
  });

  it('non dichiarato → nessun doppio-tap (il tap resta muto)', () => {
    collega(['punta', 'ruota']); // 'punta' aggancia i listener
    tap(0);
    tap(200);
    expect(onComando).not.toHaveBeenCalledWith('doppio-tap');
    expect(onComando).not.toHaveBeenCalledWith('ruota');
  });

  it('uno swipe tra i due tap rompe la sequenza (swipe+tap ≠ doppio tap)', () => {
    collega(['doppio-tap', 'swipe-dx']);
    tap(0);
    vi.setSystemTime(150);
    pointerdown(canvas, 100, 100);
    pointerup(canvas, 200, 100); // dx=100 → swipe-dx
    expect(onComando).toHaveBeenLastCalledWith('swipe-dx');
    tap(250); // 100ms dopo, ma la sequenza è rotta
    expect(onComando).toHaveBeenCalledTimes(1);
  });

  it('secondo dito: tap del dito 2 con gesto del dito 1 attivo non avvia la sequenza (Review Focus)', () => {
    collega(['doppio-tap']);
    vi.setSystemTime(0);
    pointerdown(canvas, 100, 100, 1); // dito 1: gesto attivo
    vi.setSystemTime(100);
    pointerdown(canvas, 300, 300, 2); // dito 2: ignorato (pointerAttivo ≠ undefined)
    pointerup(canvas, 301, 301, 2);   // ≠ pointer attivo → muto, non conta come tap
    vi.setSystemTime(200);
    pointerup(canvas, 101, 101, 1);   // dito 1: primo tap vero
    expect(onComando).not.toHaveBeenCalled();
    vi.setSystemTime(250);
    pointerdown(canvas, 102, 102, 2); // dito 2: ora è il pointer attivo
    pointerup(canvas, 103, 103, 2);   // tap a 50ms → doppio-tap legittimo
    expect(onComando).toHaveBeenCalledTimes(1);
    expect(onComando).toHaveBeenCalledWith('doppio-tap');
  });

  it('pointercancel sotto soglia conta come tap per la sequenza (Review Focus)', () => {
    collega(['doppio-tap']);
    vi.setSystemTime(0);
    pointerdown(canvas, 100, 100);
    pointercancel(canvas, 102, 101); // tap via cancel
    vi.setSystemTime(200);
    pointerdown(canvas, 100, 100);
    pointerup(canvas, 101, 101);     // tap → doppio-tap
    expect(onComando).toHaveBeenCalledTimes(1);
    expect(onComando).toHaveBeenCalledWith('doppio-tap');
  });

  it('joystick attivo: doppio-tap mai emesso (mutua esclusione) (Review Focus)', () => {
    collega(['doppio-tap'], undefined, true);
    tap(0);
    tap(200);
    expect(onComando).not.toHaveBeenCalled();
  });
});
```

Aggiornamenti di test esistenti nello stesso file:

1. `'legendaTasti: contratto completo di Tetris (tastiera + drag + swipe)'` (linea ~217):
   titolo → `'(tastiera + drag + swipe + doppio tap)'`; array di input →
   `['su', 'sx', 'dx', 'giu', 'ruota', 'conferma', 'punta', 'swipe-sx', 'swipe-dx', 'swipe-giu', 'doppio-tap']`;
   output atteso: togliere la riga `{ tasti: 'Trascina', etichetta: 'Swipe su' }` e aggiungere
   `{ tasti: 'Doppio tocco', etichetta: 'Doppio tap' }` dopo la riga `Swipe giù`.
2. `'tap sotto la soglia: muto anche se ruota è dichiarato (la rotazione passa allo swipe su)'` (linea ~276):
   titolo → `'tap sotto la soglia: muto anche se doppio-tap è dichiarato (il tap singolo resta muto)'`;
   `collega(['punta', 'ruota', 'doppio-tap'])`; mantenere `mockaRect` e i pointer; asserzioni:
   `expect(onComando).not.toHaveBeenCalledWith('ruota');`
   `expect(onComando).not.toHaveBeenCalledWith('doppio-tap');`

- [ ] **Step 2: eseguire i test e verificare che falliscano**

Run: `npx vitest run tests/core/input.test.ts`
Expected: FAIL — i test `doppio-tap` non vedono mai `onComando('doppio-tap')`; il test legenda
fallisce per la riga mancante; `'doppio-tap'` non esiste nell'unione `Comando`
(`npx tsc --noEmit` segnala anche l'errore di tipo sulla voce mancante in `ETICHETTE` dopo
l'estensione dell'unione).

- [ ] **Step 3: implementare**

`src/core/types.ts` — unione `Comando`:

```ts
export type Comando = 'su' | 'giu' | 'sx' | 'dx' | 'conferma' | 'ruota' | 'punta'
  | 'swipe-su' | 'swipe-giu' | 'swipe-sx' | 'swipe-dx' | 'doppio-tap';
```

`src/core/input.ts`:

1. Costante accanto a `SOGLIA_SWIPE`:
   `const SOGLIA_DOPPIO_TAP = 300; // ms: finestra del doppio tap (soglia inclusa)`
2. Stato accanto a `pointerAttivo`: `let ultimoTap: number | undefined;`
3. `rilascia()`: sostituire il ramo tap (`if (Math.max(...) < SOGLIA_SWIPE) { ... return; }`) con:

```ts
if (Math.max(Math.abs(dx), Math.abs(dy)) < SOGLIA_SWIPE) {
  // Tap sotto la soglia: muto, salvo doppio-tap dichiarato (due tap entro
  // SOGLIA_DOPPIO_TAP). Il tap singolo non genera comandi (evita azioni
  // casuali quando si vuole solo spostare il pezzo di poco).
  if (dichiarati.has('doppio-tap')) {
    const ora = Date.now();
    if (ultimoTap !== undefined && ora - ultimoTap <= SOGLIA_DOPPIO_TAP) {
      onComando('doppio-tap');
      ultimoTap = undefined; // tre tap rapidi = un doppio tap + tap pendente nuovo
    } else {
      ultimoTap = ora;
    }
  }
  return;
}
ultimoTap = undefined; // uno swipe rompe la sequenza del doppio tap
```

   (il resto di `rilascia` — calcolo direzione swipe ed emissione — resta invariato)
4. `ETICHETTE`: `'doppio-tap': 'Doppio tap',`
5. `legendaTasti()`: dopo il caso `punta` e prima della check `SWIPE`:

```ts
if (c === 'doppio-tap') {
  righe.push({ tasti: 'Doppio tocco', etichetta: ETICHETTE[c] });
  continue;
}
```

6. Condizione aggancio listener (blocco finale prima della sezione joystick):

```ts
if (!joystick && (dichiarati.has('punta') || dichiarati.has('doppio-tap') || SWIPE.some((c) => dichiarati.has(c)))) {
```

7. `smonta()`: `ultimoTap = undefined;` (accanto a `pointerAttivo = undefined`)
8. Commenti: la riga di header `// - swipe-*: ... sotto soglia = tap → muto (la rotazione di Tetris è uno swipe su).`
   diventa `// - swipe-*: ... sotto soglia = tap: muto, salvo 'doppio-tap' (due tap entro 300ms, se dichiarato).`

- [ ] **Step 4: eseguire i test e verificare che passino**

Run: `npx vitest run tests/core/input.test.ts`
Expected: PASS (tutti i test del file, vecchi e nuovi).
Run: `npx tsc --noEmit`
Expected: nessun errore (record `ETICHETTE` esaustivo soddisfatto).

- [ ] **Step 5: commit**

```bash
git add src/core/types.ts src/core/input.ts tests/core/input.test.ts
git commit -m "feat(input): comando doppio-tap (due tap ≤ 300ms, touch-only)"
```

---

### Task 2: Tetris — rotazione via doppio tap (sostituisce il flick su)

**Files:**
- Modify: `src/games/tetris/tetris.ts` (commento header, `esitoRilascio`, `applicaComando`, `comandi`)
- Test: `tests/games/tetris/tetris.test.ts`

**Interfaces:**
- Consumes: `'doppio-tap'` dal Task 1 (il core lo emette; qui il gioco lo dichiara e lo gestisce).
- Produces:
  - `tetris.comandi === ['su', 'sx', 'dx', 'giu', 'ruota', 'conferma', 'punta', 'swipe-sx', 'swipe-dx', 'swipe-giu', 'doppio-tap']`.
  - `comanda('doppio-tap')` → `ruota(stato)` (beep 330 se la forma cambia), senza gating di velocità né di `pezzoMosso`; pulizia `seg`/`gestoAttivo` come nel caso `ruota`.
  - `'swipe-su'` non gestito più in `applicaComando`.

- [ ] **Step 1: aggiornare i test in `tests/games/tetris/tetris.test.ts`**

1. Test di contratto (linea ~50): `expect(tetris.comandi).toEqual(['su', 'sx', 'dx', 'giu', 'ruota', 'conferma', 'punta', 'swipe-sx', 'swipe-dx', 'swipe-giu', 'doppio-tap'])`
   (e titolo: `'(pad touch: niente pulsanti, drag+swipe+doppio tap)'`).
2. Sostituire il test `'drag diagonale (pezzo mosso) + swipe-su → NIENTE rotazione (soppressa)'`
   (linee ~83-90) con:

```ts
it('doppio-tap dopo un drag orizzontale: ruota lo stesso (nessuna soppressione)', () => {
  const { comanda } = ctxFinto()
  vi.setSystemTime(0)
  comanda(['punta', 0, 0])    // avvia + ancora
  comanda(['punta', 30, 0])   // 30px > 24 → 1 cella mossa (pezzoMosso)
  comanda('doppio-tap')       // ruota comunque: no gating di velocità
  expect(beep).toHaveBeenCalledWith(330, 0.04)
})
```

3. Sostituire il test `'swipe su veloce e lungo → ruota (beep 330)'` (linee ~123-130) con:

```ts
it('doppio-tap → ruota (beep 330) e non invia punteggio (Review Focus)', () => {
  const { ctx, comanda } = ctxFinto()
  comanda('doppio-tap') // avvia (primo comando) + ruota: I diventa verticale 4×1
  expect(beep).toHaveBeenCalledWith(330, 0.04)
  expect(ctx.invia.punteggio).not.toHaveBeenCalled()
})

it('swipe-su non ruota più (rimosso dai comandi)', () => {
  const { comanda } = ctxFinto()
  vi.setSystemTime(0)
  comanda(['punta', 0, 100])
  comanda(['punta', 5, 20])  // su 80px, veloce
  comanda('swipe-su')        // non dichiarato più: no-op
  expect(beep).not.toHaveBeenCalledWith(330, 0.04)
})

it('doppio-tap durante la pausa: non ruota (Review Focus)', () => {
  const { ctx, comanda } = ctxFinto()
  comanda('sx')          // avvia (I orizzontale)
  ctx.handle.pausa()
  comanda('doppio-tap')  // ignorato: la forma resta orizzontale
  ctx.handle.riprendi()
  comanda('conferma')    // hard drop I orizzontale = 38 (se fosse ruotata: 32)
  expect(ctx.invia.punteggio).toHaveBeenLastCalledWith(38)
})
```

- [ ] **Step 2: eseguire i test e verificare che falliscano**

Run: `npx vitest run tests/games/tetris/tetris.test.ts`
Expected: FAIL — contratto (comandi vecchi), `'doppio-tap'` non gestito (niente beep 330),
`swipe-su` ruota ancora, doppio-tap in pausa ruota ancora (punteggio 32 invece di 38).

- [ ] **Step 3: implementare in `src/games/tetris/tetris.ts`**

1. `comandi` dell'export `tetris`:

```ts
comandi: ['su', 'sx', 'dx', 'giu', 'ruota', 'conferma', 'punta', 'swipe-sx', 'swipe-dx', 'swipe-giu', 'doppio-tap'],
```

2. `applicaComando()`: rimuovere `case 'swipe-su'` e il suo blocco; aggiungere un case con lo
   stesso corpo del blocco `case 'su'`/`case 'ruota'`:

```ts
case 'doppio-tap': { // doppio tap sul canvas → ruota (no gating: il gesto è già qualificato)
  const formaPrima = stato.tessera?.forma
  stato = ruota(stato)
  if (stato.tessera?.forma !== formaPrima) beep(330, 0.04)
  seg = { ancora: undefined, dir: undefined }
  gestoAttivo = false
  break
}
```

3. `esitoRilascio()`: la condizione di soppressione
   `if (pezzoMosso && (asse === 'su' || asse === 'giu'))` → `if (pezzoMosso && asse === 'giu')`
   (l'asse `'su'` non è più raggiungibile: `swipe-su` non è più dichiarato); aggiornare il
   commento: il rilascio verticale soppresso è solo l'hard drop.
4. Commenti: la riga `// Controllo touch: drag "segue il dito" (punta) + flick al rilascio (swipe).`
   diventa `// Controllo touch: drag "segue il dito" (punta) + flick al rilascio (swipe) + doppio tap per ruotare.`;
   rimuovere i commenti residui che citano il flick su come rotazione.

- [ ] **Step 4: eseguire i test e verificare che passino**

Run: `npx vitest run tests/games/tetris/tetris.test.ts`
Expected: PASS.
Run: `npm test` (suite completa: core, tetris, 2048, snake, pacman, smoke)
Expected: PASS — in particolare invariati i test 2048 (che usa ancora `swipe-su` come movimento).
Run: `npm run build`
Expected: build completata senza errori.

- [ ] **Step 5: commit**

```bash
git add src/games/tetris/tetris.ts tests/games/tetris/tetris.test.ts
git commit -m "feat(tetris): rotazione touch via doppio tap al posto del flick su"
```
