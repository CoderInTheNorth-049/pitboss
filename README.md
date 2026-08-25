# PITBOSS 🤖

Browser arena roguelite FPS vs bots **that remember you**. Built with Three.js + TypeScript + Vite. No server, no assets to buy — everything is procedural, runs in a tab at ~152 KB gzipped.

> The bots remember. Do you?

## The Hook

Every rival bot is persistent. Whoever lands the killing blow on you gets **promoted between runs** — renamed, tier-stacked, given a new trait and a taunt. Grudges live in IndexedDB and survive page reloads. An **AI director** reads your stress (damage rate, HP, accuracy) and quietly rebalances spawn cadence and aggression; when the crowd heat maxes out, you get a **surge**.

## Features

- **Waves + AI director** — heat meter, stress-based pacing, surge events
- **Wave mutators** — most waves (75% from wave 2) roll a rule-twist: LOW GRAVITY, GLASS CANNON (2× damage both ways), SWARM (2× quota, weaker rivals), BLINK, BOUNTY (loot every 4th kill), DARK ZONE (fog closes in), VAMPIRE (kills heal); announced with banner + HUD chip
- **Boon drafts** — after every cleared wave the game freezes and offers 3 boons (pick 1 or skip for +25 vitals): move speed, mag size, headshot power, burn, sentry tuning, max vitals, drop rate, reload speed, kill-leech and more — stack a different build every run (all neutral-ish by design)
- **Arena variants** — 3 cover layouts (THE CROSS, THE RING, THE LANES); daily runs fix the layout, normal runs roll one each run
- **THE PITBOSS mini-boss** — every 5th wave a named TYRANT-tier boss enters with 2.2× vitality; bring it down for +30 vitals and double loot
- **Mystery crates** — rare pink drop, always a treat: vial surge, Aegis, Overdrive, a Warden turret, or a 10% JACKPOT (Bulwark + Overdrive)
- **Daily runs** — one button, same seed for everyone that day: same arena, same mutator sequence, fair comparison; daily runs emit `PB2-…-d` share codes and track a per-day best
- **Milestones + cosmetics** — 10 achievements (FIRST BLOOD → CROWD PLEASER) with toasts; unlock muzzle-color styles in SETTINGS → STYLE (pure style, no power)
- **Career code** — `PBC1-…` checksummed code on the start screen carries milestones + counters to any other browser; no account, no crypto lib, just paste to continue
- **Nemesis roster** — 5 tiers (GRUNT → TYRANT), 6 traits (SWIFT, BULWARK, DEADEYE, TWINCAST, PHANTOM, BRUISER), procedural names/taunts, persistent W/L records
- **Special weapons** — PYROCLAST (flame cone: short range, hits whole crowds, ignites + spreads) and RAILHAND (piercing lance) drop every 3rd wave + surges; 12s each, then back to the PIT RIFLE
- **WARDEN sentry** — violet turret drop deploys instantly where claimed; auto-targets nearest rival with LOS inside its visible 25m range ring, 3× rifle damage per shot; kills feed your streaks and drops
- **First-person viewmodels** — every weapon has a hand-built model with sway, walk bob, recoil, reload dip and switch pop animations
- **Headshot zones** — every rival has a head hitbox above the body sphere; headshots deal 1.75× damage with a distinct gold hitmarker and high-pitch audio cue (works on RAILHAND pierce too)
- **Special-drop pity** — weapon drops never repeat back-to-back; PYROCLAST and RAILHAND strictly alternate, so the flame thrower always shows up within one drop
- **Burn DoT** — flame-ignited rivals burn for 2s and can spread fire to nearby rivals
- **Kill-streak drops** — every 8th kill spawns a drop where the enemy died: AEGIS shield (absorbs 65–80% of damage for 10s), OVERDRIVE core (2× damage + unlimited ammo, 6s), BULWARK core (full invulnerability, 5s), WARDEN turret (auto-firing sentry: 78 dmg/shot, 25m radius, 20s) or an ammo cache
- **Kill-streak announcer** — DOUBLE KILL → TRIPLE KILL → RAMPAGE → UNSTOPPABLE banners with crowd roar; each tier stokes the director's heat
- **Vitality vials** — heal pickup (+30 HP) every wave, 20s timer with shrinking ring + beacon
- **Share codes** — death screen encodes your run (`PB1-…`); friends paste it on the start screen to compare against their best
- **Hall of Scars** — local top-5 high-score board (wave, kills, accuracy, time) on the start screen; death screen announces `★ NEW HIGH SCORE ★` or your board rank
- **Accessibility** — fully remappable controls (ESDF, arrow keys, left-handed — anything) with conflict-safe swap, plus mouse sensitivity, invert-Y, FOV 70–110°, volume, reduced-flashing mode and crosshair size; color-blind-safe telegraphs (shape + motion + audio, never color-only), fallback mouse-look when pointer lock is blocked
- **Procedural audio** — all SFX synthesized via WebAudio; zero asset downloads

