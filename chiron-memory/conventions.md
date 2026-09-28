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

## Work order plans for this project should not include phases for committing, pushing, open…

What: Work order plans for this project should not include phases for committing, pushing, opening pull requests, or recording chiron-memory entries as separate execution steps. · Why: the user stated the Chiron CLI already performs commit, PR, and memory-recording after a work order's plan is approved and executed, so listing them in the plan is redundant. · Where: chiron-next / chiron-push workflow. · Learned: draft plans that end at verification/build steps, not at git or memory actions, for this project. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-18 -->

## Each screen lives in its own folder under src/screens/<name>/ and only index.ts is import…

What: Each screen lives in its own folder under src/screens/<name>/ and only index.ts is importable from outside; a screen's other files are internal. · Why: enforced by a dependency-cruiser rule (screens-expose-only-index) so screens can't reach into each other's internals, per the work order's decoupling requirement. · Where: src/screens/<name>/index.ts, .dependency-cruiser.cjs. · Learned: adding an import of a screen's non-index file from outside that screen's folder fails the build with a named violation — verified by deliberately injecting and then removing such an import. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-5 -->

## Each screen declares its own asset manifest (textures, texture atlases, JSON) and the she…

What: Each screen declares its own asset manifest (textures, texture atlases, JSON) and the shell loads that manifest before entering the screen, rather than a shared central manifest. · Why: lets a slice add its own assets without modifying the shared loader (an explicit acceptance criterion). · Where: src/assets/loader.ts, per-screen index.ts assets field. · Learned: the loader has a PlayCanvas backend and a null backend, so screens/tests can run headless without a real engine asset registry. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-6 -->

## All player-facing working names (game title, race names, unit names, original-game credit…

What: All player-facing working names (game title, race names, unit names, original-game credit) live only in src/names/displayNames.ts; a scripts/check-names.mjs script fails the build if any of those strings appear anywhere else in src/, public/ or index.html. · Why: to guarantee the remake's branding/naming can be swapped without hunting through code, and to keep original IP names isolated to one auditable file. · Where: src/names/displayNames.ts, scripts/check-names.mjs, wired into npm run build and CI. · Learned: check the built JS bundle too (not just source) to confirm each working name appears exactly once, sourced only from the naming file — one incidental "iPhone" match came from the PlayCanvas engine's own platform-detection code, not project sources, and is a false positive to expect. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-7 -->
