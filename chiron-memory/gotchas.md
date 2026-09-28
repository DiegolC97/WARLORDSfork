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
