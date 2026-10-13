import { describe, expect, it } from 'vitest';
import { REGION_NAMES } from '../names';
import { BLOC_RACES } from '../save';
import {
  BLOCS,
  CONTESTED,
  CONTESTED_REGIONS,
  REGIONS,
  REGION_IDS,
  hexNeighbours,
  region,
} from './regions';

/**
 * Names from published settings (and the original game's map) that a
 * region must not reproduce. Compared case-insensitively as whole names and
 * as substrings, so "Old Reikland" would fail as surely as "Reikland".
 */
const PUBLISHED_SETTING_NAMES = [
  // The commercial setting the working race names come from
  'Reikland', 'Averland', 'Middenland', 'Nordland', 'Ostland', 'Ostermark', 'Stirland', 'Talabecland',
  'Wissenland', 'Hochland', 'Altdorf', 'Nuln', 'Marienburg', 'Kislev', 'Bretonnia', 'Lustria', 'Ulthuan',
  'Naggaroth', 'Norsca', 'Athel Loren', 'Badlands', 'Mootland', 'Sylvania', 'Drakwald', 'Reik',
  'Grey Mountains', 'Worlds Edge', "World's Edge", 'Black Mountains', 'Troll Country', 'Chaos Wastes',
  'Dark Lands', 'Border Princes', 'Tilea', 'Estalia', 'Araby', 'Nehekhara', 'Khemri', 'Cathay', 'Albion',
  'Laurelorn', 'Karaz', 'Karak', 'Barak Varr', 'Zhufbar', 'Eight Peaks', 'Eataine', 'Caledor', 'Saphery',
  'Chrace', 'Cothique', 'Tiranoc', 'Yvresse', 'Avelorn', 'Nagarythe', 'Ellyrion', 'Lothern', 'Hexoatl',
  'Itza', 'Tlaxtlan', 'Zlatlan', 'Black Crag', 'Gunbad', 'Iron Rock', 'Red Eye', 'Mordheim', 'Skavenblight',
  'Couronne', 'Bordeleaux', 'Carcassonne', 'Lyonesse', 'Quenelles', 'Parravon', 'Mousillon', 'Gisoreux',
  'Erengrad', 'Praag', 'Castle Drakenhof', 'Drakenhof', 'Loren', 'Middenheim', 'Talabheim', 'Wolfenburg',
  // Tolkien
  'Mordor', 'Gondor', 'Rohan', 'Mirkwood', 'Rivendell', 'Lothlorien', 'Isengard', 'Moria', 'Shire',
  'Dead Marshes', 'Fangorn', 'Erebor', 'Angmar', 'Arnor', 'Harad', 'Rhun', 'Dale', 'Osgiliath', 'Minas',
  // The original game's map, as far as the screenshot names it
  'Forest of the Damned', 'Dead Plains',
];

describe('campaign map data (AC 1)', () => {
  it('has 28 regions: six blocs of four plus four contested', () => {
    expect(REGIONS).toHaveLength(28);
    expect(REGION_IDS).toHaveLength(28);
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(28);

    const perBloc = new Map<string, number>();
    for (const r of REGIONS) perBloc.set(r.bloc, (perBloc.get(r.bloc) ?? 0) + 1);
    expect([...perBloc.keys()].sort()).toEqual([...BLOC_RACES, CONTESTED].sort());
    for (const race of BLOC_RACES) expect(perBloc.get(race), `bloc ${race}`).toBe(4);
    expect(perBloc.get(CONTESTED)).toBe(4);
    expect(CONTESTED_REGIONS).toHaveLength(4);
    for (const id of CONTESTED_REGIONS) expect(region(id).bloc).toBe(CONTESTED);
  });

  it('each bloc definition lists its own four regions, three starting plus the holdout', () => {
    for (const race of BLOC_RACES) {
      const bloc = BLOCS[race];
      expect(bloc.regions).toHaveLength(4);
      for (const id of bloc.regions) expect(region(id).bloc).toBe(race);
      expect(bloc.starting).toHaveLength(3);
      expect([...bloc.starting, bloc.holdout].sort()).toEqual([...bloc.regions].sort());
    }
  });

  it('adjacency is symmetric, never self-referential and names only known regions', () => {
    for (const r of REGIONS) {
      expect(r.adjacent.length).toBeGreaterThan(0);
      expect(new Set(r.adjacent).size).toBe(r.adjacent.length);
      for (const other of r.adjacent) {
        expect(other).not.toBe(r.id);
        expect(region(other).adjacent, `${other} must list ${r.id} back`).toContain(r.id);
      }
    }
  });

  it('adjacency agrees with the hex geometry the map draws', () => {
    const byPos = new Map(REGIONS.map((r) => [`${r.col},${r.row}`, r.id]));
    expect(byPos.size).toBe(28); // no two regions share a cell
    for (const r of REGIONS) {
      const expected = hexNeighbours(r.col, r.row)
        .map(([c, row]) => byPos.get(`${c},${row}`))
        .filter((id): id is NonNullable<typeof id> => id !== undefined)
        .sort();
      expect([...r.adjacent].sort(), `neighbours of ${r.id}`).toEqual(expected);
    }
  });

  it('the map is one connected territory', () => {
    const seen = new Set<string>([REGIONS[0]!.id]);
    const queue = [REGIONS[0]!.id];
    while (queue.length) {
      for (const next of region(queue.shift()!).adjacent) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(28);
  });

  it('every bloc borders the contested centre, so contested regions are reachable from any side', () => {
    for (const race of BLOC_RACES) {
      const touches = BLOCS[race].regions.some((id) => region(id).adjacent.some((n) => region(n).bloc === CONTESTED));
      expect(touches, `bloc ${race}`).toBe(true);
    }
    for (const id of CONTESTED_REGIONS) {
      const blocs = new Set(region(id).adjacent.map((n) => region(n).bloc).filter((b) => b !== CONTESTED));
      expect(blocs.size, `contested ${id} should border more than one bloc`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('region names (AC 8)', () => {
  it('every region has a distinct, non-empty name', () => {
    const names = REGION_IDS.map((id) => REGION_NAMES[id]);
    for (const n of names) expect(n.trim()).not.toBe('');
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(28);
  });

  it('no name reproduces a published setting or the original map', () => {
    for (const id of REGION_IDS) {
      const name = REGION_NAMES[id].toLowerCase();
      for (const banned of PUBLISHED_SETTING_NAMES) {
        expect(name, `${id} "${REGION_NAMES[id]}" matches "${banned}"`).not.toContain(banned.toLowerCase());
      }
    }
  });
});
