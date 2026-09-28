# decision

A choice made and the reasoning behind it — the path taken over the alternatives.

## Navigation is a route table, never screen-to-screen calls

**What:** Screens emit events (`ctx.navigate('back')`) and `src/shell/routes.ts` maps `(screen id, event) → next screen id`. Screens hold no reference to other screens or to the shell.
**Why:** Several slices (shop, map, menu) would otherwise each invent their own way of moving between screens and disagree. A table is testable for reachability and dead routes without the engine.
**Where:** `src/shell/routes.ts`, `src/shell/screenShell.ts`, enforced by `.dependency-cruiser.cjs` rule `no-cross-screen-imports`.
**Learned:** 2026-09-25, playable-skeleton work order.

## Single save module with an injectable migration chain; schema stays at v1

**What:** `src/save/saveStore.ts` is the only code that reads or writes stored data. Damaged saves (truncated, invalid, newer version) are copied to `campaign.save.backup` and the game starts on defaults. The migration chain is a parameter of `SaveStore`. Schema history: 1 initial, 2 added `zoom` (first real production migration).
**Why:** Three slices assumed a save system; one owner avoids competing formats. Backup-then-default means a bad build never silently destroys progress. Keeping the chain injectable lets tests prove a v1 save survives a future schema change without inventing a fake production migration.
**Where:** `src/save/schema.ts`, `src/save/migrations.ts`, `src/save/saveStore.ts`, tests in `src/save/saveStore.test.ts`.
**Learned:** 2026-09-25.

## Starting race is unset, not random

**What:** `chosenRace` defaults to `null`; the player picks one of `RACES` on the campaign map before the first battle and the pick is written to the save immediately.
**Why:** The rules document says "a random race", but the work order chose an explicit pick for the six-race roster.
**Where:** `RACES` in `src/save/schema.ts`; pick UI in `src/screens/map/index.ts`.
**Learned:** 2026-09-25.

## Display names live in one file; internal ids are opaque (race1…race6, numeric unit ids)

**What:** Every user-visible name — game title as a two-line lockup, the six race names, unit names, the original game's credit — is in `src/names/displayNames.ts` and nowhere else. Race ids are `race1`…`race6` in roster order; unit ids are numbers. Working title: "Battle for the Old World".
**Why:** The working title and race names collide with a live, enforced commercial setting. Shipping names are decided later and applied as ONE edit to that file. Opaque ids guarantee the rename touches no code, data, asset or save. Descriptive ids (e.g. `dwarfs`) were rejected because they would be hits in the very search the acceptance criteria run.
**Where:** `src/names/displayNames.ts`; `scripts/check-names.mjs` (run by `npm run build` and CI) reads the names from that file and fails on any other occurrence in `src/`, `public/`, `index.html`. Render with `raceName(id)` / `unitName(id)`.
**Learned:** 2026-09-25, main-menu work order.

## Title lockup is text, banner is a file-swap slot

**What:** The menu lockup is HTML text in a decorative font stack (`.gothic` in `index.html`), not art. The starter-trio banner is an `<img>` at the fixed path `public/assets/ui/banner-trio.svg`, currently a silhouette placeholder.
**Why:** A title change must not require new art. Race art had not been delivered when the menu was built; a fixed path lets the art slice replace the file with no code change.
**Where:** `src/screens/menu/index.ts`, `src/screens/menu/banner.ts`.
**Learned:** 2026-09-25.

## Screen navigation is defined as a data-driven transition table (screen id + event → next…

What: Screen navigation is defined as a data-driven transition table (screen id + event → next screen id) in src/shell/routes.ts, rather than screens calling each other directly. · Why: the work order required that no screen hold a reference to another screen's internals, so multiple future slices (shop, map, menu) can't couple to each other's code. · Where: src/shell/routes.ts, src/shell/screenShell.ts. · Learned: screens implement { assets, enter(ctx), exit() } and only ever call ctx.navigate(event); the transition table is the single source of truth for reachability. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-1 -->

## The main menu title ("Battle for the Old World") is rendered as text using a decorative f…

What: The main menu title ("Battle for the Old World") is rendered as text using a decorative font stack rather than as an image asset. · Why: so a future working-title change needs no new art, only an edit to the naming file. · Where: src/screens/menu, src/names/displayNames.ts. · Learned: keeping title lockups as styled text (not baked-in images) avoids coupling the art pipeline to the naming/de-branding requirement. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-14 -->

## The race-trio banner on the menu's white band is a single fixed asset file path (currentl…

What: The race-trio banner on the menu's white band is a single fixed asset file path (currently a placeholder silhouette) that a future art slice can replace file-for-file, rather than being generated or composed from per-race art. · Why: no race art has been delivered to the repository yet, so the banner needed a well-defined swap point instead of code changes to unblock the menu screen now. · Where: src/screens/menu (banner asset slot). · Learned: flag this kind of missing-asset dependency explicitly in the plan rather than inventing final art. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-15 -->

## The shop screen is reached via the campaign map rather than being a top-level main menu e…

What: The shop screen is reached via the campaign map rather than being a top-level main menu entry. · Why: matches the original Warlords: Call to Arms menu structure, where the shop is not a direct menu item. · Where: src/shell/routes.ts, src/screens/shop, src/screens/map. · Learned: check the reference layout for which screens are top-level vs. nested before wiring routes for a new menu-driven screen. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-16 -->

## Save schema v2 added a "zoom" display setting (one of three levels) via a real production…

What: Save schema v2 added a "zoom" display setting (one of three levels) via a real production migration from v1, and the battle placeholder screen applies the saved zoom by scaling its scene root at enter time. · Why: the options screen needed a place to persist zoom, and the battle slice needs to inherit the setting once real battle content exists. · Where: src/save/schema.ts, src/save/migrations.ts, src/screens/battle. · Learned: this was the first real (non-synthetic) migration exercised in production code, proving out the migration chain built in the first slice. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-17 -->

## The single-slot campaign save is only ever read/written through one SaveStore module, whi…

What: The single-slot campaign save is only ever read/written through one SaveStore module, which on absent/unreadable/invalid/newer-version data copies the raw save to a backup key and falls back to documented defaults, and applies an injectable pure migration chain before validation. · Why: three other slices (shop, map, options) independently need persistence and must agree on one format; the rules doc (section 15) requires the game to start rather than fail on any bad save. · Where: src/save/schema.ts, src/save/migrations.ts, src/save/saveStore.ts. · Learned: the schema validator must take the target schema version as a parameter rather than hardcoding a constant, otherwise a store validating its own migrated output against a stale constant is wrongly rejected as invalid. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-2 -->

## The starting race is left unset (null) in save defaults rather than randomly chosen, with…

What: The starting race is left unset (null) in save defaults rather than randomly chosen, with the player picking one of the six races before the first battle; the choice is written to the save at that moment. · Why: work order explicitly overrides the rules document's stated "random race" default to require player choice, adapted to the six-race roster. · Where: src/save/schema.ts (defaults), campaign map placeholder screen (race picker). · Learned: when a work order explicitly contradicts a quoted rules-document default, the work order's explicit requirement wins. <!-- id: 6e92c05f-ca91-4e6f-99a7-e2d88a4637d7-3 -->
