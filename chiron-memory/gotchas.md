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
