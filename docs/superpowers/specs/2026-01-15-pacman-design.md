# Pac-Man — Design

**Data:** 2026-01-15
**Branch:** `feat/pacman`

## Intent

Aggiungere Pac-Man classico alla shell di giochi. Stessa categoria di Snake/Tetris/2048 (classico arcade single-player, griglia), ma fedele al gameplay originale: labirinto 28×31, 4 fantasmi con AI distinta, power pellets, frutta bonus, progressione livelli.

## Goals

- Gameplay fedele al Pac-Man arcade (Namco 1980)
- Logica pura e testabile (pattern `logica.ts` esistente)
- Rendering su canvas con interpolazione sub-pixel (movimento fluido tra tile)
- Stessi comandi degli altri giochi: `su`, `giu`, `sx`, `dx`
- Audio: waka-waka (mangiare pellet), ghost death, power pellet, death
- PWA-ready: funziona offline, touch-friendly

## Non-goals

- Multiplayer / ghost simultaneous control
- Tunnel warp con wrap-around a velocità variabile (sì al wrap, no al "fast tunnel")
- Table mode / attract screen
- Soundtrack (solo SFX sintetizzati)
- Leaderboard online

## Anti-goals

- Non usare librerie esterne (solo WebAudio + canvas 2D, come gli altri giochi)
- Non modificare il core della shell (nessun nuovo `Comando`)

## Constraints

- I giochi non toccano il DOM direttamente — solo `ctx.canvas` (2D context, unità CSS)
- La shell gestisce: menu, canvas sizing, HUD, overlay, teardown, touch pad
- Silently degrades: storage/audio wrapped in try/catch
- TypeScript strict, ES2022, ESM, no semicolons, single dark theme
- Aliased imports `@/*` → `./src/*`

## Approaches

| Opzione | Dettaglio | Trade-off |
|---------|-----------|-----------|
| A) Single `logica.ts` | Tutto in un file (~700+ righe) | Coerente ma denso, test meno mirati |
| **B) Pacchetto modulare** ✓ | `labirinto.ts` + `fantasmi.ts` + `logica.ts` | Test granulari, responsabilità chiare |
| C) Ultra-granulare | + `pacman.ts`, `livelli.ts`, ecc. | Overkill |

**Scelta: B.** Il labirinto è dati, l'AI ghost è complessa e meritata isolata, `logica.ts` resta il "cervello".

## Struttura file

```
src/games/pacman/
├── labirinto.ts    # Griglia 28×31, tipo tile, costanti posizioni
├── fantasmi.ts     # AI ghost (pure), stati, target tiles
├── logica.ts       # Stato gioco, tick, scoring, level progression
└── pacman.ts       # Gioco: loop (requestAnimationFrame), rendering, ctx lifecycle

tests/pacman/
├── labirinto.test.ts
├── fantasmi.test.ts
└── logica.test.ts
```

## Dettagli di design

### Labirinto (labirinto.ts)

