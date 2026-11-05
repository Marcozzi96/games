# Games — Shell PWA: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire la shell PWA "Games" (menù + schermo di gioco + core), installabile e offline, con 0 giochi: i giochi entreranno dopo, uno alla volta, senza toccare la shell.

**Architecture:** Vite + TypeScript puro, senza framework. Ogni gioco futuro è un modulo in `src/games/<id>/<id>.ts` che esporta un oggetto `Gioco` registrato in `core/registry.ts`; `app/screen.ts` crea canvas + HUD e passa al gioco un `CtxGioco`; `core/input.ts` normalizza touch/tastiera in comandi astratti.

**Tech Stack:** Vite 7, TypeScript 5 (strict), Vitest + jsdom (solo core), vite-plugin-pwa (Workbox), zero dipendenze runtime.

**Spec:** `docs/superpowers/specs/2026-07-09-games-pwa-design.md`

## Global Constraints

- Mobile-first; tastiera pienamente funzionante (frecce/WASD, spazio, R, P/Escape).
- UI in italiano (nomi giochi, pulsanti, schermate).
- Tema scuro unico, niente toggle light/dark.
- Nessun asset audio: beep via WebAudio. Nessun PNG/asset pesante: icone SVG + PNG generati da script.
- Persistenza solo `localStorage`, chiavi `games:score:<id>` e `games:mute`.
- Nessun gioco richiede modifiche a file fuori dalla propria cartella (anti-goal del design).
- Stato iniziale: 0 giochi registrati → il menù mostra lo stato vuoto.
- Commit frequenti, uno per task (o per sotto-fase dove indicato).

## Review Focus

- **Frecce/spazio da tastiera con la pagina scrollabile**: `preventDefault()` sui tasti gestiti, altrimenti la pagina scrolla durante il gioco. → test in Task 4.
- **`localStorage` indisponibile** (i-frame private browsing, storage full): `storage.ts` degrada senza lanciare (record = 0, mute = false). → test in Task 2.
- **AudioContext prima del primo gesture**: la spec richiede di non lanciare; `inizia()` è no-op fino al primo input, `beep` no-op se il context non esiste. → test in Task 3.
- **Tasti duplicati / focus doppio** dopo rimontaggio dello schermo (R per riavviare, tornare al menù, riaprire): `CollegaInput().smonta()` deve staccare listener e pulsanti. → test in Task 4.
- **DPR/resize**: il canvas si ridimensiona al resize e a cambio di `devicePixelRatio` senza che il gioco si rompa (le coordinate `punta` restano in unità CSS). → verifica manuale in Task 8 (Review Focus, no test unitario).

---

## File Structure

```
games/
  index.html                  # root #app + font system-ui
  package.json                # scripts: dev, build, preview, test
  vite.config.ts              # plugin react? NO — solo Vite + VitePWA + resolve alias
  tsconfig.json               # strict, bundler moduleResolution
  .gitignore
  scripts/
    genera-icona.mjs          # genera PNG PWA (192, 512, maskable) da pixel, zero dipendenze
  public/
    icons/icon.svg            # favicon (source di design)
  src/
    main.ts                   # boot: routing menù ⇄ gioco, state
    pwa.ts                    # registerSW + registerType autoUpdate
    styles.css                # tema scuro, griglia menù, HUD, overlay, pulsanti touch
    core/
      types.ts                # Gioco, Comando, CtxGioco, HandleGioco
      registry.ts             # registra(g), giochi()
      storage.ts              # record + mute
      audio.ts                # WebAudio beep + mute persistente
      input.ts                # CollegaInput: tastiera + pulsanti touch → comandi
    app/
      menu.ts                 # mostraMenu()
      screen.ts               # apriSchermo() + chiudiSchermo()
    games/.gitkeep
  tests/
    core/storage.test.ts
    core/audio.test.ts
    core/input.test.ts
    core/registry.test.ts
```

