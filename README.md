# PITBOSS 🤖

Browser arena roguelite FPS vs bots **that remember you**. Built with Three.js + TypeScript + Vite. No server, no assets to buy — everything is procedural, runs in a tab at ~152 KB gzipped.

> The bots remember. Do you?

## The Hook

Every rival bot is persistent. Whoever lands the killing blow on you gets **promoted between runs** — renamed, tier-stacked, given a new trait and a taunt. Grudges live in IndexedDB and survive page reloads. An **AI director** reads your stress (damage rate, HP, accuracy) and quietly rebalances spawn cadence and aggression; when the crowd heat maxes out, you get a **surge**.

## Features

- **Waves + AI director** — heat meter, stress-based pacing, surge events
- **Nemesis roster** — 5 tiers (GRUNT → TYRANT), 6 traits (SWIFT, BULWARK, DEADEYE, TWINCAST, PHANTOM, BRUISER), procedural names/taunts, persistent W/L records
- **Special weapons** — SCATTERGATE (6-pellet shotgun) and RAILHAND (piercing lance) drop every 3rd wave + surges; 12s each, then back to the PIT RIFLE
- **Vitality vials** — heal pickup (+30 HP) every wave, 20s timer with shrinking ring + beacon
- **Share codes** — death screen encodes your run (`PB1-…`); friends paste it on the start screen to compare against their best
- **Hall of Scars** — local top-5 high-score board (wave, kills, accuracy, time) on the start screen; death screen announces `★ NEW HIGH SCORE ★` or your board rank
- **Accessibility** — color-blind-safe telegraphs (shape + motion + audio, never color-only), fallback mouse-look when pointer lock is blocked, remappable-friendly input layer
- **Procedural audio** — all SFX synthesized via WebAudio; zero asset downloads

## Quickstart

```bash
npm install
npm run dev        # http://localhost:5173
```

Controls: **WASD** move · **MOUSE** aim · **LMB** fire · **R** reload · **SPACE** jump · **SHIFT** sprint · **ESC** pause

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc --noEmit`) + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run test:e2e` | Full loop: combat → death → promotion → roster persistence (needs dev server + Chrome) |
| `npm run test:features` | Heal vial, special-weapon equip/fire/expiry |
| `npm run test:decode` | Share-code decode + comparison messages |
| `npm run test:regression` | Pointer-lock denial must never break the game |
| `npm run test:hall` | High-score board: ranking, ties, persistence |

Tests use `puppeteer-core` driving your local Chrome (`CHROME_PATH` env to override) against a running dev server (`TEST_URL` env to override, default `http://localhost:5199`). Start one with `npx vite --port 5199` first. Debug hooks (`window.__PITBOSS`) are exposed in dev mode, or on any build via `?debug=1`.

## Architecture

```
src/
├── main.ts               entry; global error surface
├── config.ts             every tunable number (player/weapon/enemy/director/waves)
├── core/
│   ├── game.ts           orchestrator: state machine (menu/play/dead/pause),
│   │                     frame loop w/ sub-stepping, spawn & death flows
│   ├── highscores.ts     local top-5 board (localStorage, tie-break rules)
│   ├── input.ts          keyboard/mouse, pointer lock + fallback look capture
│   └── shareCode.ts      run ⇄ base36 string encode/decode/describe
├── player/player.ts      FPS controller: look, accel/friction, bob, FOV kick
├── weapons/
│   ├── specs.ts          WeaponSpec defs: PIT RIFLE, SCATTERGATE, RAILHAND
│   └── weapon.ts         spec-driven hitscan: pellets, pierce, bloom, reload,
│                         special-timer with revert callback
├── enemies/
│   ├── enemy.ts          FSM bot: rise → hunt/strafe → telegraph → burst fire,
│                         LOS raycasts, unstuck steering, name sprites
│   ├── traits.ts         tiers, trait pool, stat composition
│   ├── names.ts          procedural rival names
│   └── taunts.ts         kill/spawn/feared/surge lines
├── ai/
│   └── director.ts       heat/stress pacing, wave quotas, surge, spawn cadence
├── memory/
│   ├── store.ts          IndexedDB wrapper w/ in-memory fallback
│   └── rivals.ts         roster, promotion (tier+trait+taunt), spawn weighting
├── world/
│   ├── arena.ts          geometry, lights, colliders, LOS raycasts, spawn pads
│   └── pickups.ts        vials + weapon drops: timers, beacons, shrink rings
├── vfx/effects.ts        pooled tracers/beams/impacts, muzzle light
├── audio/sfx.ts          WebAudio synth (shots, rail, shotgun, heal, surge…)
└── ui/
    ├── hud.ts            HP/ammo/wave/heat/boss-bar/special-timer/killfeed
    └── screens.ts        start/death/roster/pause overlays, share-code UI
```

**Data flow:** `Game.frame` → fixed-max sub-steps of `simulate(dt)` → input → player → weapon → director (spawns via `RivalMemory.createSpawnSpec`) → enemies → pickups → HUD. Rendering is a single `renderer.render` per frame; all gameplay is plain TS classes, no ECS.

**Tuning:** almost every number lives in `src/config.ts` and `src/weapons/specs.ts`.

## Deploy to Vercel

The game is a fully static Vite build — no server, no env vars. Pointer lock and IndexedDB need HTTPS, which Vercel provides.

**Option A — Dashboard (recommended)**
1. Push this folder to a GitHub repo
2. [vercel.com/new](https://vercel.com/new) → import the repo
3. Vercel auto-detects **Vite** (build `npm run build`, output `dist`) → **Deploy**
4. Every push to `main` ships production; PRs get preview URLs

**Option B — CLI**
```bash
npm i -g vercel
vercel login
vercel          # preview
vercel --prod   # production
```

`vercel.json` pins the build settings explicitly, so the deploy works even if framework detection changes. Note: `npm run build` runs `tsc --noEmit` first — type errors block deploys, which acts as your CI gate.

## Technical Debt (honest list)

- **Touch/mobile unsupported** — pointer lock + WASD only; needs a mobile control scheme
- **No unit tests** — e2e flows are covered headlessly, but pure logic (director math, trait stacking) isn't unit-tested
- **Fire-and-forget persistence** — `store.put()` isn't awaited; a mid-write tab close can lose the latest promotion (acceptable stakes)
- **Enemy stat rolls use `Math.random()`** instead of the injected RNG — blocks deterministic run replays
- **Single arena** — layout is hand-authored in `arena.ts`; seeded procedural arenas are the obvious next step
- **HUD is DOM-per-frame** — text updates every frame; fine now, move to canvas/sprites if profiling demands
- **No WebGL context-loss recovery** — rare, but a lost context requires a manual refresh
- **Roster growth unbounded in long careers** — capped at 24 rivals, oldest grunts are never pruned automatically
- **`?debug=1` hook** — handy, but it's an unauthenticated window global on production builds

## Credits & Stack

- [three.js](https://threejs.org) (MIT) — rendering
- [Vite](https://vitejs.dev) + TypeScript — build
- Concept: Pitch B ("PITBOSS") from the 3D browser-games research doc in this repo's parent folder