**Griglia:** 28 colonne × 31 righe (come l'originale).

**Tipo tile:**
```ts
type Tile = 'muro' | 'passo' | 'pellet' | 'power' | 'porta' | 'casa' | 'tunnel'
```

- `muro`: blocco invalicabile
- `passo`: percorso vuoto (dopo che il pellet è stato mangiato)
- `pellet`: punto (10 pts)
- `power`: power pellet (50 pts), 4 nel labirinto
- `porta`: porta della ghost house (trasparente, i fantasmi la attraversano; Pac-Man no)
- `casa`: interno ghost house
- `tunnel`: tile del tunnel laterale (wrap-around, riga 14)

**Layout:** Il labirinto è simmetrico orizzontalmente. Definito come array di stringhe (28 char per riga, 31 righe) per leggibilità, convertito in `Tile[][]` al boot.

**Posizioni chiave:**
- Pac-Man start: (13, 23)
- Ghost house center: (13, 14)
- Porta: (13, 13)
- Tunnel: riga 14, colonne 0 e 27 (wrap)
- Power pellets: (3, 17), (24, 17), (3, 23), (24, 23)
- Frutta: (13, 17) (sotto la ghost house)

### Fantasmi (fantasmi.ts)

**4 fantasmi con AI distinta:**

| Ghost | Nome | Colore | Target |
|-------|------|--------|--------|
| 0 | Blinky (Shadow) | Rosso `#ef4444` | Tile di Pac-Man |
| 1 | Pinky (Bashful) | Rosa `#f472b6` | 4 tile avanti la direzione di Pac-Man |
| 2 | Inky (Speedy) | Ciano `#22d3ee` | 2× vettore da Blinky a (2 tile avanti Pac-Man) |
| 3 | Clyde (Pokey) | Arancione `#fb923c` | Se dist > 8 tile: tile Pac-Man; altrimenti scatter tile |

**Stati ghost:**
```ts
type StatoFantasma = 'casa' | 'uscita' | 'attivo' | 'spaventato' | 'occhio'
```

- `casa`: nella ghost house, aspetta il timer di uscita
- `uscita`: si muove verso la porta (1 tile/s), poi diventa `attivo`
- `attivo`: scatter o chase secondo il timer globale
- `spaventato`: mosso a caso, velocità ridotta, colore blu/flash
- `occhio`: torna alla ghost house ad alta velocità, poi `casa`

**Mode timer (scatter/chase):**

| Fase | Durata | Modalità |
|------|--------|----------|
| 0 | 7s | scatter |
| 1 | 20s | chase |
| 2 | 7s | scatter |
| 3 | 20s | chase |
| 4 | 5s | scatter |
| 5 | 20s | chase |
| 6 | 5s | scatter |
| 7 | ∞ | chase |

Il timer scatter si riduce con il livello: `max(0, 7 - (livello-1)*1.5)` sec per le fasi 0, 4, 6.

**Scatter tile (ogni ghost ha un angolo):**
- Blinky: (0, 0)
- Pinky: (27, 0)
- Inky: (0, 30)
- Clyde: (27, 30)

**Movimento ghost:**
- Ai crossroads (intersezioni), il ghost sceglie la direzione che minimizza la distanza euclidea al target tile
- Non può invertire direzione (tranne: cambio modalità, frighten, collisione con Pac-Man)
- In `spaventato`: scelta casuale tra le direzioni disponibili (no invert)
- In `occhio`: BFS verso la porta, velocità massima

**Velocità (tile/secondo):**
- Base: 8 tile/s (Pac-Man e ghost in chase)
- Ghost in scatter: 7.5 tile/s
- Ghost spaventato: 5 tile/s
- Ghost occhio: 12 tile/s
- Pac-Man: 8 tile/s (livello 1), +0.25 per livello, max 10

**Frightened duration (sec):** `max(2, 6 - (livello-1)*0.5)`

### Logica di gioco (logica.ts)

**Stato:**
```ts
type StatoPacman = {
  pacman: {
    col: number
    riga: number
    dir: Direzione
    dirPrevista: Direzione | null  // input in coda (buffer 1)
    progresso: number              // 0..1, avanzamento nel tile corrente
  }
  fantasmi: Fantasma[]
  labirinto: Tile[][]
  pelletTotali: number
  pelletMangiati: number
  punti: number
  vite: number
  livello: number
  catena: number                   // catena ghost mangiati (200, 400, 800, 1600)
  frutto: Frutto | null            // frutta bonus attiva
  timerModa: number               // secondi rimanenti nella fase scatter/chase
  indiceModa: number              // 0..7
  timerSpaventati: number         // secondi rimanenti di frighten
  statoFase: 'gioco' | 'morte' | 'reset' | 'fine'
  timerFase: number
  casual: () => number
}

type Fantasma = {
  id: number
  col: number
  riga: number
  dir: Direzione
  stato: StatoFantasma
  timerCasa: number  // countdown per uscire dalla casa
}

type Frutto = {
  tipo: number   // indice nel livello frutta
  punti: number
  timer: number  // secondi rimanenti
}
```

**Tick:** Il tick è chiamato a ogni frame (~60fps) con `dt` in secondi. La logica avanza le posizioni di Pac-Man e dei fantasmi basandosi su velocità × dt.

**Collisione:** Se Pac-Man e un ghost sono nella stessa tile (o si scambiano tile in uno step), collisione:
- Ghost `attivo`: Pac-Man muore
- Ghost `spaventato`: ghost mangiato (+punti × catena), ghost diventa `occhio`
- Ghost `casa`/`occhio`: nessuna collisione (protetti)
- Ghost `uscita`: collisione normale (si può mangiare se spaventato)

**Morte:** `statoFase = 'morte'`, timer 2s (animazione di shrink), poi reset posizioni o game over se vite = 0.

**Level complete:** Tutti i pellet mangiati → `statoFase = 'reset'` con livello+1, labirinto rigenerato (solo pellet), posizioni reset.

**Frutta:**
- Compare a 70 e 170 pellet mangiati (per livello)
- Durare 9.9s
- Tipi per livello: cherry(100), strawberry(300), orange(500), apple(700), melon(1000), galaxian(2000), bell(3000), key(5000)
- Livello 9+: si ripete lo stesso set

**Extra life:** A 7000 punti (una sola volta).

**Score per ghost mangiato:** `200 * 2^catena`, catena resetta a 0 alla fine del frighten.

### Rendering (pacman.ts)

**Loop:** `requestAnimationFrame` con delta time (non setInterval come Snake — Pac-Man è real-time continuo).

**Interpolazione:** Ogni entità ha `(col, riga)` + `progresso` (0..1). La posizione pixel = `(col + progresso * delta[col]) * cella`. Questo dà movimento fluido tra tile.

**Pac-Man:** Cerchio giallo con "bocca" (arco) che si anima (oscilla 0°-50°) in base al tempo. Direzione indicata dalla posizione della bocca.

**Fantasmi:** Semi-cerchio sopra + "onde" sotto (3 bump triangolari). Colore per ghost. In `spaventato`: blu con flash bianco negli ultimi 2s. In `occhio`: solo occhi.

**Pellet:** Cerchio piccolo (2px radius). Power pellet: cerchio grande (5px) che pulsa.

**Labirinto:** Muri come linee blu (2px, round cap). Sfondo nero.

**HUD esterno:** Punteggio e vite gestite dalla shell (via `ctx.invia.punteggio()`). Il canvas mostra solo il gioco.

**Animazione morte:** Pac-Man ruota e si "chiude" (arco che si stringe) in 1s, poi pause 1s.

### Audio

| Evento | Suono |
|--------|-------|
| Pellet | Waka-waka: 4 beep alternati 440/880 Hz, 50ms ciascuno |
| Power pellet | Beep basso 220Hz, 200ms |
| Ghost mangiato | Sweep up 400→1200Hz, 300ms |
| Morte | Sweep down 800→100Hz, 800ms |
| Frutta | Beep 660Hz, 100ms × 3 |

Tutti via `beep()` del core (o estensione locale se serve sweep). Se `beep` non supporta sweep, si usa un oscillatore con frequency ramp.

### Input

Comandi: `su`, `giu`, `sx`, `dx` (stessi di Snake).

- Input direzionale: se l'opposto della direzione corrente → invert immediato
- Altrimenti: buffer come `dirPrevista`, applicato al prossimo tile raggiungibile
- Nessun "conferma" necessario (il gioco è sempre attivo una volta avviato)

### Lifecycle

- `crea()`: inizializza stato, avvia rAF loop, registra `comanda`
- `pausa()`: ferma rAF
- `riprendi()`: riprende rAF
- `reset()`: nuovo stato completo
- `smonta()`: ferma rAF, cleanup

### Test

- **labirinto.test.ts:** griglia corretta (dimensioni, simmetria, posizioni power/tunnel), parse delle stringhe
- **fantasmi.test.ts:** target tile per ogni ghost, scelta direzione a crossroad, no-invert rule, stato spaventato (casuale), occhio (BFS)
- **logica.test.ts:** tick avanza posizioni, collisione pacman/ghost, power pellet attiva spaventati, ghost mangiato → occhio + punti, morte → vite-1, level complete, frutta compare/scompare, progressione livello

RNG iniettato nel state (pattern Snake) per test deterministici.

## Decisone del builder (non decise dall'utente)

- Timer rAF vs setInterval: rAF (gioco real-time continuo, non tick-based come Snake)
- Buffer input: 1 (non 3 come Snake) — Pac-Man ha un solo "next direction"
- Frutta: 8 tipi, come l'originale
- Extra life: 7000 pts, una sola
- Max livello: 99 (dopo di che si resta al 99 con la sua difficoltà)
- Ghost exit timer (level 1): Blinky parte già fuori (stato `attivo`, tile (13,11)); Pinky 1s, Inky 4s, Clyde 7s