## Quickstart

```bash
npm install
npm run dev        # http://localhost:5173
```

Controls: **WASD** move · **MOUSE** aim · **LMB** fire · **R** reload · **SPACE** jump · **SHIFT** sprint · **ESC** pause — all remappable in SETTINGS (start screen or pause menu); preferences persist in localStorage.

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
| `npm run test:settings` | Rebind WASD→E, conflict swap, accessibility sliders, persistence, reset |
| `npm run test:variety` | Mutator effects (glass cannon, low gravity, swarm, dark zone), boon stacking, draft pick/skip flow, seeded determinism |
| `npm run test:progression` | Arena layouts, mystery crate, wave-5 boss kill, daily run + PB2 code, career code export/import |
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
│   ├── input.ts          keyboard/mouse via remappable bindings, pointer lock + fallback look capture
│   ├── settings.ts       bindings + accessibility prefs (localStorage), rebind conflict-swap
│   ├── mods.ts           run-modifier aggregation: boon stacks + wave mutator multipliers
│   ├── mutators.ts       wave mutator definitions (low gravity, glass cannon, swarm…)
│   ├── boons.ts          boon draft definitions (perks picked after each wave)
│   ├── career.ts         milestones, lifetime counters, portable PBC1 career code
│   └── shareCode.ts      run ⇄ base36 string encode/decode/describe (PB1 + PB2 daily)
├── player/player.ts      FPS controller: look, accel/friction, bob, FOV kick
├── weapons/
│   ├── specs.ts          WeaponSpec defs: PIT RIFLE, RAILHAND, PYROCLAST
│   ├── viewmodel.ts      first-person weapon models: sway/bob/recoil/reload/switch
│   └── weapon.ts         spec-driven firing: hitscan pellets, pierce, flame cone
│                         (AoE + burn), bloom, reload, special-timer revert
├── enemies/
│   ├── enemy.ts          FSM bot: rise → hunt/strafe → telegraph → burst fire,
│   │                     LOS raycasts, unstuck steering, name sprites,
│   │                     body + head hitboxes for locational damage
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
│   └── pickups.ts        vials + weapon/aegis/overdrive/refill drops: timers,
│                         beacons, shrink rings
├── vfx/effects.ts        pooled tracers/beams/impacts/embers, flame cone, muzzle light
├── audio/sfx.ts          WebAudio synth (shots, rail, flame roar, shield, streaks…)
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
- **~~Enemy stat rolls use `Math.random()`~~ FIXED** — `buildStats` now consumes the injected run RNG (prerequisite for future fully-seeded replays; mutator rolls are already seed-deterministic)
- **Single arena** — layout is hand-authored in `arena.ts`; seeded procedural arenas are the obvious next step
- **HUD is DOM-per-frame** — text updates every frame; fine now, move to canvas/sprites if profiling demands
- **No WebGL context-loss recovery** — rare, but a lost context requires a manual refresh
- **Roster growth unbounded in long careers** — capped at 24 rivals, oldest grunts are never pruned automatically
- **`?debug=1` hook** — handy, but it's an unauthenticated window global on production builds

## Credits & Stack

- [three.js](https://threejs.org) (MIT) — rendering
- [Vite](https://vitejs.dev) + TypeScript — build
- Concept: Pitch B ("PITBOSS") from the 3D browser-games research doc in this repo's parent folder