Interfacce condivise (fonte di verità: `core/types.ts`, Task 2):

```ts
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
    punteggio(v: number): void;      // aggiorna HUD
    fine(v: number): void;           // game over → overlay
  };
  comanda: (fn: (c: Comando | [Comando, number, number]) => void) => void; // registra listener; il core smonta al teardown
};

export type Gioco = {
  id: string;
  nome: string;
  icona: string;                     // path SVG pubblico
  comandi: Comando[];
  orientazione?: 'verticale' | 'orizzontale';  // default 'verticale'
  crea: (ctx: CtxGioco) => HandleGioco;
};
```

Nota per l'implementatore: il payload `punta` arriva come tuple `['punta', x, y]` in coordinate CSS relative al canvas.

---

### Task 1: Scaffold Vite + TS + Vitest

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`, `src/main.ts`, `src/styles.css`
- Test: nessuno (configurazione)

**Interfaces:**
- Produces: script npm `dev|build|preview|test`; `index.html` con `<div id="app"></div>`; alias `@` → `src/`.

- [ ] **Step 1: Inizializzare il progetto**

```bash
cd games
git init
```

Scaffolding manuale (la cartella non è vuota: contiene `docs/`): `package.json` con `"type": "module"` e script `dev`, `build`, `preview` (`vite preview`), `test` (`vitest run`); dipendenze: dev `vite`, `typescript`, `vitest`, `jsdom`, `vite-plugin-pwa` (versioni più recenti stable).

- [ ] **Step 2: Configurare**

`tsconfig.json`: `"strict": true`, `"moduleResolution": "bundler"`, `"noEmit": true`.
`vite.config.ts`: `resolve.alias { '@': '/src' }`, e la config Vitest (`test: { environment: 'jsdom' }`) dentro lo stesso file, con `/// <reference types="vitest/config" />` in cima e `defineConfig` di `vitest/config`.
`index.html`: `<div id="app"></div>`, `<link rel="icon" href="/icons/icon.svg">`, lang="it".
`.gitignore`: `node_modules`, `dist`, `dev-dist`.

- [ ] **Step 3: Verificare**

