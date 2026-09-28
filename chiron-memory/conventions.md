# convention

A rule the codebase follows — naming, patterns, and where things live.

## One folder per screen; only index.ts is public

**What:** Each screen lives in `src/screens/<id>/` and exports exactly one `ScreenDefinition` from `index.ts`. Nothing outside the folder may import any other file in it, and no screen may import another screen's folder. Screens get everything through `ScreenContext` (overlay element, engine root, loaded assets, campaign access, `navigate`).
**Why:** Keeps slices independent; the rule is machine-checked so it does not rely on review.
**Where:** `.dependency-cruiser.cjs` (rules `no-cross-screen-imports`, `screens-expose-only-index`, `only-save-module-touches-storage`), run by `npm run check:deps` as the first step of `npm run build`. Screen contract in `src/shell/screen.ts`.
**Learned:** 2026-09-25.

## Screens declare assets as a manifest; the shell loads them

**What:** A `ScreenDefinition.assets` manifest (`{ id, type, url }[]`) is loaded by `src/assets/loader.ts` before `enter()` and released on exit. Files go under `public/assets/` and are referenced as `assets/...`.
**Why:** A slice adds assets by editing its own manifest, never the loader. Loading before teardown keeps exactly one screen mounted at all times.
**Where:** `src/assets/loader.ts`, `src/shell/screenShell.ts` (`switchTo`), PlayCanvas backend in `src/engine/playcanvasHost.ts`.
**Learned:** 2026-09-25.
