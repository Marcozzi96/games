# Games — Design

Data: 2026-07-09 · Stato: bozza da approvare

## Intent e perché

Un'app PWA personale chiamata **Games**: un menù iniziale con le copertine dei giochi e una raccolta di piccoli giochi classici, tutti 100% frontend (niente backend). L'app deve essere installabile e funzionare offline. L'obiettivo di questa fase è definire il contenitore (architettura, regole comuni, API dei giochi); i giochi verranno implementati uno alla volta, dopo l'approvazione di questo documento.

## Obiettivi

- PWA: installabile (manifest + service worker), 100% funzionante offline.
- Mobile-first: comandi touch come modalità primaria; tastiera (frecce/WASD, P/Escape pausa, R riavvio) pienamente funzionante su desktop.
- Menù iniziale con griglia di giochi (fino a 10), generata da un registro.
- Ogni gioco autocontenuto: aggiungersi al menù senza toccare il resto dell'app.
- Record (best score) salvato localmente per gioco.
- Interfaccia in italiano. *(scelta del builder, da confermare)*

## Non-obiettivi

- Niente backend, account, leaderboard online, multigiocatore in rete.
- Niente supporto desktop-first: il layout da PC è una conseguenza del mobile-first, non un secondo target.
- Niente store di giochi esterni o engine di terze parti (Phaser ecc.).
- Non in questa fase: la lista definitiva dei 10 giochi (si sceglie uno per uno al momento dell'implementazione).

## Anti-goal (cosa renderebbe il progetto un fallimento)

- Un gioco nuovo che richieda modifiche a file fuori dalla propria cartella.
- Un'esperienza mobile che funzioni solo "accettando" i controlli desktop.
- Bundle o dipendenze che crescano senza necessità (target: app leggera, apertura istantanea su telefono).

## Vincoli

- Solo frontend: JS/TS + browser. Persistenza solo via localStorage.
- Nessun asset pesante: grafica via canvas/SVG, audio generato (WebAudio), niente file mp3/ogg.
- Il gioco deve essere giocabile a schermo intero in verticale su un telefono medio.

## Approcci considerati

1. **Vite + TypeScript puro, senza framework** — la shell dell'app è minima (menù + schermo di gioco) e i giochi sono per natura imperativi (game loop + canvas). Ogni gioco è un modulo autocontenuto registrato in un elenco. *(Scelto dall'utente.)*
2. Vite + React (+ vite-plugin-pwa) — menù come componenti React, giochi incapsulati in componenti. Più comodo se la UI condivisa crescesse molto, ma ogni gioco resta imperativo dentro `useEffect`: cerimoniale in più e bundle più pesante senza beneficio reale.
3. (Scartato) Svelte — valido, ma con una shell così piccola non cambia la partita; si ripescava solo su preferenza dell'utente.

Motivo della scelta: il prodotto sono i giochi, non la shell; zero framework tiene il bundle minimo (ottimo per offline/mobile) e isola completamente ogni gioco dal resto.

## Architettura (scelta del builder)

```
games/
  index.html
  vite.config.ts          # Vite + vite-plugin-pwa (precache, manifest, icone)
  public/icons/           # icone PWA (192, 512, maskable) + favicon
  src/
    main.ts               # entry: avvio, routing semplice menù ⇄ gioco
    app/
      menu.ts             # griglia dei giochi (letta dal registro), suoni, record
      screen.ts           # schermo di gioco: canvas + HUD (punteggio, record, pausa)
    core/
      input.ts            # comandi astratti: normalizza touch e tastiera
      registry.ts         # elenco dei giochi
      storage.ts          # record e preferenze in localStorage
      audio.ts            # beep generati via WebAudio, mute persistente
    games/
      snake/snake.ts
      tetris/tetris.ts
      ...                 # uno per gioco, si aggiunge senza toccare il resto
```

### API di un gioco

Ogni gioco è un modulo che esporta un oggetto da registrare in `core/registry.ts`:

