import { describe, expect, it } from 'vitest';
import { ROSTER, mixedRoster, rosterFor, starterUnits } from '../roster';
import { BLOC_RACES, RACES, UNLOCKABLE_RACE, defaultSave, type CampaignSave, type RaceId } from '../save';
import {
  BLOCS,
  CONTESTED_REGIONS,
  CONTESTED_STAT_BONUS,
  PLAYER_OWNER,
  REGIONS,
  applyVictory,
  attackOrigins,
  attackableRegions,
  battleSetup,
  battlesRemaining,
  battlesWon,
  campaignStarted,
  initialOwners,
  isCampaignComplete,
  newCampaignPatch,
  playerRegions,
  region,
  startingBloc,
  type RegionId,
} from './index';

const started = (race: RaceId): CampaignSave => ({
  ...defaultSave(),
  chosenRace: race,
  regionOwners: initialOwners(race),
});

/** Conquer region after region, always taking the first legal target, until none is left. */
const conquerEverything = (race: RaceId, choose = (open: RegionId[]) => open[0]!) => {
  let save = started(race);
  const fought: RegionId[] = [];
  for (;;) {
    const open = attackableRegions(save.regionOwners);
    if (open.length === 0) break;
    const target = choose(open);
    const patch = applyVictory(save, target);
    if (!patch) throw new Error(`victory over ${target} rejected`);
    save = { ...save, ...patch };
    fought.push(target);
    if (fought.length > 100) throw new Error('conquest does not terminate');
  }
  return { save, fought };
};

describe('campaign start', () => {
  it('a race starts holding its own three regions, with every other region defended', () => {
    for (const race of BLOC_RACES) {
      const owners = initialOwners(race);
      expect(campaignStarted(owners)).toBe(true);
      expect(playerRegions(owners).sort()).toEqual([...BLOCS[race].starting].sort());
      expect(owners[BLOCS[race].holdout]).toBe(race);
      for (const r of REGIONS) {
        if (BLOCS[race].starting.includes(r.id)) continue;
        expect(owners[r.id], r.id).toBe(r.bloc === 'contested' ? null : r.bloc);
      }
    }
  });

  it('the unlockable race starts from a host bloc and must retake that bloc\'s holdout', () => {
    const host = startingBloc(UNLOCKABLE_RACE);
    expect(BLOC_RACES).toContain(host);
    const owners = initialOwners(UNLOCKABLE_RACE);
    expect(playerRegions(owners).sort()).toEqual([...BLOCS[host].starting].sort());
    expect(owners[BLOCS[host].holdout]).toBe(host);
  });

  it('an empty owner map means the campaign has not started', () => {
    expect(campaignStarted({})).toBe(false);
    expect(attackableRegions({})).toEqual([]);
    expect(isCampaignComplete({})).toBe(false);
  });
});

describe('attackable regions (AC 3, AC 5 data side)', () => {
  it('are exactly the unheld neighbours of held regions', () => {
    const owners = initialOwners('race1');
    const expected = new Set<RegionId>();
    for (const held of BLOCS.race1.starting) for (const n of region(held).adjacent) if (owners[n] !== PLAYER_OWNER) expected.add(n);
    expect(new Set(attackableRegions(owners))).toEqual(expected);
    for (const target of attackableRegions(owners)) {
      const origins = attackOrigins(owners, target);
      expect(origins.length).toBeGreaterThan(0);
      for (const o of origins) expect(owners[o]).toBe(PLAYER_OWNER);
    }
  });

  it('a contested region opens from any adjacent holding, whichever bloc that holding came from', () => {
    // race3's starting trio does not touch the centre; taking race6's r24 opens contested r28.
    let save = started('race3');
    expect(attackableRegions(save.regionOwners)).not.toContain('r28');
    expect(attackableRegions(save.regionOwners)).toContain('r24');
    expect(region('r24').bloc).toBe('race6');
    save = { ...save, ...applyVictory(save, 'r24')! };
    expect(attackableRegions(save.regionOwners)).toContain('r28');
    expect(attackOrigins(save.regionOwners, 'r28')).toEqual(['r24']);
  });

  it('a victory over a region that is not attackable is refused', () => {
    const save = started('race1');
    expect(applyVictory(save, 'r22')).toBeNull(); // far side of the map
    expect(applyVictory(save, 'r01')).toBeNull(); // already held
  });
});

