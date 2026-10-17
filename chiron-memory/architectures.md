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

## The battle seam is a frame snapshot plus spawner commands; a reference simulation sits behind it

**What:** `src/battle/types.ts` defines `FrameState` (tick, frames left, scores, territory-bar target and drawn width, winner, per-side `SpawnerState` with lane / selected unit / charged / recharge time / charge kills, every unit and projectile) and `SpawnerCommand` (`lane-up`, `lane-down`, `previous-unit`, `next-unit`, `release`, `charge`). `src/battle/simulation.ts` (`createBattle`) implements the rules document's battle frame — spawner and recharge (§4), scoring, bar and timer (§5), the unit state machine with melee strikes, projectiles and kill credit (§7–8) and the computer opponent (§13) — reading every statistic from `src/roster`. The battle screen renders snapshots and issues commands; it holds no rule. `battleHandle(overlay)` (in the seam, not the screen folder) exposes the simulation on a mounted battle overlay for tests.
**Why:** the battle-screen work order was written against "the simulation's frame snapshot" but no simulation existed; defining the seam first lets a combat slice replace or refine the reference implementation without touching the screen or its tests.
**Where:** `src/battle/`, `src/screens/battle/`, tests in `src/battle/simulation.test.ts` and `src/screens/battle/battle.test.ts`.
**Learned:** 2026-10-15; revised 2026-10-16 by the rules-faithful simulation slice: projectile drift and the 500-frame body plus 1 %/frame fade are now modelled (see the decisions on projectiles and the seeded generator). Still outside the simulation: the level-one tutorial timer hold and the enemy's difficulty upgrades (§12.4), which belong to the campaign-difficulty slice.

## Screens get a frame clock through EngineHost.onFrame and ctx.onFrame

**What:** `EngineHost.onFrame(cb)` subscribes to rendered frames (PlayCanvas `app.on('update')`; `NullEngineHost` records callbacks and `tick(frames, fps)` delivers them in tests). The shell exposes it as `ctx.onFrame` and releases a screen's subscriptions on exit. The battle screen accumulates elapsed seconds and steps its simulation at a fixed 24 fps, capping catch-up at 0.25 s.
**Why:** screens must not reach the engine app directly (it is `null` headless), and tests need to drive time deterministically.
**Where:** `src/engine/host.ts`, `src/engine/nullHost.ts`, `src/engine/playcanvasHost.ts`, `src/shell/screenShell.ts`, `src/screens/battle/index.ts`.
**Learned:** 2026-10-15.

## The frame snapshot carries clip names, clip frames, opacity and the tick's hits

**What:** `UnitState` reports `race`, `clip` (`walk`, `swipe-N` by roster index, `death`), `clipFrame` (the frame offset the tick just processed, so a strike shows on the swipe's strike frame) and `alpha` (1 while alive and for 500 frames of body, then 0.99 … 0.01 and removal at 0). `FrameState.hits` lists every blow that landed this tick (`by`, `target`, `kind`, `power`, `damage`, `knockback`, `killed`). Inside the simulation a unit's clip advances at the start of its tick (`frame++`, `cycleLeft--`), and a clip of N frames occupies exactly N ticks (frames 0…N−1) before the next `ready()`.
**Why:** the work order's snapshot is entity id, position, lane, type, race, facing, clip name and clip frame; the renderer maps clip names onto art and never asks the simulation about sprites. Hits let the renderer play impacts and let tests assert strike timing and damage rolls from outputs alone.
**Where:** `src/battle/types.ts`, `src/battle/simulation.ts` (`tickUnit`, `unitState`, `damage`), tests in `src/battle/combat.test.ts`.
**Learned:** 2026-10-16. Scenario tests should stream units (release whenever the recharge allows) rather than stage a single duel: two lone units can walk past each other on a 20 % roll and leave the scenario empty.

## Unit atlases follow a frame-key contract derived from the roster; the renderer resolves clip and frame through it

What: `src/roster/atlas.ts` defines the atlas contract: frames keyed `<sprite>/<clip>/<n>` (`ready` 2, `walk` = walk cycle, `swipe-i` = the i-th attack's clip with its strike frame inside, `death` 8), a matching untinted accent frame `<sprite>/accent/<clip>/<n>` per body frame, a `<sprite>/portrait` crop, rects in top-left texture pixels with a feet pivot and `meta.scale` (4). `requiredClips(unit)` reads the lengths from the roster, `contractProblems` validates a document, `resolveFrame(doc, unit, clip, clipFrame)` gives the renderer the key (clamping past the clip's end). A unit without a sprite set keeps its single legacy frame and the tinted placeholder block. `validateRoster` now takes parsed atlas documents (`AtlasDocuments`), not frame-name lists. · Why: the art pipeline proof needed one machine-checked definition of "what an atlas must contain" that both the build check and the renderer read, so an atlas that passes `check:roster` is guaranteed to animate without a missing frame. · Where: src/roster/atlas.ts, src/roster/validate.ts, scripts/check-roster.mjs · Learned: the contract must not import `src/battle` (type-only imports still count for the no-circular rule), so it spells the clip union itself as `PlayingClip`.
