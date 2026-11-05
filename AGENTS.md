# PROJECT KNOWLEDGE BASE

**Generated:** 2025-11-05

## OVERVIEW
Project: **Games** (Game Shell)
Stack: **TypeScript 7, Vite 8, Vitest 5, Vite PWA 2, jsdom 31**

A browser-based game shell (PWA) that lets you register and play games. The shell handles menus, canvas rendering, unified input (keyboard + touch), synthesized audio via WebAudio, high-score persistence via localStorage, and pause/game-over overlays. Games are simple: they register an `id`, `nome`, `icona`, supported `comandi`, and a `crea` factory that returns a `HandleGioco`.

## STRUCTURE
```
├── src/
│   ├── main.ts          # App boot: menu → game loop routing
│   ├── pwa.ts           # Service worker registration
│   ├── styles.css       # Single dark theme CSS (all components)
│   ├── core/
│   │   ├── types.ts     # Shared types: Gioco, Comando, CtxGioco, HandleGioco
│   │   ├── registry.ts  # Game registration registry (anti-goal design)
│   │   ├── input.ts     # Unified keyboard + touch input mapper
│   │   ├── audio.ts     # WebAudio synth beeps, mute persistence
│   │   └── storage.ts   # localStorage wrapper (silent degrade)
│   └── app/
│       ├── menu.ts      # Menu grid: game cards, mute button, records
│       └── screen.ts    # Game screen: canvas sizing, HUD, overlays, teardown
├── tests/
│   ├── core/
│   │   ├── audio.test.ts
│   │   ├── input.test.ts
│   │   ├── registry.test.ts
│   │   └── storage.test.ts
│   └── smoke/
│       ├── finto.ts     # Minimal fake game fixture for smoke tests
│       └── screen.test.ts
├── public/icons/        # PWA icons (SVG + PNG 192/512)
├── scripts/
│   └── genera-icona.mjs # Manual PNG generator from pixel math
├── docs/superpowers/    # SDD plans and specs
├── vite.config.ts       # Vite config + PWA plugin + vitest config
└── tsconfig.json        # ES2022 target, bundler resolution, @/ alias
```

## COMMANDS
| Action | Command |
|--------|---------|
| Install | `npm install` |
| Test | `npm test` |
| Build | `npm run build` |
| Run | `npm run dev` |
| Preview | `npm run preview` |

## CODING STANDARDS
*   **Language**: TypeScript with strict mode, ES2022, ESM modules
*   **Style**: 
    *   Explicit `void` return types on functions without meaningful returns
    *   Type imports use `import type { ... }`
    *   Aliased imports via `@/*` → `./src/*`
    *   No semi-colons (config follows Prettier-like conventions)
    *   Single dark theme only (no light/dark toggle)
*   **Rules**: 
    *   Games never touch DOM directly — all rendering via `CtxGioco.canvas` (2D context in CSS units)
    *   Shell manages all DOM: menus, canvas, HUD, overlays, touch pad
    *   Silent degradation on storage/audio failures (try/catch everywhere)
    *   Input commands are declared per-game; undeclared keys are silently ignored

## ARCHITECTURE
*   **Registry pattern**: Games register via `registra(g)`. The registry sorts by name (Italian locale) for the menu.
*   **Context injection**: `CtxGioco` is passed to each game's `crea()`. The game returns a `HandleGioco` (pausa/riprendi/reset/smonta).
*   **Input abstraction**: `CollegaInput()` maps keyboard (WASD/arrows/space) and touch (on-screen pad + pointer drag) to abstract `Comando` values.
*   **Screen lifecycle**: `apriSchermo()` builds the game DOM, creates input handler, sizes canvas (viewport-aware, DPR-aware), then tears down completely on exit (no orphan listeners).
*   **Audio**: Lazy-created `AudioContext` on first user gesture. Beeps use square oscillators with 5ms envelope to prevent clicks. Mute state persists in localStorage.
*   **Storage**: All localStorage access wrapped in try/catch — silently degrades to defaults if storage is unavailable (iframe, private browsing, full quota).

## WHERE TO LOOK
*   **Source**: `src/`
*   **Tests**: `tests/`
*   **Types**: `src/core/types.ts` (single source of truth for game contracts)
*   **Docs**: `docs/superpowers/plans/`, `docs/superpowers/specs/`

## NOTES
*   **Adding a new game**: Register it via `registra()` in `main.ts` (or any entry point) with an `id`, `nome`, SVG `icona`, list of `comandi`, and a `crea` factory.
*   **New commands**: Add to the `Comando` union in `types.ts`, update `MAPPA_TASTI` and `ETICHETTE` in `input.ts`, add CSS grid classes in `styles.css`.
*   **Icon generation**: `node scripts/genera-icona.mjs` generates PNGs from pure pixel math (no dependencies).
*   **No history API**: Routing is simple state-based (menu ↔ game), no browser history manipulation.
*   **Auto-pause**: The game auto-pauses when the tab/window goes to background (`visibilitychange` listener).