describe('battle setup (AC 4)', () => {
  it('a region held by race4 fields race4\'s roster, Giant Troll included, no other exclusive', () => {
    const setup = battleSetup(initialOwners('race1'), BLOCS.race4.regions[0]!);
    expect(setup.defender).toEqual({ kind: 'race', race: 'race4' });
    expect(setup.units).toEqual(rosterFor('race4'));
    expect(setup.units).toContain(ROSTER.races.race4.exclusive);
    for (const race of RACES) if (race !== 'race4') expect(setup.units).not.toContain(ROSTER.races[race].exclusive);
    expect(setup.statBonus).toBe(1);
  });

  it('the player\'s own holdout is defended by the player\'s race', () => {
    const setup = battleSetup(initialOwners('race2'), BLOCS.race2.holdout);
    expect(setup.defender).toEqual({ kind: 'race', race: 'race2' });
  });

  it('a contested region fields the mixed army with the stat bonus', () => {
    for (const id of CONTESTED_REGIONS) {
      const setup = battleSetup(initialOwners('race5'), id);
      expect(setup.defender).toEqual({ kind: 'contested' });
      expect(setup.units).toEqual(mixedRoster());
      expect(setup.statBonus).toBe(CONTESTED_STAT_BONUS);
      expect(setup.statBonus).toBeGreaterThan(1);
    }
  });
});

describe('full conquest (AC 2, AC 7)', () => {
  it('takes exactly 25 battles from three starting regions, for every race', () => {
    for (const race of RACES) {
      const { save, fought } = conquerEverything(race);
      expect(fought, `race ${race}`).toHaveLength(25);
      expect(new Set(fought).size).toBe(25);
      expect(isCampaignComplete(save.regionOwners)).toBe(true);
      expect(battlesWon(save.regionOwners)).toBe(25);
      expect(battlesRemaining(save.regionOwners)).toBe(0);
      expect(save.campaignLevel).toBe(26);
      expect(attackableRegions(save.regionOwners)).toEqual([]);
    }
  });

  it('also takes 25 battles when always attacking the last legal target', () => {
    const { fought } = conquerEverything('race4', (open) => open[open.length - 1]!);
    expect(fought).toHaveLength(25);
  });

  it('the four contested regions are fought as part of the 25', () => {
    const { fought } = conquerEverything('race1');
    for (const id of CONTESTED_REGIONS) expect(fought).toContain(id);
  });

  it('only the final conquest unlocks the additional race', () => {
    let save = started('race6');
    let unlockedAt = -1;
    for (let n = 1; n <= 25; n++) {
      const target = attackableRegions(save.regionOwners)[0]!;
      save = { ...save, ...applyVictory(save, target)! };
      if (save.raceUnlocked && unlockedAt < 0) unlockedAt = n;
    }
    expect(unlockedAt).toBe(25);
  });

  it('a new campaign keeps the unlock and settings but resets progress', () => {
    const { save } = conquerEverything('race1');
    const reset = { ...save, soundOn: false, lifetimeKills: 40, ...newCampaignPatch({ ...save, soundOn: false, lifetimeKills: 40 }) };
    expect(reset.raceUnlocked).toBe(true);
    expect(reset.soundOn).toBe(false);
    expect(reset.lifetimeKills).toBe(40);
    expect(reset.chosenRace).toBeNull();
    expect(reset.regionOwners).toEqual({});
    expect(reset.campaignLevel).toBe(1);
    expect(reset.gold).toBe(500);
  });
});
