# Battle for the Old World (working title)

A fan remake on the [PlayCanvas](https://playcanvas.com) engine. This
repository currently contains the playable skeleton: an app shell, the main
menu with its instructions, options and credits screens, the campaign map
with its 28 regions and conquest rules, placeholder shop/battle/result
screens, navigation between them, and the single-slot campaign save. No
battle gameplay yet.

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
| `npm run build` | Release build into `dist/` — runs the import-boundary check, the name check and typecheck first |
| `npm run preview` | Serve `dist/` locally |
| `npm test` | Run the test suite headless (Vitest + jsdom) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript only |
| `npm run check:deps` | Import-boundary check only (dependency-cruiser) |
| `npm run check:names` | Fails if a working name appears outside the naming file |

CI (`.github/workflows/ci.yml`) runs the boundary check, the name check,
typecheck, tests and build on every push and pull request.

## Engine

The engine is the published `playcanvas` npm package at an exact pinned
version (see `package.json` / `package-lock.json`). No engine source lives in
this repository. The upstream engine repository is a read-only reference.

## Layout

```
index.html              canvas + overlay root
src/main.ts             browser entry: creates the PlayCanvas host and boots the app
src/app.ts              composition root (save store → campaign → shell)
src/engine/             EngineHost seam: playcanvasHost (real) and nullHost (headless tests)
src/assets/loader.ts    manifest-driven asset loading (textures, atlases, json, audio, font)
src/names/              display names: game title, race names, unit names, region names, original-game credit
src/save/               the ONLY code that touches stored data (schema, migrations, saveStore)
src/campaign/           the campaign map as data (regions, blocs, adjacency, palette) and its pure rules
src/roster/             roster seam: which unit ids each race fields, and the contested mixed army
src/shell/routes.ts     navigation as data: screen id + event → next screen id
src/shell/screenShell.ts  holds exactly one active screen, runs transitions
src/screens/<id>/       one folder per screen; index.ts is its only public file
src/ui/placeholder.ts   throwaway DOM helpers for placeholder screens
public/assets/          static assets served at /assets/…
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
menu   --instructions--> instructions shop   --back-->      map
menu   --options-->      options      map    --battle-->    battle
menu   --credits-->      credits      battle --retreat-->   map
instructions/options/credits --back--> menu
battle --finished-->     result       result --continue-->  map
                                      result --menu-->      menu
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
it, fields the defending race's roster through `src/roster`, and on "Finish
battle" applies `applyVictory` — the region recolours to the player's race
and the arrows update when the map is shown again. When no attack is legal
(the map is fully conquered) the map says so and offers "New campaign", which
resets progress but keeps settings and the unlock. A `battleRegion` left
pending is dropped when the map is reopened.

Colours come from the Okabe–Ito palette (`src/campaign/palette.ts`);
`palette.test.ts` simulates protanopia, deuteranopia and tritanopia and
requires every pair of the six bloc colours and the contested colour to stay
apart. Contested regions are also hatched and the player's holdings outlined,
so colour is never the only cue.

To add a screen: add its id to `SCREEN_IDS`, add a row to `ROUTES`, create
`src/screens/<id>/index.ts` exporting a `ScreenDefinition`, and register it in
`src/screens/index.ts`. The route tests fail if a screen is unreachable from
the menu or cannot get back to it.

A screen declares its assets as a manifest on its definition. The shell loads
them before `enter()` and releases them on exit; `ctx.assets.get(id)` returns
the loaded resource. Put files under `public/assets/`.

## Display names

`src/names/displayNames.ts` is the only place a user-visible name is spelled:
the game title (as a two-line lockup), the six race names, the unit names, and
the original game's title and author for the credits screen. Code, data and
assets use internal identifiers instead:

- race ids are `race1`…`race7` in roster order (`RACES` in `src/save/schema.ts`;
  `race1`…`race6` hold territory, `race7` is unlocked by finishing a campaign);
- unit ids are the numbers the save's `ownedUnits` holds (0–2 the shared starting
  trio, 10+ each race's exclusive, see `src/roster`);
- region ids are `r01`…`r28` (`REGION_IDS` in `src/campaign/regions.ts`).

They are opaque on purpose so a display rename never touches them. Renaming
for release is one edit to the naming file. `npm run check:names` reads the
names from that file and fails the build if any of them appears in `src/`,
`public/` or `index.html` anywhere else. Use `raceName(id)` / `unitName(id)`
to render a name.

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
| `ownedUnits` | integer[] | `[0, 1, 2]` |
| `upgradeLevels` | `{ [upgradeId]: level }` | `{}` |
| `regionOwners` | `{ [regionId]: 'player' \| raceId \| null }` | `{}` — filled when a race is picked; `null` is an untaken contested region |
| `battleRegion` | region id or `null` (schema 3+) | `null` — the region under attack during a campaign battle |

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
3 — added `battleRegion` (migration sets it to `null`) and the `race7` id.
