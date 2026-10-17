# gotcha

A non-obvious pitfall or trap, learned the hard way.

## dependency-cruiser silently cruises 0 modules under TypeScript 7

**What:** With `typescript@7.x` installed, `depcruise` prints "no dependency violations found (0 modules, 0 dependencies cruised)" and exits 0, so every import-boundary rule passes vacuously. It only emits a soft "missing-typescript-transpiler" notice, not an error.
**Why:** dependency-cruiser 18.x supports `typescript >=2 <7`; the TypeScript 7 (Go-based) compiler API is not published yet.
**Where:** `package.json` pins `typescript` to 6.0.3 for this reason. `.dependency-cruiser.cjs`.
**Learned:** 2026-09-25, while verifying the boundary check with an injected cross-screen import that did not fail. Before bumping TypeScript to 7, confirm the cruise output reports a non-zero module count.

## Headless Chrome on this Mac: use --screenshot, not DevTools captureScreenshot

**What:** Driving the app through the DevTools protocol (Runtime.evaluate clicks) works, but `Page.captureScreenshot` returns a black or 1×1 image and `HeadlessExperimental.beginFrame` is not available. Chrome's own `--screenshot=` flag renders correctly; WebGL needs `--use-angle=swiftshader --enable-unsafe-swiftshader`.
**Why:** The new headless mode's compositor does not flush for protocol captures without a GPU.
**Where:** Verification only — no project code. Recipe: dump the rendered DOM via protocol, rewrite asset paths to `file://`, then run Chrome with `--screenshot` on the snapshot.
**Learned:** 2026-09-25.

## dependency-cruiser silently cruises zero modules (passes vacuously) when TypeScript 7 is…

What: dependency-cruiser silently cruises zero modules (passes vacuously) when TypeScript 7 is installed, so the cross-screen import boundary check becomes a no-op. · Why: dependency-cruiser does not yet support TypeScript 7's compiler API; discovered when the boundary check reported "0 modules, 0 dependencies cruised" instead of failing on an injected violation. · Where: .dependency-cruiser.cjs, package.json (typescript dependency). · Learned: TypeScript must stay pinned to the latest 6.x (6.0.3) for the import boundary check to actually run; verify boundary-check module/dependency counts are non-zero after any TypeScript upgrade. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-0 -->

## tsc --noEmit rejects importing vitest.config from vite.config.ts using an explicit .ts ex…

What: tsc --noEmit rejects importing vitest.config from vite.config.ts using an explicit .ts extension unless allowImportingTsExtensions is enabled in tsconfig.json (safe here since the project only ever type-checks with noEmit, never emits). · Why: — · Where: tsconfig.json, vitest.config.ts. · Learned: needed when a Vitest config re-imports the Vite config by relative path with an extension. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-11 -->

## Headless Chrome screenshots taken by opening about:blank and injecting content, or via He…

What: Headless Chrome screenshots taken by opening about:blank and injecting content, or via HeadlessExperimental.beginFrame, can silently produce a 1×1 or blank PNG instead of erroring. · Why: the headless window has no real viewport/size in that mode; HeadlessExperimental.beginFrame isn't available in the installed Chrome. · Learned: navigate directly to the built app's served URL and pass an explicit clip/viewport size when capturing a screenshot for verification, rather than trusting a non-empty PNG file size alone. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-12 -->

## The rules document lives on disk, not in the ontology

What: The ontology tools still answer "Agent is not enrolled in this project", but the full rules document is on this machine at `~/Desktop/TALLER/CHIRON+ADE/WARLORDS-COMPLETE-RULES.md` (unit table §6.1, melee attack table §8.2, projectiles §8.4, upgrades §9, races §10, two-player §14) · Why: earlier slices worked from quoted work-order text because the document could not be retrieved; the roster slice needed every stat and found the file with `mdfind -name WARLORDS` · Where: outside the repo; `src/roster/data.ts` cites its sections · Learned: before assuming a reference document is unavailable, search the local disk — the user keeps project documents under ~/Desktop/TALLER
## Vitest will not run a test file outside the project root

What: A test file placed in the session scratchpad fails with "Cannot find module '/@fs/…'" even when passed through `include`, because Vite only serves files under the project root · Why: Vite's /@fs/ serving is restricted to the root and allowed dirs · Learned: for a one-off rendering snapshot, drop a temporary `*.test.ts` under src/, run it by path, and delete it in the same command

## Writing to the SaveStore behind the live CampaignAccess is overwritten on the next update

What: In app-level tests, `app.store.write(...)` after the app has booted does not change what screens see: `createCampaignAccess` keeps its own current save and the next `update` writes that back over the store · Why: the campaign access is the in-memory truth and the store is write-through from it · Where: src/save/saveStore.ts (createCampaignAccess) · Learned: seed storage before `createApp`, or go through ctx.campaign.update

