# Battle for the Old World (working title)

A fan remake on the [PlayCanvas](https://playcanvas.com) engine. This
repository currently contains the playable skeleton: an app shell, the main
menu with its instructions, options and credits screens, the campaign map
with its 28 regions and conquest rules, the battle screen over a reference
battle simulation, the shop with its upgrade panel and army rack, a
placeholder result screen, navigation between
them, and the single-slot campaign save.

The working title and the working race names collide with a live commercial
setting. They live in exactly one file, `src/names/displayNames.ts`, and the
shipping names will be applied there as a single edit before release (see
[Display names](#display-names)).

## Commands

Requires Node 20 or newer (CI uses Node 22).

| Command | What it does |
| --- | --- |
| `npm ci` | Install dependencies from the lockfile |
| `npm run dev` | Start the dev server (prints a local URL, usually http://localhost:5173) |
| `npm run build` | Release build into `dist/` — runs the import-boundary check, the name check, the roster check and typecheck first |
| `npm run preview` | Serve `dist/` locally |
| `npm test` | Run the test suite headless (Vitest + jsdom) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript only |
| `npm run check:deps` | Import-boundary check only (dependency-cruiser) |
| `npm run check:names` | Fails if a working name appears outside the naming file |
| `npm run check:roster` | Fails if the roster definition is inconsistent (see [Roster](#roster)) |
| `npm run build:atlases` | Regenerates every race's unit atlas and the review sheets from `art/` (see [Unit art](#unit-art)) |

CI (`.github/workflows/ci.yml`) runs the boundary check, the name check, the
roster check, typecheck, tests and build on every push and pull request.

## Engine

The engine is the published `playcanvas` npm package at an exact pinned
version (see `package.json` / `package-lock.json`). No engine source lives in
this repository. The upstream engine repository is a read-only reference.

## Layout

```
index.html              canvas + overlay root
src/main.ts             browser entry: creates the PlayCanvas host and boots the app
src/app.ts              composition root (save store → campaign → shell)
src/engine/             EngineHost seam: playcanvasHost (real) and nullHost (headless tests); onFrame is the frame clock
src/assets/loader.ts    manifest-driven asset loading (textures, atlases, json, audio, font)
src/names/              display names: game title, race names, unit base names and per-race prefixes, region names, credit
src/save/               the ONLY code that touches stored data (schema, migrations, saveStore)
src/campaign/           the campaign map as data (regions, blocs, adjacency, palette) and its pure rules
src/roster/             THE roster definition (data.ts: 19 units, races, palettes, atlases), its resolvers and validator
src/battle/             the battle seam: FrameState snapshot + SpawnerCommand (types.ts) and the reference simulation
src/shell/routes.ts     navigation as data: screen id + event → next screen id
src/shell/screenShell.ts  holds exactly one active screen, runs transitions
src/screens/<id>/       one folder per screen; index.ts is its only public file
src/ui/placeholder.ts   throwaway DOM helpers for placeholder screens
src/ui/portrait.ts      a unit's portrait (the atlas's portrait crop, or the legacy frame over the race tint); shared by the battle and shop racks
src/roster/atlas.ts     the unit atlas contract: frame keys, clip lengths from the roster, clip → frame resolution
art/                    unit art sources: the rasteriser (lib/), the Spearman rig and clips, one variant file per race
scripts/build-unit-atlases.mjs  renders art/ into public/assets/units/<race>.{png,json} and docs/art/ review sheets
docs/art/               the unit art recipe and the generated review sheets
public/assets/          static assets served at /assets/… (units/<race>.* are the race atlases; units/placeholder-units.* the stand-in)
```

## Screens and navigation

Screens are `boot`, `menu`, `instructions`, `options`, `credits`, `shop`,
`map`, `battle`, `result`. A screen never references another screen. It calls
`ctx.navigate('<event>')` and the route table in `src/shell/routes.ts` decides
where that leads:

```
boot   --ready-->        menu
menu   --campaign-->     map          map    --back-->      menu
menu   --twoPlayer-->    battle       map    --shop-->      shop
menu   --instructions--> instructions shop   --continue-->  map
menu   --options-->      options      shop   --menu-->      menu
menu   --credits-->      credits      shop   --guide-->     instructions
instructions/options/credits --back--> menu  map    --battle-->    battle
                                      battle --retreat-->   map
battle --finished-->     result       result --continue-->  map
battle --menu-->         menu         result --menu-->      menu
battle --options-->      options
```

### Main menu

Layout follows the original's: a white band with the title lockup (small
leading line over a large primary line in a decorative face), the starter-trio
banner on the band's right, the entry list below, a version label top-right
(from `package.json`). The lockup is text, so a title change needs no art.

The banner image lives at `public/assets/ui/banner-trio.svg`. It is currently
a placeholder of three silhouettes; the race-art slice replaces that file at
the same path with the real trio, with no code change.

Options carries sound, music and the rendering zoom. The battle screen scales
its scene root by the saved zoom, so anything the battle slice parents under
`ctx.root` inherits it.

### Campaign map

`src/campaign/regions.ts` defines the map as data: 28 regions on a hex
layout, six blocs of four (one per race `race1`…`race6`) plus four contested
regions in the centre that belong to no race, and an explicit adjacency list.
Tests check the counts, that adjacency is symmetric and matches the hex
geometry, that the map is connected, and that every bloc borders the centre.

A campaign starts when the player picks a race: three regions of that race's
bloc are theirs, the bloc's fourth region (the one facing the centre) is a
holdout defended by the same race, and every other region is defended by its
bloc's race. Contested regions are defended by a mixed host drawn from every
bloc race's roster with a stat multiplier (`CONTESTED_STAT_BONUS`), making
them the hardest battles. Conquering all 25 remaining regions is exactly 25
battles; the last one sets `raceUnlocked`, which makes `race7` selectable in
later campaigns. `race7` owns no bloc, so it starts from a host bloc
(`startingBloc`).

The map draws an arrow from the player's territory to every region adjacent
to a holding (`attackableRegions`); clicking one (or its "Attack …" button)
writes `battleRegion` to the save and goes to battle. The battle screen reads
it, fields the defending race's army through `src/roster` (`rosterFor`), and on "Finish
battle" applies `applyVictory` — the region recolours to the player's race
and the arrows update when the map is shown again. When no attack is legal
(the map is fully conquered) the map says so and offers "New campaign", which
resets progress but keeps settings and the unlock. A `battleRegion` left
pending is dropped when the map is reopened.

Colours are the races' roster palette tints (Okabe–Ito, defined in
`src/roster/data.ts` and read by `src/campaign/palette.ts`);
`palette.test.ts` simulates protanopia, deuteranopia and tritanopia and
requires every pair of the six bloc colours and the contested colour to stay
apart. Contested regions are also hatched and the player's holdings outlined,
so colour is never the only cue.

### Battle

`src/battle/` is the seam between the game's rules and the battle screen:
a headless, deterministic simulation in field units and ticks (24 per
second) that never imports rendering or engine code — dependency-cruiser's
`battle-simulation-is-headless` rule fails the build if it ever does.

`types.ts` defines the **frame snapshot** (`FrameState`: seed, tick, frames
left, scores, the territory bar's target and drawn width, the winner, each
side's spawner — lane, selected unit, recharge progress, charge kills, kills
and gold — every unit with its race, lane, x, facing, hit points, the clip
it plays (`walk`, `swipe-N`, `death`) and the frame of it, its opacity while
its body fades, every projectile with its height, and the blows that landed
this tick) and the **spawner commands** (`lane-up`, `lane-down`,
`previous-unit`, `next-unit`, `release`, `charge`).

`simulation.ts` (`createBattle`) implements the rules document's battle
frame: spawner and recharge (§4), scoring, the territory bar and the
five-minute timer with sudden death at a tie (§5), the unit state machine
with strike-frame damage rolls of 0…power−1, knockback of min(power, 50),
bodies that lie 500 frames then fade 1 % per frame (§7), projectiles that
drift, hit only the firer's current target and leave the field at −50 / 2850
(§8), the seven upgrade tracks as formulas over signed levels (§9,
`upgrades.ts`) and the computer opponent (§13). Every statistic comes from
`src/roster`; every roll comes from one seeded generator (`rng.ts`), so a
seed plus the same commands on the same ticks replays a battle exactly. Once
a winner is decided — the lead reaching 25, the clock, or surrender — the
battle is over: `tick()` does nothing more. `quirks.ts` catalogues the
document's nineteen engine quirks with the decision to preserve or fix each
(the Spearman's shield bash is restored as a fourth swipe; the bar decides
on the lead itself, on the same tick). Each race starts one upgrade track
at −1 (`RaceDefinition.handicap`); the shop climbs out of it at double cost.

The battle screen (`src/screens/battle/`) renders snapshots and sends
commands back; it holds no rule. It is a DOM/SVG stage of the original's
700 × 500 pixels scaled by the saved zoom (`layout.ts` maps field units onto
the field band):

- the **territory bar** draws the width the simulation reports (centre
  plus 14 px per point of lead; full or empty is an instant win) with both
  scores;
- the **dial** is a clock face whose wedge shrinks over the five minutes,
  showing the seconds only in the last minute;
- a **charge meter** per side fills across twenty kills; once armed, the
  Charge control (or Q / 0) releases the selected unit into all eight lanes;
- the **spawner rack** per side lays one to eight buttons out with
  `rackGrid` (at most four per row, equal widths from the side's width,
  last row centred); each shows the unit's portrait (the atlas's portrait
  crop over the race tint, or the legacy frame with a two-letter initial for
  a unit without art), its per-race name and its recharge state;
- **units** are DOM sprites drawn from the race atlas: the frame the
  simulation's clip and frame resolve to (`resolveFrame`), its feet pivot on
  the lane baseline, mirrored when facing left, with the atlas's untinted
  pennant frame as a mask filled with the side's value — white for the left
  side, black for the right — so two armies of the same race stay telling
  apart. A unit whose atlas has no sprite set yet is a block in the race
  tint with a CSS pennant;
- the **footer** carries the level indicator (campaign level, or "2 Player"),
  Main menu, Surrender (hands the battle to the right side), Options and
  Retreat.

Controls (`input.ts`, rules §3): the left player uses W/S for the lane, A/D
for the unit, Space to release and Q to charge; the right player uses the
arrows (Right = previous, Left = next, mirrored as in the original), Enter
and 0. In a campaign the left player may also use the arrow set and the
computer drives the right spawner. Lane keys cycle 1–8 and wrap (the work
order's choice; the original clamps). Lane and unit keys act once per press;
release and charge keys are held state sampled every frame, so holding a
spawn key yields exactly one unit per recharge period. Both sides' keys are
handled independently, so simultaneous presses are never dropped.

In a campaign the save's `battleRegion` names the region under attack; the
defenders come from the campaign rules. With no `battleRegion` (the
two-player entry) both spawners are human and each side receives the
roster's two-player army. When a winner is decided no more units spawn, the
result panel appears (auto-continues after 240 rendered frames or on
Continue) and the outcome is written to the save: `lastBattle`
for the result screen, plus in a campaign the gold and kills earned and,
on a victory, the region (`applyVictory`).

The frame clock is `ctx.onFrame` (from `EngineHost.onFrame`): the screen
accumulates elapsed seconds and steps the simulation at a fixed 24 fps.
Headless tests drive it with `NullEngineHost.tick(frames)` and reach the
simulation through `battleHandle(overlay)` from `src/battle`.

To add a screen: add its id to `SCREEN_IDS`, add a row to `ROUTES`, create
`src/screens/<id>/index.ts` exporting a `ScreenDefinition`, and register it in
`src/screens/index.ts`. The route tests fail if a screen is unreachable from
the menu or cannot get back to it.

A screen declares its assets as a manifest on its definition. The shell loads
them before `enter()` and releases them on exit; `ctx.assets.get(id)` returns
the loaded resource. Put files under `public/assets/`.

### Shop

The shop (`src/screens/shop/`, rules §9 and §11) is reached from the map and
is where gold is spent between battles. It holds no rule: every number is
read from the roster or the save, and every purchase is one
`ctx.campaign.update`, persisted at once, so quitting after buying cannot
duplicate gold.

- The header shows the save's gold and lifetime kills, which the battle
  screen adds to when a campaign battle ends.
- The **upgrade panel** lists the seven tracks in the document's order
  (`UPGRADE_TRACK_IDS`): the shop text (`UPGRADE_TRACKS[track].label`), the
  per-level effect, the current level and the next cost
  (`upgradeCost` = base × (1 + |level|), no cap). A row whose cost exceeds
  the gold is greyed and its Buy disabled; affordability is recomputed after
  every purchase, so buying one track greys the others the moment they fall
  out of reach, and a row is buyable again as soon as gold suffices. A
  race's handicap track starts at −1 and costs double to climb out of.
- The **army rack** has `ARMY_SLOTS` (eight) slots: the owned units in the
  order bought, each with its portrait and per-race name, then the Buy unit
  slot, then empty slots. With eight units owned the buy slot disappears
  and the rack states that the army is full.
- **Buy unit** opens the offer list: every unit the player's race may field
  and does not own yet, in id order (`shopOffers`; the document's cap of
  eight entries is not applied, since with thirteen generic units it would
  hide the race's exclusive), each with its price (`shopPrice`), stats,
  bounty and a Buy that is disabled with a stated reason when unaffordable.
  A player who can afford nothing is told the cheapest price and can still
  continue.
- The footer offers Main menu, Strategy guide (the instructions screen) and
  Continue (the map); none is ever disabled.

## Roster

`src/roster/data.ts` is the single definition of the six races and the
nineteen units; every screen reads it through `src/roster` and no other file
may carry a unit statistic. The numbers are the rules document's (§6.1 unit
table, §7.2 walk cycles, §8.2 melee attacks, §8.4 projectiles, §9 upgrade
tracks); unit ids are the document's indices 0–18, which is also what the
save's `ownedUnits` holds.

Each unit carries speed, hit points, recharge, range, cost, the shop's
displayed max damage, its walk cycle, its upgrade track (`spear`, `sword`,
`halberd`, `axe`, `archery` or none) and its attack set: per swipe the clip
length, strike frames, reach, power per strike, whether the strikes scale
with the track, and how the unit moves during the swipe; projectile swipes
carry the projectile kind, speed and drift instead.

Each race (`RACE_DEFINITIONS`) carries its exclusive unit or `null`, a
palette id (resolved through `PALETTES` to the tint used for sprites and the
map) and the atlas it draws its units from. Availability is pure data: a
unit is **exclusive** to the race whose entry names it and **generic**
otherwise. Thirteen units are generic (Axe Thrower, Ranger and Spearmaster
among them) and six are exclusive, one per bloc race:

| Race | Exclusive unit |
| --- | --- |
| `race1` | King's Guard (18) |
| `race2` | Battle Axeman (9) |
| `race3` | Whirler (10) |
| `race4` | Giant Troll (16) |
| `race5` | Flailer (17) |
| `race6` | Javelin Thrower (13) |
| `race7` | none — the generic pool only |

Resolvers (`src/roster/roster.ts`), all taking an optional definition so
tests can run them over a modified copy:

- `unitStats(unit)` — the statistics, identical whichever race fields the unit;
- `availableUnits(race)`, `isAvailable(unit, race)`, `exclusiveOf(unit)`, `genericUnits()`;
- `starterUnits()` — the trio a new campaign army starts with (save defaults use it);
- `rosterFor(race)` / `mixedRoster()` — a region's defenders and the contested host;
- `twoPlayerArmy(race, rng)` — the two-player rule: trio plus two distinct random generics;
- `unitDisplayName(unit, race)` — the per-race name (see below);
- `shopPrice(unit)`, `killBounty(unit)` (= `ceil(cost / 50)`), `shopOffers(owned, race)`, `ARMY_SLOTS` / `hasArmySlot(owned)`;
- `upgradeCost(track, level)`, `upgradePanel(levels)` (the seven tracks in shop order with level and next cost), `UPGRADE_TRACK_IDS`;
- `raceVisuals(race)` — tint, atlas url and the frame for each unit, for the renderer.

Per-race names keep the statistics identical while reading thematically: a
generic unit is the race's prefix (`RACE_UNIT_PREFIX` in the naming file) on
the shared base name, and a race's exclusive carries its own in-world name
(`EXCLUSIVE_UNIT_NAMES`). All 19 × 6 combinations are distinct and tested.

`npm run check:roster` (part of `npm run build` and CI) loads the
definition through Vite and fails, naming the culprit, when an exclusive is
owned by two races, a unit has no base name or a race no prefix or exclusive
name, two units share a name within a race, a strike frame is at or beyond
its clip length, a palette is unknown, or an atlas under `public/` is
missing or lacks a frame for a unit the race fields.

To add a race: append its id in `src/roster/races.ts`, add its entry to
`RACE_DEFINITIONS` (exclusive or `null`, palette, atlas), and name it in
`src/names/displayNames.ts` (`RACE_NAMES`, `RACE_UNIT_PREFIX`,
`EXCLUSIVE_UNIT_NAMES`). A race with `exclusive: null` fields the full
generic pool with no other change. To change a unit's cost, edit the one
number in `data.ts`: the shop price and the kill bounty follow.

Each bloc race points at its own atlas, `public/assets/units/<race>.json`;
`race7` has no art yet and keeps `placeholder-units.json`, a 19-frame
stand-in.

## Unit art

Unit art is generated, not painted: `npm run build:atlases` renders the
sources under `art/` into one atlas per race and the review sheets under
`docs/art/`. The full production recipe — layer structure, the rig and its
pose set, the palette roles, the frame layout, export settings, how to
derive a race variant and how to add a unit — is
[`docs/art/unit-art-recipe.md`](docs/art/unit-art-recipe.md).

The Spearman is authored for all six bloc races from one shared rig
(`art/units/spearman/`): the same poses and timings everywhere, race
identity carried by a palette and a silhouette modifier in
`art/units/races/<race>.mjs` (plume and slashed sleeves; a squat bearded
frame; a tall narrow stance with the spear held high; a hunch with
oversized fists; horned upper bulk; a tail on digitigrade legs). The other
eighteen units still draw as the tinted placeholder block and keep a
one-pixel legacy frame in every atlas.

`src/roster/atlas.ts` is the **atlas contract** the build check and the
renderer share: frames keyed `<sprite>/<clip>/<n>` (`ready` 2 frames, `walk`
the roster's walk cycle, `swipe-i` the i-th attack's clip with its strike
frame inside, `death` 8), an untinted accent frame
`<sprite>/accent/<clip>/<n>` per body frame, a `<sprite>/portrait` crop,
rects in top-left texture pixels with the feet as pivot, authored at 4×
(`meta.scale`). `npm run check:roster` fails on any sprite set that breaks
it. A swipe beyond the first may be omitted (the Spearman's restored shield
bash, `swipe-4`, is): the renderer then plays the first swipe time-warped so
the strike frames coincide, and the check prints a note.

## Display names

`src/names/displayNames.ts` is the only place a user-visible name is spelled:
the game title (as a two-line lockup), the race names, each race's unit-name
prefix, the unit base names, the in-world name of each race's exclusive, the
region names, and the original game's title and author for the credits screen. Code, data and
assets use internal identifiers instead:

- race ids are `race1`…`race7` in roster order (`RACES` in `src/roster/races.ts`,
  re-exported by `src/save`; `race1`…`race6` hold territory, `race7` is unlocked by
  finishing a campaign);
- unit ids are the rules document's unit indices 0–18, the numbers the save's
  `ownedUnits` holds (0–2 the starting trio; see [Roster](#roster));
- region ids are `r01`…`r28` (`REGION_IDS` in `src/campaign/regions.ts`).

They are opaque on purpose so a display rename never touches them. Renaming
for release is one edit to the naming file. `npm run check:names` reads the
names from that file and fails the build if any of them appears in `src/`,
`public/` or `index.html` anywhere else. Use `raceName(id)` / `unitName(id)`
to render a name, and `unitDisplayName(unit, race)` from `src/roster` for the
per-race form.

### Import boundaries (enforced in the build)

`npm run check:deps` fails the build, naming both modules, when:

- a file in `src/screens/A/` imports anything from `src/screens/B/`;
- a file outside a screen folder imports anything from a screen other than its `index.ts`;
- a file outside `src/save/` imports the save internals (`schema`, `migrations`, `saveStore`) directly — use `src/save/index.ts`.

## Campaign save

One slot in `localStorage` under the key `campaign.save`, holding every field
from the rules document (section 15) plus the rendering zoom:

| Field | Type | Default when no save exists |
| --- | --- | --- |
| `schemaVersion` | number | current version (`SAVE_SCHEMA_VERSION`) |
| `quality` | `low` / `medium` / `high` | `medium` |
| `zoom` | `0.75` / `1` / `1.25` (schema 2+) | `1` |
| `campaignLevel` | integer | `1` |
| `raceUnlocked` | boolean | `false` |
| `soundOn` | boolean | `true` |
| `musicOn` | boolean | `true` |
| `autoSendOn` | boolean | `false` |
| `gold` | integer | `500` |
| `lifetimeKills` | integer | `0` |
| `chosenRace` | `race1`…`race7`, or `null` | `null` — the player picks before the first battle |
| `ownedUnits` | integer[] | the roster's starting trio, `[0, 1, 2]` |
| `upgradeLevels` | `{ [upgradeId]: level }` | `{}` |
| `regionOwners` | `{ [regionId]: 'player' \| raceId \| null }` | `{}` — filled when a race is picked; `null` is an untaken contested region |
| `battleRegion` | region id or `null` (schema 3+) | `null` — the region under attack during a campaign battle |
| `lastBattle` | `{ winner, leftScore, rightScore, mode }` or `null` (schema 4+) | `null` — how the last battle ended, for the result screen |

Screens read and write the campaign through `ctx.campaign` (`read()` /
`update(patch)`); every update is persisted immediately. Only
`src/save/saveStore.ts` touches storage.

### Load outcomes

The game always starts. `SaveStore.load()` reports what happened:

| Outcome | Condition | Result |
| --- | --- | --- |
| `absent` | no save | defaults |
| `loaded` | valid save at the current version | the save |
| `migrated` | older schema version | migrated through the chain, written back |
| `unreadable` | not valid JSON (e.g. truncated) | defaults; original copied to `campaign.save.backup` |
| `invalid` | JSON but fails validation, or no migration path | defaults; original copied to backup |
| `newer-version` | written by a later build | defaults; original copied to backup |

### Changing the save's shape

1. Edit `CampaignSave` and bump `SAVE_SCHEMA_VERSION` in `src/save/schema.ts`.
2. Append a migration (`from: old, to: old + 1`) to `MIGRATIONS` in
   `src/save/migrations.ts`. Migrations run over the raw JSON before
   validation, so older saves keep working.
3. Update the validator for the new fields.

Schema history: 1 — initial; 2 — added `zoom` (migration sets it to `1`);
3 — added `battleRegion` (migration sets it to `null`) and the `race7` id;
4 — added `lastBattle` (migration sets it to `null`).