Run: `npm install && npm run build && npm test`
Expected: build ok (dist/ generata); `npm test` → "No test files found" con exit code 0 (o 1 se la configurazione di vitest lo impone: in quel caso aggiungere un test placeholder in `tests/` e rimoverlo nel Task 2).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TS + Vitest"
```

---

### Task 2: `core/types.ts` + `core/storage.ts` (TDD)

**Files:**
- Create: `src/core/types.ts`, `src/core/storage.ts`
- Test: `tests/core/storage.test.ts`

**Interfaces:**
- Produces (esatti, usati da tutti i task successivi):

```ts
// storage.ts
caricaRecord(id: string): number
salvaRecord(id: string, punteggio: number): boolean   // true se nuovo record
caricaMute(): boolean
salvaMute(v: boolean): void
```

- [ ] **Step 1: Scrivere i test fallenti** in `tests/core/storage.test.ts`

Casi:
1. `caricaRecord('snake')` con storage vuoto → `0`
2. `salvaRecord('snake', 10)` → `true`; `caricaRecord('snake')` → `10`
3. `salvaRecord('snake', 5)` dopo il 10 → `false`, record resta 10
4. `salvaRecord` con `punteggio` non finito (NaN) → `false`, non scrive
5. Storage che lancia su `getItem` (simulare con `vi.spyOn(Storage.prototype,'getItem').mockImplementation(() => { throw new Error('denied') })`) → `caricaRecord` → `0`, nessun throw
6. `caricaMute()` vuoto → `false`; `salvaMute(true)` → `caricaMute()` → `true`; storage con valore corrotto (`"xyz"`) → `false`

Setup/teardown: `localStorage.clear()` in ogni test.

- [ ] **Step 2: Verificare che falliscano**

Run: `npx vitest run tests/core/storage.test.ts`
Expected: FAIL (moduli non esistenti)

- [ ] **Step 3: Implementare** `src/core/types.ts` (copiare i tipi del blocco Interfaces in cima al piano) e `src/core/storage.ts`

Approccio: ogni funzione wrappa il `localStorage` in try/catch (degrado silenzioso: 0 / false). Chiavi: `games:score:<id>`, `games:mute` (valori `"1"`/`"0"`). `salvaRecord` scrive solo se `punteggio > caricato` e `Number.isFinite`.

- [ ] **Step 4: Verificare che passino**

Run: `npx vitest run tests/core/storage.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add src/core tests/core
git commit -m "feat: tipi di gioco + storage record/mute"
```

---

### Task 3: `core/audio.ts` (TDD)

**Files:**
- Create: `src/core/audio.ts`
- Test: `tests/core/audio.test.ts`

**Interfaces:**
- Consumes: `salvaMute`, `caricaMute` da Task 2
- Produces:

```ts
inizia(): void        // da chiamare al primo user gesture; crea AudioContext se mancante
beep(freq: number, durata: number, tipo?: OscillatorType): void
mute(): boolean
setMute(v: boolean): void   // aggiorna storage
```

- [ ] **Step 1: Scrivere i test fallenti**

Casi:
1. `mute()` iniziale (storage vuoto) → `false`
2. `setMute(true)` → `mute()` → `true` e `caricaMute()` → `true`
3. `beep(440, 0.1)` senza `inizia()` mai chiamata (jsdom: nessun `AudioContext`) → non lancia
4. Dopo `inizia()` (mock globale `AudioContext` con `createOscillator`/`createGain`/`destination`/`resume`) → `beep` chiama `osc.connect`, `osc.start`, `osc.stop` (assert su mock)
5. Con `setMute(true)` → `beep` non chiama `createOscillator`

- [ ] **Step 2: Verificare che falliscano** — `npx vitest run tests/core/audio.test.ts` → FAIL

- [ ] **Step 3: Implementare** `src/core/audio.ts`

Approccio: lazy `AudioContext` (solo dentro `inizia()`), gain envelope breve (attack/decay ~5 ms) per evitare click, volume 0.15. Tutto guardato da `mute()` e da `ctx === null`.

- [ ] **Step 4: Verificare che passino** — Expected: PASS (5 test)

- [ ] **Step 5: Commit** — `git commit -m "feat: audio beep WebAudio con mute persistente"`

---

### Task 4: `core/input.ts` (TDD)

**Files:**
- Create: `src/core/input.ts`
- Test: `tests/core/input.test.ts`

**Interfaces:**
- Consumes: `Comando` da Task 2; `audio.inizia()` da Task 3
- Produces:

```ts
CollegaInput(cav: {
  canvas: HTMLCanvasElement;
  comandi: Comando[];            // solo questi generano pulsanti/gesti
  onComando: (c: Comando | [Comando, number, number]) => void;
}): { smonta(): void }
```

- [ ] **Step 1: Scrivere i test fallenti**

Setup: `canvas = document.createElement('canvas')`, `document.body.appendChild`, spy su `onComando`.

Casi:
1. `keydown ArrowUp` → `onComando('su')`; `KeyD` → `'dx'`; `KeyW` → `'su'`; `Space` → `'conferma'`
2. `keydown ArrowUp` chiama `preventDefault()` (e `Space` pure) — Review Focus
3. `keydown KeyR` e `KeyP`/`Escape` → **non** chiamano `onComando` (sono riservati al core, gestiti dal task 8)
4. `comandi: ['su','giu','sx','dx']` → nel DOM sotto al canvas appaiono 4 pulsanti; `comandi: ['punta']` → nessun pulsante, un listener `pointerdown` sul canvas
5. Tap (PointerEvent `pointerdown`) sul pulsante `dx` → `onComando('dx')`
6. `pointerdown` + `pointermove` sul canvas con `comandi: ['punta']` → `onComando(['punta', x, y])` in coordinate CSS relative al canvas (usare `getBoundingClientRect` mockato)
7. `smonta()` → successivo `keydown ArrowUp` non produce `onComando`; i pulsanti sono rimossi dal DOM (Review Focus)
8. `comanda` con gioco che non dichiara `conferma`: `Space` non produce `onComando('conferma')` (il comando non dichiarato non viene emesso)

- [ ] **Step 2: Verificare che falliscano** — FAIL (modulo non esiste)

- [ ] **Step 3: Implementare** `src/core/input.ts`

Approccio: listener `keydown` su `window` (mappatura tastiera → comando, solo se dichiarato in `comandi`, eccetto `punta` che è solo touch); pulsanti touch in un contenitore `<div class="pad">` aggiunto **dopo** il canvas nel DOM (il task 8 gli applica il layout): D-pad a croce per le 4 direzioni (una griglia CSS 3×3), tasto rotondo per `conferma`/`ruota`; per `punta`: `pointerdown`/`pointermove` sul canvas con `setPointerCapture`. Chiamare `audio.inizia()` sul primo `pointerdown`/`keydown` (gesto utente per sbloccare l'audio).

- [ ] **Step 4: Verificare che passino** — Expected: PASS (8 test)

- [ ] **Step 5: Commit** — `git commit -m "feat: input unificato tastiera + touch"`

---

### Task 5: `core/registry.ts` (TDD)

**Files:**
- Create: `src/core/registry.ts`
- Test: `tests/core/registry.test.ts`

**Interfaces:**
- Consumes: `Gioco` da Task 2
- Produces:

```ts
registra(g: Gioco): void     // id duplicato → throw Error
giochi(): Gioco[]            // ordinati per nome (localeCompare it)
```

- [ ] **Step 1: Scrivere i test fallenti**

Casi:
1. `giochi()` iniziale → `[]`
2. `registra` + `giochi()` → contiene il gioco
3. `registra` con id duplicato → throw
4. Due giochi → ordinati per `nome`

Nota: il registry è modulo con stato; nel test usare un helper `resetRegistry()` exportato **solo per test** (o `vi.resetModules` + reimport). Scegliere `vi.resetModules` per non sporcare l'API pubblica.

- [ ] **Step 2: Verificare che falliscano** — FAIL

- [ ] **Step 3: Implementare** `src/core/registry.ts` (array interno + Set di id)

- [ ] **Step 4: Verificare che passino** — PASS (4 test)

- [ ] **Step 5: Commit** — `git commit -m "feat: registro giochi"`

---

### Task 6: PWA (manifest, service worker, icone)

**Files:**
- Create: `public/icons/icon.svg`, `scripts/genera-icona.mjs`, `src/pwa.ts`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: scaffold Task 1
- Produces: build con `manifest.webmanifest` + SW precache; icone `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` in `public/icons/`

- [ ] **Step 1: Icona SVG**

`public/icons/icon.svg`: sfondo scuro arrotondato (#111827, rx ~22%), al centro una croce da D-pad in colore accento (#4ade80). Max ~15 righe.

- [ ] **Step 2: Script generazione PNG**

`scripts/genera-icona.mjs`: zero dipendenze — matrice RGBA 512×512 disegnata per pixel (stesso disegno dell'SVG: sfondo + croce, con padding 20% per la variante maskable), encoding PNG manuale: header + IHDR + IDAT (`zlib.deflateSync` di scanline con filter byte 0) + IEND, checksum CRC32 implementato in ~10 righe. Scrive i 3 PNG in `public/icons/`.

Run: `node scripts/genera-icona.mjs`
Expected: 3 file PNG creati, dimensioni corrette (verificare con `node -e` che legge la larghezza/altezza dai byte 16-24).

- [ ] **Step 3: Config PWA**

`vite.config.ts`: `VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Games', short_name: 'Games', theme_color: '#111827', background_color: '#111827', display: 'standalone', icons: [192, 512, maskable 512] }, workbox: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'] } })`.
`src/pwa.ts`: `import { registerSW } from 'virtual:pwa-register'; registerSW({ immediate: true });` — importato da `main.ts`.
`index.html`: `<meta name="theme-color" content="#111827">`, link manifest (iniettato dal plugin, non serve a mano).

