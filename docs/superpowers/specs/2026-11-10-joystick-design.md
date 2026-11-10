# Joystick touch flottante — Design

**Data:** 2026-11-10
**Stato:** bozza da approvazione

## Intent e why

I giochi a direzioni (prima pac-man) si controllano al touch solo tramite 4 pulsanti fissi in basso. Un giocatore di pac-man preferisce un **thumbstick flottante** (pattern FPS mobile): lo stick compare esattamente dove il dito poggia, segue il dito e sparisce al rilascio. I pulsanti fissi competono con lo spazio di gioco e non sono adatti a un gioco veloce.

## Goals / non-goals / anti-goals

- **Goal:** touch control a joystick per pac-man; feature generica della shell riutilizzabile (es. snake).
- **Non-goal:** velocità proporzionale all'inclinazione (pac-man è a griglia: basta la direzione), joystick multi-dito, joystick per giochi a swipe/punta.
- **Anti-goal:** un joystick fisso in un angolo dell'interfaccia (esplicitamente scartato); spam di comandi durante il drag.

## Vincoli

- I giochi non toccano il DOM: tutta la gestione è della shell (`input.ts`, `screen.ts`, `styles.css`).
- Tearing down completo in `smonta()` (nessun listener orfano), coerente con pad e swipe.
- Il primo gesto (pointerdown) deve chiamare `audio.inizia()`.
- Canvas: pac-man oggi non dichiara `punta`/swipe → zona touch libera, nessun conflitto reale.

## Approaches considerati

1. **Pad a pulsanti fisso** (stato attuale): scartato — è ciò che si vuole sostituire.
2. **Joystick fisso** (zona dedicata in basso a sinistra): scartato esplicitamente dal committente.
3. **Thumbstick flottante** (scelto): compare dove poggia il dito. È il pattern consolidato dei giochi touch, funziona con un solo dito, e la shell ha già la mattoncella necessaria (pointer capture sul canvas, come per `punta`).

Scelta: **3**, con la regola che per pac-man **sostituisce** i pulsanti del pad (decisione del committente).

## Design

### API

- `types.ts`: nuovo campo `joystick?: boolean` su `Gioco` (default `false`) e su `CavalcaturaInput` in `input.ts`.
- Regole shell (chiamate del builder):
  - `joystick: true` ⇒ **niente pad a pulsanti** (il pad è implicitamente soppresso, indipendentemente da `pad`).
  - `joystick: true` ⇒ i gestori `punta`/swipe sul canvas **non vengono registrati** (il gesto è tutto del joystick; se un gioco dichiarasse entrambi, il joystick vince).
  - Il joystick emette comandi discreti `su/giu/sx/dx` (stringa semplice, non tuple), solo quelli dichiarati dal gioco.

### Geometria e comportamento (chiamate del builder)

- Elementi: `.joystick` (base) + `.joystick-knob`, inseriti dentro `.canvas-wrap` (serve `position: relative` in CSS), assoluti, `pointer-events: none` — gli eventi restano sul canvas.
- Dimensioni CSS: base ⌀ 96px, knob ⌀ 40px; il knob è clampato al bordo interno della base (spostamento max = raggio base − raggio knob).
- **Deadzone: 20px CSS** sul vettore dito (sotto ⇒ nessun comando, coerente in stile con `SOGLIA_SWIPE = 24`).
- Direzione = asse dominante (`|dx| > |dy|` ⇒ sx/dx, altrimenti su/giu).
- **Emissione solo al cambio di direzione**: `pointerdown` emette se oltre deadzone; `pointermove` emette solo se la direzione calcolata ≠ ultima emessa; `pointerup` azzera la memoria (ripetere la stessa direzione in un gesto successivo ri-emette).
- Multi-touch: solo il primo pointer gestito (stesso pattern `pointerAttivo` esistente).
- Primo `pointerdown` ⇒ `iniziaAudio()`.

### Layout (`screen.ts` / `styles.css`)

- Con `joystick: true` non esiste `.pad` → `dimensiona()` non riserva altezza (gestito già oggi: `pad?.offsetHeight ?? 0`) ⇒ canvas più grande.
- `.canvas-wrap { position: relative }`; base e knob centrati sul punto di contatto, spostati via `transform: translate(...)`.
- Stile: base cerchio con bordo `rgba(255,255,255,0.25)` e sfondo `rgba(255,255,255,0.06)`; knob riempito `rgba(255,255,255,0.35)`. Visibili solo durante il gesto (creati al `pointerdown`, rimossi al `pointerup`).

### Legenda

- `legendaTasti` riceve il flag joystick: se attivo, aggiunge la riga `{ tasti: 'Trascina', etichetta: 'Joystick' }` (le righe direzionali restano da tastiera). Chiamata del builder.

### Gioco

- `pacman.ts`: `comandi: ['su', 'giu', 'sx', 'dx']` + `joystick: true`. Nessun altro cambio: il primo comando joystick avvia il gioco esattamente come una freccia.

## Test (TDD, `tests/core/input.test.ts`)

1. `joystick: true` ⇒ nessun `.pad` nel DOM.
2. `pointerdown` + `pointermove` oltre deadzone ⇒ emette la direzione dominante, una sola volta.
3. Stesso drag, stesso asse, ulteriore move ⇒ nessun'ulteriore emissione.
4. Cambio asse durante il drag ⇒ emette la nuova direzione.
5. Move sotto deadzone ⇒ nessun comando.
6. `pointerup` ⇒ stick rimosso; nuovo gesto nella stessa direzione ri-emette.
7. Diagonale ⇒ asse dominante corretto.
8. Teardown (`smonta()`) ⇒ listener rimossi, elementi rimossi.

## Lasciato al builder

- Nomi/esatti dei valori CSS e la funzione di clamp (i numeri qui sono punti di partenza sensati).
- Dettagli di accessibilità degli elementi joystick (sono transitori: aria non richiesta).