## A screen's test file may not import another screen's index either

**What:** `no-cross-screen-imports` applies to `src/screens/map/map.test.ts` importing `src/screens/battle/index.ts` just as it does to production code; the map test needed the battle's test hook to win a battle.
**Why:** the rule matches on path, not on test/production.
**Where:** `.dependency-cruiser.cjs`; the hook moved to `src/battle/handle.ts` (`battleHandle`, `attachBattleHandle`), outside any screen folder.
**Learned:** 2026-10-15. Put shared test hooks in a seam module, never in a screen folder.

## Full-length battles are cheap to simulate under jsdom

**What:** Ticking the battle screen through all 7200 frames with DOM updates and a per-tick assertion takes about a second in Vitest/jsdom (`NullEngineHost.tick(1)` in a loop).
**Why:** the reference simulation and the DOM reconciliation are small; snapshots are plain objects.
**Where:** `src/screens/battle/battle.test.ts` ("across a full battle…").
**Learned:** 2026-10-15. A seeded `Math.random` spy (`vi.spyOn(Math, 'random')`) makes screen-level battles replay exactly.

## Chrome DevTools MCP sessions can leave stray key state on the page

**What:** While eyeballing the battle in the chrome-devtools MCP page, a unit once spawned and the unit selection moved with no scripted key; a repeated run with a keydown logger showed no key and no spawn.
**Why:** unknown, most likely a key event from the tooling reaching the page; not reproducible.
**Learned:** 2026-10-15. When a browser check shows input-like behaviour, log `keydown` on `window` before trusting it as a code defect.

## A 4× sprite set only fits 1024² when held frames are pixel-identical

What: The Spearman's 67 body frames plus accents overflowed 1024×1024 while each swipe recovered slowly over ten frames (every frame a different ~150×130 px rect). The clips now recover in `RECOVER_FRAMES` (5) and then return the exact ready pose; the packer stores identical pixels once, so a race atlas needs 430–780 rows. Anything that varies per frame (pennant wave, plume sway) must be driven by a pose field (`phase`), not the frame index, or held frames stop deduplicating. · Why: trimmed shelf packing cannot beat frame area; dedupe is the lever. · Where: art/units/spearman/clips.mjs (`RECOVER_FRAMES`, `phase`), art/lib/pack.mjs · Learned: when a new unit's atlas overflows, shorten its recoveries and check `unique` in the build output before touching the authoring scale.

## Trimmed atlas frames may carry a pivot outside 0…1

What: Frames are trimmed to their pixels and the pivot is the feet as a fraction of the trimmed rect, so a small frame far from the feet (an accent pennant, a lying body's spear) has a pivot like `[-3, 8.3]`. The contract validates that the pivot is finite, never that it lies inside the frame. · Why: the first contract draft rejected every accent frame for this; the renderer only multiplies the pivot by the rect size, so out-of-range values are correct. · Where: src/roster/atlas.ts (`contractProblems`)

## Destroying one PlayCanvas app nulls the global the next `new pc.Entity()` falls back on

**What:** `pc.Entity(name)` without an app argument uses `getApplication()`, the engine's current application; `app.destroy()` sets it to null, so after any test destroys a host, an entity created for a surviving app throws "Cannot read properties of null (reading 'systems')" on `addComponent`. Every entity in `src/render` and `src/engine/appHost.ts` is therefore created as `new pc.Entity(name, app)`.
**Why:** the engine keeps one global current app; parallel or sequential apps in one test file expose it.
**Where:** `src/render/unitLayer.ts`, `src/render/fieldView.ts`, `src/engine/appHost.ts`.
**Learned:** 2026-10-17.

## `gl.readPixels` on the game canvas reads zeros; sample pixels from a screenshot instead

**What:** Reading the WebGL drawing buffer from an injected script — in a `requestAnimationFrame` after the engine's, or in the app's `postrender` event — returned transparent black for every pixel (the engine renders into its own back-buffer target and the default framebuffer is not preserved). The browser verification instead froze the simulation (`overlay.battle.simulation.tick = () => {}`), computed each pennant's screen position from `overlay.field.view.toScreen` and the accent frame's rect and pivot, took a DevTools screenshot (DPR 2) and sampled it with a 60-line pure-Python PNG decoder.
**Why:** the acceptance criterion asks for sampled accent pixels; the screenshot path is the one that works on this setup.
**Where:** verification only; `src/render/fieldHandle.ts` is the hook it used.
**Learned:** 2026-10-17. A DevTools screenshot must be saved inside a workspace root (the repo), so delete it afterwards.
