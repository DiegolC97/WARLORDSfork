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

## The chiron-ontology MCP tools (ontology_search, etc.) reported "Agent is not enrolled in…

What: The chiron-ontology MCP tools (ontology_search, etc.) reported "Agent is not enrolled in this project" and returned nothing throughout this project's sessions, so the Warlords rules document could not be read directly from the ontology and had to be worked from quoted work-order text and assumptions instead. · Why: — · Learned: don't assume ontology_search will succeed for this project; verify enrollment or fall back to work-order text, flagging unverified assumptions (race roster ids, unit display names, instructions text, win conditions) for later checking against the rules document. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-13 -->
