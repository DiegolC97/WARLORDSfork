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

## Campaign map is six blocs of four plus four contested regions, with an own-race holdout

What: The 28-region map is six blocs of four (one per race1…race6) plus four contested regions in the centre; the player starts with three regions of their race's bloc and the bloc's fourth region is a holdout defended by their own race, so a full conquest is exactly 25 battles · Why: six races cannot divide 28 evenly and the original's 25-battle progression and its unlock had to survive; the holdout keeps the 6×4 structure while leaving 25 defended regions · Where: src/campaign/regions.ts (REGIONS, BLOCS), src/campaign/rules.ts (initialOwners, applyVictory) · Learned: when a count must be preserved across a structural redesign, derive the structure from the count first and write the test (simulate the full conquest) before the data

## The unlockable race is race7, which owns no bloc and starts from a host bloc

What: Finishing a campaign sets raceUnlocked, which makes a seventh race id (race7, placeholder display name) selectable; race7 holds no territory, so a campaign played as it starts from race6's bloc (`startingBloc`) · Why: the user chose a seventh race over locking one of the six bloc races, so all six blocs stay owned by always-selectable races · Where: src/save/schema.ts (RACES, BLOC_RACES, UNLOCKABLE_RACE, selectableRaces), src/campaign/rules.ts · Learned: a race that is not on the map still needs a defined starting position; make it data, not a special case in the renderer

## The region under attack is carried in the save as battleRegion

What: The map writes `battleRegion` to the save when the player attacks and the battle screen reads it to field the defenders; it is cleared on victory, retreat and whenever the map is reopened · Why: screens may only talk through navigation events and the shared campaign access, so the save is the only channel from map to battle; a pending battle surviving a quit is dropped rather than resumed · Where: src/save/schema.ts (schema 3), src/screens/map/index.ts, src/screens/battle/index.ts

## Map colours are the Okabe–Ito palette, verified under three deficiency simulations

What: Bloc fills use Okabe–Ito colours (race1 blue, race2 orange, race3 sky blue, race4 green, race5 reddish purple, race6 yellow, race7 vermilion) with light grey hatching for contested; a test simulates protanopia, deuteranopia and tritanopia (Machado 2009 matrices) and requires pairwise ΔE2000 ≥ 10 · Why: the acceptance criterion requires the six bloc colours plus contested to remain distinguishable under colour-blindness simulation; the closest pair sits at 10.9 · Where: src/campaign/palette.ts, src/campaign/palette.test.ts · Learned: keep a non-colour cue too (hatch, outline, glyph) so the palette is not the only channel

## Unit ids are the rules document's unit indices 0–18