- [ ] **Step 4: Verificare**

Run: `npm run build`
Expected: `dist/manifest.webmanifest` presente e valido JSON con le 3 icone; `dist/sw.js` presente; i PNG in `dist/icons/`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: PWA manifest + service worker + icone"
```

---

### Task 7: `app/menu.ts` + tema

**Files:**
- Create: `src/app/menu.ts`
- Modify: `src/styles.css`, `src/main.ts`

**Interfaces:**
- Consumes: `giochi()` (Task 5), `caricaRecord`, `caricaMute`, `salvaMute`, `mute`, `setMute` (Task 2-3)
- Produces:

```ts
mostraMenu(contenitore: HTMLElement, onApri: (g: Gioco) => void): void
```

- [ ] **Step 1: Implementare `src/app/menu.ts`**

- Header: titolo "Games" + pulsante mute (icona speaker, stato da `caricaMute()`; click → `setMute` + aggiorna icona)
- Griglia `repeat(auto-fill, minmax(140px, 1fr))`: per ogni gioco una card con `icona` (img SVG), `nome`, record (`caricaRecord(id)` → "Record: N", nascosto se 0)
- Click card → `onApri(g)`
- Stato vuoto (0 giochi): messaggio "Nessun gioco ancora. I giochi arriveranno presto."
- Card e card:focus visibili da tastiera (accessibilità di base: `button` reali, non div cliccabili)

- [ ] **Step 2: Tema in `src/styles.css`**

Dark: `#0b1020` sfondo, `#111827` superfici, testo `#e5e7eb`, accento `#4ade80`; font `system-ui`; `touch-action: manipulation`; dimensioni tap target ≥ 44px.

