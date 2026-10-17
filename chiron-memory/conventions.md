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

## Region names live in the naming file; the map data holds only ids

What: Campaign region names are in `REGION_NAMES` in src/names/displayNames.ts, keyed by opaque ids r01…r28, and rendered with `regionName(id)`; src/campaign/regions.ts holds structure and layout only · Why: the naming file is the single place every user-visible name is spelled, and names drafted for a setting may be revised at release without touching data or saves · Where: src/names/displayNames.ts, src/campaign/regions.ts, src/campaign/regions.test.ts (distinctness and published-setting denylist)

## Campaign rules are pure functions in src/campaign; screens only render and call them

What: Ownership, attackability, battle setup, victory and new-campaign logic are pure functions over the save in src/campaign/rules.ts; the map and battle screens call them and write the returned patch through ctx.campaign · Why: the 25-battle simulation and the adjacency rules can be tested without the DOM, and the battle slice can replace the placeholder screen without touching the rules · Where: src/campaign/rules.ts, src/screens/map/index.ts, src/screens/battle/index.ts

## Screens render per-race unit names and prices only through src/roster

What: Shop and battle placeholders call `unitDisplayName`, `shopPrice`, `killBounty`, `shopOffers`, `twoPlayerArmy` and `raceVisuals`; the shop buys by deducting `shopPrice` and appending to `ownedUnits`; `src/campaign/palette.ts` derives `RACE_COLOURS` from `raceVisuals(race).tint` · Why: the definition must be the only source of statistics, so a cost change moves shop price and bounty together and a palette change moves sprites and map together · Where: src/screens/shop/index.ts, src/screens/battle/index.ts, src/campaign/palette.ts, src/campaign/rules.ts (starterUnits)

## Every rules-document quirk (§16) has a recorded preserve-or-fix decision

**What:** `src/battle/quirks.ts` holds the 19 quirks as a typed table (`id`, `section`, `summary`, `decision`, `rationale`, `where`); `quirks.test.ts` checks the table is complete and that the data-backed decisions hold in the roster (which strikes scale, fixed walkers, the Archer's walk-off, the body fade, the 25-point lead). The simulation marks a preserved or fixed quirk with a `Quirk N preserved/fixed` comment at the rule. Current fixes: 1 (Spearman shield bash restored), 8 (gold saved on every outcome), 16 (unbounded ids), 19 (bar decides on the lead, same tick); 13 and 18 are not applicable to the redesigned map; the rest are preserved.
**Why:** the work order requires each quirk to be explicitly decided and the decision kept next to the rule it affects.
**Where:** `src/battle/quirks.ts`, `src/battle/quirks.test.ts`, comments in `src/battle/simulation.ts` and `src/roster/data.ts`.
**Learned:** 2026-10-16. When a later slice changes a decision, change the table entry and its comment together; the test will catch a data change that silently contradicts a preserved quirk.

## src/battle may not import rendering or engine code (dependency-cruiser `battle-simulation-is-headless`)

**What:** Nothing under `src/battle/` may import `src/screens`, `src/engine`, `src/ui`, `src/shell`, `src/assets`, `src/app.ts`, `src/main.ts` or the `playcanvas` package. `npm run check:deps` (first step of `npm run build` and CI) fails with the rule's name and both ends of the offending import.
**Why:** the work order makes the simulation the seam every other slice depends on: zoom and art must change underneath it without touching a rule, which an automated boundary guarantees better than review.
**Where:** `.dependency-cruiser.cjs`; verified on 2026-10-16 by injecting an engine, a screen and a PlayCanvas import into `src/battle/simulation.ts` — each was reported — and removing them.
**Learned:** test hooks that need the DOM (like `handle.ts`) may use DOM *types* but must not import screen modules.

## Unit portraits come from one helper in src/ui/portrait.ts, used by both racks

**What:** `buildPortrait(unit, frame, tint, { atlas, atlasImage }, name)` draws a unit's race-atlas frame over the race tint with a two-letter glyph; `atlasAssetId(url)` names the manifest entry and `atlasFromAssets(ctx.assets, url)` reads the parsed atlas back (null headless). The battle rack (`src/screens/battle/rack.ts`) and the shop rack (`src/screens/shop/index.ts`) both import it; screens may not import each other, so shared presentation lives under `src/ui/`.
**Why:** the shop needed the battle rack's portraits, and a cross-screen import is forbidden by dependency-cruiser.
**Where:** `src/ui/portrait.ts`; each screen declares `referencedAtlases().map(url => ({ id: atlasAssetId(url), type: 'json', url }))` as its manifest.
**Learned:** 2026-10-16. `FrameState.sides[side]` now also carries `upgrades` and `statBonus`, so a test can assert the power a side's strikes resolve at (`attackPowers`) from the simulation it actually runs.

## Screen tests that need real atlases boot a file-backed asset host

What: `NullEngineHost` resolves no assets, so a screen sees `NO_ATLAS` and draws placeholders. `src/screens/battle/sprites.test.ts` subclasses it (`FileAssetHost`) with a backend that parses `public/<url>` for json specs, which makes the battle screen draw the shipped atlases under jsdom and lets tests compare `data-frame` with `resolveFrame` on the simulation's snapshot. · Why: the art acceptance criteria (replay through each atlas, same-race accents, baselines, portraits) are only meaningful against the real atlas documents. · Where: src/screens/battle/sprites.test.ts · Learned: to face a chosen defending race from the map, give the player every region but that race's holdout.

## The unit art recipe is the only instruction a new race variant needs

What: `docs/art/unit-art-recipe.md` is written to be followed alone: a fresh agent given only the recipe produced a race7 Spearman variant that passed `check:roster` and the suite on the first build, and its nine points of friction (what the builder prints, the per-race build form, the list of rig knobs, the `raceAtlas` helper, which palette roles render, that stance offsets cannot move the strike) were folded back into the recipe. The builder now refuses a race whose reach does not peak on the roster's strike frame. · Why: an acceptance criterion requires a second artist to produce a variant from the recipe without further instruction; the recipe is the contract with the production line for the remaining eighteen units. · Where: docs/art/unit-art-recipe.md, scripts/build-unit-atlases.mjs (`reach` check), art/units/spearman/index.mjs · Learned: when the recipe changes, re-run a fresh-agent dry run rather than reviewing it by eye.
