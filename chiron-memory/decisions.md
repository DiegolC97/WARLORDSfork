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