- [ ] **Step 3: Collegare in `src/main.ts`** (parziale, il routing completo è Task 8)

```ts
import { mostraMenu } from '@/app/menu';
document.querySelector('#app')!.appendChild(...); // mostraMenu su #app, onApri = () => alert('gioco in arrivo')
```

- [ ] **Step 4: Verifica manuale**

Run: `npm run dev` → aprire il menù: griglia vuota con messaggio, pulsante mute funziona e persiste dopo il refresh, titolo e tema corretti.
Expected: niente errori in console.

- [ ] **Step 5: Commit** — `git commit -m "feat: menù giochi con tema scuro"`

---

### Task 8: `app/screen.ts` + routing `main.ts` + flusso completo

**Files:**
- Create: `src/app/screen.ts`
- Modify: `src/main.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `Gioco`, `CollegaInput` (Task 4), `caricaRecord`/`salvaRecord` (Task 2), `beep` (Task 3)
- Produces:

```ts
apriSchermo(g: Gioco, host: HTMLElement, onEsci: () => void): void
```

- [ ] **Step 1: Implementare `apriSchermo`**

Flusso:
1. Pulire `host`, costruire layout: HUD in alto (`Punti: N` · `Record: M` · pulsanti ⏸ e ✕), canvas al centro (dimensionato su viewport secondo `g.orientazione`, DPR: `canvas.width = cssW * dpr`, `ctx.scale(dpr, dpr)`), pad comandi sotto (via `CollegaInput`)
2. `const h = g.crea({ canvas, invia, comanda })`; `invia.punteggio` aggiorna l'HUD; `invia.fine(v)`:
   - `nuovo = salvaRecord(g.id, v)`
   - overlay "Game over" con punteggio finale, record, badge "Nuovo record!" solo se `nuovo`, pulsanti **Rigioca** (h.reset() + riavvia) e **Menù** (teardown + `onEsci()`)
3. Pausa: overlay **Riprendi**/**Menù**; trigger: tasto P/Escape (listener locale), pulsante ⏸, e `visibilitychange` → auto-pausa se visibile→hidden (Review Focus del design)
4. R = riavvio (chiamare `h.reset()`, nascondere overlay)
5. Teardown completo (✕ / Menù / game over → Menù): `input.smonta()`, `h.smonta()`, rimuovere listener di P/R/Escape/visibility, svuotare `host`
6. Beep: click pulsanti (600 Hz, 40 ms), game over (sequenza 2 note discendenti), nuovo record (2 note ascendenti)

- [ ] **Step 2: Routing in `src/main.ts`**

`mostraMenu(app, (g) => apriSchermo(g, app, () => mostraMenu(app, ...)))` — una sola funzione `vaiAGioco`/`vaiAMenu` che si richiama (chiusura semplice, nessun history API).

- [ ] **Step 3: Gioco finto di smoke test** (solo per validare la shell, **non** registrato nel registry)

Creare `tests/smoke/finto.ts` con un `Gioco` minimale (`id:'finto'`, `comandi:['su','giu','sx','dx']`, canvas con quadrato che si muove coi comandi, `invia.fine(42)` dopo 10 secondi). Aggiungere un test jsdom che monta `apriSchermo`, spara `keydown ArrowUp`, e asserisce che il punteggio HUD cambia dopo `invia.punteggio` emesso dal gioco finto su un comando.
Nota: questo file è un fixture di test, non parte dell'app; va in `tests/`, non in `src/games/`.

- [ ] **Step 4: Verifica manuale**

Run: `npm run dev`:
- Menù vuoto → nessun crash, messaggio corretto
- (Temporaneamente registrare il gioco finto in `main.ts` per la prova, poi rimuovere) → apri, muovi col D-pad touch (devtools mobile) e con la tastiera, P pausa, R riavvia, game over → overlay con punteggio, Rigioca e Menù funzionano, torni al menù pulito (nessun listener orfano: dopo due aperture i tasti non duplicano)
- Resize finestra / cambio zoom → canvas si adatta (Review Focus DPR/resize)
Expected: nessun errore in console, nessun comportamento duplicato dopo ri-apertura.

- [ ] **Step 5: Verifica build + test**

Run: `npm test && npm run build`
Expected: tutti i test PASS, build ok.

- [ ] **Step 6: Commit** — `git commit -m "feat: schermo di gioco + routing + flusso pausa/game over"`

---

### Task 9: Verifica offline e finale

**Files:**
- Modify: nessuno (solo verifica)

**Interfaces:**
- Consumes: tutto quanto sopra

- [ ] **Step 1: Verifica offline**

Run: `npm run build && npm run preview`
Poi: DevTools → Network → "Offline", refresh → l'app si carica e il menù funziona (SW precache). Verificare che `manifest.webmanifest` sia servito e le icone carichino.
Expected: app piena offline dopo il primo load.

- [ ] **Step 2: Checklist finale (design)**

- [ ] PWA installabile (compare la voce "Installa" in Chrome) e funziona offline
- [ ] UI interamente in italiano
- [ ] Tema scuro, nessun toggle
- [ ] Mute persistente
- [ ] Record per gioco persiste
- [ ] Tastiera e touch entrambe funzionanti
- [ ] `npm test` verde, `npm run build` pulita

- [ ] **Step 3: Commit finale** (solo se ci sono fix) — `git commit -m "fix: correzioni da verifica finale"`

---

## Note per l'executore

- Un task = un commit (o i sotto-commit indicati). Non mescolare task.
- I test vivono in `tests/` e importano da `src/` con l'alias `@/`.
- Non aggiungere giochi reali: `src/games/` resta vuota (`.gitkeep`). Il gioco finto è solo fixture di test (Task 8).
- Se un comando npm non esiste più o una libreria cambia API nelle versioni recenti: adattare e annotare nella commit message, non cambiare l'architettura.