```ts
type Gioco = {
  id: string;            // "snake"
  nome: string;          // "Snake"
  icona: string;         // path SVG da disegnare a mano (niente PNG pesanti)
  comandi: Comando[];    // quali controlli gli servono: ["su","giu","sx","dx","conferma","ruota","punta"]
  orientazione?: 'verticale' | 'orizzontale';  // default verticale; il core gestisce la rotazione/letterbox
  crea: (ctx: CtxGioco) => HandleGioco;
};

type CtxGioco = {
  canvas: HTMLCanvasElement;
  invia: { punteggio(v: number): void; fine(v: number): void; };
  // "comandi" arrivano come callback: ctx riceve un listener sui Comandi
};

type HandleGioco = { pausa(): void; riprendi(): void; reset(): void; smonta(): void; };
```

- Il gioco **dichiara** i comandi che usa; lo schermo di gioco disegna automaticamente i pulsanti touch corrispondenti: D-pad per su/giu/sx/dx, tasto per conferma, tasto dedicato per `ruota`, area tap per `punta`.
- HUD (punteggio corrente, record, pausa, riavvio) è comune a tutti i giochi e gestito da `app/screen.ts`.
- Canvas dimensionato su viewport secondo l'`orientazione` del gioco (default verticale), `devicePixelRatio` gestito dal core.

### Flusso di gioco (comune a tutti)

- `invia.fine(v)` → overlay "Game over" con punteggio finale, record (con evidenziazione "Nuovo record!" se aggiornato) e pulsanti **Rigioca** / **Menù**.
- Pausa → overlay con **Riprendi** / **Menù**; l'app si auto-pausa quando la tab/app passa in background (`visibilitychange`).

### Input (`core/input.ts`)

Comandi astratti: `su, giu, sx, dx, conferma, ruota, punta(x, y)`. Mappatura:

- Tastiera: frecce + WASD → direzioni; spazio → conferma; R → riavvio; P/Escape → pausa.
- Touch: pulsanti disegnati dallo schermo di gioco in base ai `comandi` dichiarati; per giochi a tap singolo l'intero canvas è tasto; per giochi a drag (es. Breakout) si usa `punta`.

### PWA

- `vite-plugin-pwa`: manifest + service worker con precache di tutto (app 100% statica → offline completo).
- Nome "Games", tema scuro, icone 192/512 + maskable.

### Record e preferenze

- `localStorage`: 1 best score per gioco (`games:score:<id>`), mute audio (`games:mute`).
- Niente altro stato persistito.

## Decisioni del builder (da confermare)

1. UI in italiano (nomi giochi, pulsanti, schermate).
2. Tema scuro unico (niente toggle light/dark): più semplice e adatto a giochi.
3. Suoni: beep sintetizzati WebAudio (nessun asset), con toggle mute nel menù.
4. Record: solo 1 best score per gioco, visibile in HUD e nel menù sotto la copertina.
5. Test: Vitest solo sul core (`input`, `storage`, `registry`); i giochi si validano a mano in browser.
6. Lista candidata dei giochi (massimo 10, da confermare uno a uno quando si implementa): Snake, 2048, Tetris, Breakout, Flappy, Memory, 21, Tris, Simon (colori), Pong vs IA. La mescolanza copre tutti i tipi di comando: D-pad, tap, drag, tempo.
7. 2048 si gioca col D-pad direzionale (niente gesto swipe nella v1: tiene l'API dei comandi piccola).
8. I giochi in orizzontale (es. Pong, Breakout) dichiarano `orientazione: 'orizzontale'`; su un telefono in verticale l'app chiede/accetta la rotazione con letterbox, su desktop il canvas è semplicemente più largo che alto.
9. `ruota` è un pulsante dedicato (non un gesto): Tetris lo mappa anche al tasto X/Invio da tastiera.

## Lasciato al builder

- Look & feel visivo (palette, font, animazioni del menù): coerente, scuro, leggibile su mobile.
- Dettagli di gioco (velocità, difficulty, punti) per ogni gioco, decisi al momento dell'implementazione.
- Struttura interna di ogni gioco (il contratto `Gioco` sopra è l'unico vincolo).
- Stato iniziale: il progetto parte con **0 giochi** (solo shell funzionante: menù, screen, PWA) e i giochi si aggiungono uno alla volta.
