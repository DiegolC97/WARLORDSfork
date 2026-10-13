# architecture

How the system is put together — layers, boundaries, and how data flows.

## Engine behind an EngineHost seam so the shell and screens test headless

**What:** `src/engine/host.ts` defines `EngineHost` (app, asset backend, `createSceneRoot`, `setClearColor`). `playcanvasHost.ts` is the only module that constructs the PlayCanvas application; `nullHost.ts` is used by tests. Screens import engine types as `import type` only.
**Why:** PlayCanvas needs WebGL, which jsdom lacks. The seam lets the scripted navigation pass and save tests run under Vitest + jsdom, while `src/app.ts` composes the same shell in the browser.
**Where:** `src/engine/`, `src/app.ts` (composition root), `src/main.ts` (browser entry).
**Learned:** 2026-09-25.

## An EngineHost seam abstracts the PlayCanvas application/runtime so the screen shell and s…

What: An EngineHost seam abstracts the PlayCanvas application/runtime so the screen shell and screens can run headless in tests without a real WebGL context. · Why: enables a fully headless Vitest/jsdom test setup (a required acceptance criterion) while still driving the real engine in the browser build. · Where: src/engine/ (EngineHost and related headless/real implementations). <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-8 -->

## The roster is one data definition in src/roster/data.ts that every screen reads

What: `src/roster/data.ts` defines the 19 units (speed, HP, recharge, range, cost, walk cycle, attack set with clip/strike frames/reach/power/upgrade track/movement, projectile data) and the races (exclusive unit or null, palette id, atlas url); `roster.ts` resolves availability, starter trio, two-player draw, per-race names, prices, bounties and visuals from it, and every resolver takes the definition as an optional argument · Why: the work order forbids any screen or system carrying its own copy of unit statistics, and the race list will change again; the optional-definition parameter lets tests and the build check validate corrupted or extended copies without mutating the shipped data · Where: src/roster/data.ts, src/roster/roster.ts, src/roster/validate.ts, scripts/check-roster.mjs · Learned: keep the data file free of display names so the name check keeps passing, and keep stats out of comments elsewhere

## Race ids live in src/roster/races.ts, a leaf both save and roster import

What: `RACES`, `BLOC_RACES`, `UNLOCKABLE_RACE` and `RaceId` are defined in `src/roster/races.ts` (no imports) and re-exported by `src/save`; `data.ts` imports them from there · Why: `save/schema.ts` needs the roster's starter trio for its defaults and the roster needs `RaceId`, which would be a module cycle (dependency-cruiser's no-circular rule counts type-only imports) unless the id list sits in a leaf module · Where: src/roster/races.ts, src/save/schema.ts, src/roster/data.ts · Learned: when two modules need each other's constants, extract the shared constants into an import-free leaf rather than relaxing the cycle rule