What: Unit ids in code and in the save's `ownedUnits` are the original game's unit indices (0 Spearman … 18 King's Guard), replacing the earlier placeholder scheme of 10+ for exclusives · Why: the save already stored numeric ids with 0–2 as the starting trio, the rules document indexes every table by these numbers, and no shipped save could hold a placeholder exclusive id, so no migration was needed · Where: src/roster/data.ts (UNIT_IDS), src/names/displayNames.ts (UNIT_NAMES) · Learned: when adopting a reference document's numbering, check whether any persisted data already uses a conflicting scheme before deciding on a migration

## Six exclusives, one per bloc race; race7 fields the generic pool only

What: race1→King's Guard, race2→Battle Axeman, race3→Whirler, race4→Giant Troll, race5→Flailer, race6→Javelin Thrower; Axe Thrower, Ranger and Spearmaster are generic (13 generics); the unlockable race7 has `exclusive: null` · Why: the work order fixed the mapping and moved three former exclusives to the generic pool so six races cover nineteen units; a race with no exclusive demonstrates that a new race needs only a data entry · Where: src/roster/data.ts (RACE_DEFINITIONS) · Learned: the per-race upgrade modifiers of the original races were not mapped onto the new races and remain open for the shop/upgrades slice

## Per-race unit names: prefix + base for generics, in-world name for the owner's exclusive

What: `unitDisplayName(unit, race)` returns `RACE_UNIT_PREFIX[race] + ' ' + UNIT_NAMES[unit]` for generic units and for another race's exclusive, and `EXCLUSIVE_UNIT_NAMES[race]` (Reiksguard, Slayer, Swordmaster, Stone Troll, Chosen, Skink Skirmisher) when the race fields its own exclusive · Why: the same mechanical unit must read thematically for each race with identical statistics, and all 19 × 6 names must be distinct per race; the fallback form for a foreign exclusive keeps the contested mixed host nameable without inventing 36 names · Where: src/roster/roster.ts (unitDisplayName), src/names/displayNames.ts · Learned: tests must build the expected string from the prefix table rather than spelling it, or check-names fails on the race word

## The roster check loads the TypeScript definition through Vite's ssrLoadModule

What: `scripts/check-roster.mjs` creates a Vite dev server in middleware mode, calls `ssrLoadModule('/src/roster/index.ts')`, reads the referenced atlases from public/ and runs `validateRoster`; `check:roster` sits between check:names and typecheck in `npm run build` and CI · Why: Node cannot import the extensionless TypeScript sources directly and a parallel JSON copy of the data would be a second source of truth; Vite is already a dependency and resolves the same modules the game ships · Where: scripts/check-roster.mjs, package.json · Learned: pass `optimizeDeps: { noDiscovery: true }` and `server.watch: null` so the script exits cleanly

## Battle lane keys wrap 8 → 1; the rules document clamps

**What:** A human lane key cycles the arrow 1…8 and wraps in both directions; the computer opponent still clamps as in §13.
**Why:** the battle-screen work order's acceptance criterion asks for wrap, overriding §3 of the rules document ("lane selection clamps at 1 and 8").
**Where:** `ReferenceBattle.command` in `src/battle/simulation.ts`.
**Learned:** 2026-10-15.

## The battle result reaches the result screen through the save (`lastBattle`, schema 4)

**What:** When a winner is decided the battle screen writes `lastBattle` (`winner`, `leftScore`, `rightScore`, `mode`) plus, in a campaign, the earned gold and kills and the region on a victory, then navigates `finished`; the result screen reads `lastBattle`. Migration 3 → 4 sets it to `null`.
**Why:** screens share state only through the save (the pattern `battleRegion` set); a transient channel in the shell would have been a second mechanism.
**Where:** `src/save/schema.ts`, `src/save/migrations.ts`, `src/screens/battle/index.ts`, `src/screens/result/index.ts`.
**Learned:** 2026-10-15.

## Team identity on the battlefield is an accent layer of shape and value, never the race colour

**What:** Every unit sprite carries the race tint for its body and a pennant above it: white and flying right for the left side, black and flying left for the right side (plus a matching base shadow). Same-race battles — the player's own holdout in a campaign — are told apart by the pennant alone.
**Why:** the work order requires legibility with the same race on both sides, and the project already keeps a non-colour cue everywhere (map hatching, outlines).
**Where:** `src/screens/battle/units.ts`, CSS `.battle .unit.left/.right .pennant` in `index.html`.
**Learned:** 2026-10-15.

## The battle screen is a DOM/SVG stage of 700 × 500 scaled by the saved zoom

**What:** The screen builds a `.stage` of the original's 700 × 500 pixels (backdrop SVG, HUD, field, racks, footer) and applies `transform: scale(zoom)`; field units map onto the field band through `fieldX` / `laneY` in `layout.ts`. The spawner rack lays 1–8 buttons out with `rackGrid` (at most four per row, equal widths, last row centred); portraits are the race atlas frame blended over the race tint with a two-letter initial while the atlas is the pixel placeholder.
**Why:** the menu and map are DOM already and the headless tests need a DOM; the engine root is still scaled so an engine-rendered field can be dropped in later.
**Where:** `src/screens/battle/layout.ts`, `backdrop.ts`, `hud.ts`, `rack.ts`, `input.ts`, `units.ts`, `index.ts`.
**Learned:** 2026-10-15.

## The battle simulation owns one seeded generator and freezes on the deciding tick

**What:** `BattleConfig.seed` (32-bit) seeds a mulberry32 in `src/battle/rng.ts`; every roll — spawn jitter, attack-or-walk, swipe pick, damage, drift, the AI's dice — draws from it, and the snapshot reports the seed. Once a winner is decided `tick()` is a no-op: the deciding tick's snapshot is the battle's final state. The document's post-decision retreat (§5.4) and the 240-frame result wait are presentation; the battle screen counts its own frames after the decision.
**Why:** the work order requires replay-identical snapshots from a seed plus scripted inputs, and requires that no tick be processed after the bar decides the battle. An injected `Math.random` cannot promise that; a frozen clock can.
**Where:** `src/battle/rng.ts`, `src/battle/simulation.ts` (`tick`), `src/screens/battle/index.ts` (`framesSinceDecision`), replay test in `src/battle/simulation.test.ts`.
**Learned:** 2026-10-16. Screen-level tests still seed through a `Math.random` spy (the screen draws the seed from it); any scenario that depends on how a battle unfolds should be made structurally robust (e.g. one attacker at a time) rather than seed-hunted.

## Each race starts one upgrade track at −1; levels are signed everywhere

**What:** `RaceDefinition.handicap` names the track (race1 spear, race2 speed, race3 armour, race4 archery, race5 sword, race6 halberd, race7 axe — seven races, seven tracks, never the race's own exclusive's track). `raceStartingUpgrades(race)` returns `{ [track]: −1 }`; `pickRacePatch` writes it into the save when a campaign race is picked, the battle screen gives two-player sides and the AI defender their race's handicap, and the save schema accepts negative levels. The formulas live in `src/battle/upgrades.ts` (`speedFactor`, `hitPointsAtSpawn`, `strikePower`, `driftRange`) and treat −1 like any level: speed ×0.9, −10 HP, −5 power, drift +1.
**Why:** the work order replaces the original's bonus+penalty pairs with one −1 handicap per race and insists −1 is a real level, not an unset sentinel. The shop's `base × (1 + |level|)` already makes climbing out cost double.
**Where:** `src/roster/data.ts`, `src/roster/roster.ts`, `src/roster/validate.ts` (distinct handicaps), `src/save/schema.ts`, `src/campaign/rules.ts`, `src/battle/upgrades.ts` + table test `src/battle/upgrades.test.ts`.
**Learned:** 2026-10-16. A test that seeds `upgradeLevels` must do so after the race pick, which overwrites them.

## Projectiles fly in field units with a rolled drift and an assumed hitbox

**What:** A projectile launches 66 units above its firer's feet (`PROJECTILE_LAUNCH_HEIGHT`), moves `speed × facing` horizontally and a drift of `(base − Archery) × (rand − rand)` vertically, rolled once at launch (`driftRange` in `upgrades.ts`; magic ignores Archery). Each tick it tests overlap with its firer's *current* target only — `UNIT_HITBOX` = half-width 40, height 140 from the feet — and is removed at `x < −50` or `x > 2850` (`FIELD.projectileMinX/MaxX`). `ProjectileState` reports `y` and `firer`.
**Why:** the rules document gives the launch height, the drift formula and the despawn bounds but no sprite size; the hitbox is an assumption sized so Archery 7 always connects and a drifted shot can sail over or fall short. Keep it in the seam constants, not the art.
**Where:** `src/battle/types.ts`, `src/battle/simulation.ts` (`tickProjectile`, `overlaps`), tests in `src/battle/combat.test.ts` ("projectiles").
**Learned:** 2026-10-16. The hitbox height is unverified against the original and should be revisited when real sprite proportions exist.

## The territory bar decides on the lead itself, on the tick a crossing makes it 25

**What:** `tickBar` compares `leftScore − rightScore` with `POINTS_TO_WIN` (25) every tick and decides the battle on the tick a crossing reaches it, snapping `barWidth` to 700 or 0; the 1 px/frame animation of `barWidth` remains for the renderer on every other tick. The timer still ends a battle at 7200 for the higher score and plays on at a tie (§5.3). Quirk 19 (win registered up to 14 frames late or lost if the score swung back) is fixed.
**Why:** the work order's acceptance criterion requires termination on the same tick the limit is reached, with no further ticks processed.
**Where:** `src/battle/simulation.ts` (`tickBar`), `src/battle/types.ts` (`POINTS_TO_WIN`), tests "a 25-point lead…" in `src/battle/simulation.test.ts`.
**Learned:** 2026-10-16. Any test that watches the bar move 1 px per frame must stop at the decision tick, where it snaps.
