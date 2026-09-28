import { describe, expect, it } from 'vitest';
import {
  BACKUP_KEY,
  MIGRATIONS,
  MemoryStorage,
  SAVE_KEY,
  SAVE_SCHEMA_VERSION,
  SaveStore,
  createCampaignAccess,
  defaultSave,
  type CampaignSave,
  type Migration,
} from './index';

/** The field list from the rules document, section 15. */
const RULES_FIELDS: (keyof CampaignSave)[] = [
  'quality',
  'zoom',
  'campaignLevel',
  'raceUnlocked',
  'soundOn',
  'musicOn',
  'autoSendOn',
  'gold',
  'lifetimeKills',
  'chosenRace',
  'ownedUnits',
  'upgradeLevels',
  'regionOwners',
];

const fullCampaign = (): CampaignSave => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  quality: 'high',
  zoom: 1.25,
  campaignLevel: 7,
  raceUnlocked: true,
  soundOn: false,
  musicOn: true,
  autoSendOn: true,
  gold: 1234,
  lifetimeKills: 987,
  chosenRace: 'race2',
  ownedUnits: [0, 1, 2, 5, 8],
  upgradeLevels: { attack: 2, defence: 1, speed: 0 },
  regionOwners: { r1: 'race2', r2: 'race4', r3: null },
});

describe('SaveStore — defaults (AC 4)', () => {
  it('starts with the rules-document defaults when no save exists', () => {
    const store = new SaveStore({ storage: new MemoryStorage() });
    const { save, outcome } = store.load();
    expect(outcome).toBe('absent');
    expect(save.gold).toBe(500);
    expect(save.lifetimeKills).toBe(0);
    expect(save.soundOn).toBe(true);
    expect(save.musicOn).toBe(true);
    expect(save.autoSendOn).toBe(false);
    expect(save.quality).toBe('medium');
    expect(save.ownedUnits).toEqual([0, 1, 2]);
    expect(save.chosenRace).toBeNull();
    expect(save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  it('carries every field the rules document lists', () => {
    const save = defaultSave();
    for (const field of RULES_FIELDS) expect(save).toHaveProperty(field);
  });
});

describe('SaveStore — round trip (AC 5)', () => {
  it('reads back every field unchanged after a "reload" (fresh store over the same storage)', () => {
    const storage = new MemoryStorage();
    const written = fullCampaign();
    new SaveStore({ storage }).write(written);

    const reloaded = new SaveStore({ storage }).load();
    expect(reloaded.outcome).toBe('loaded');
    for (const field of RULES_FIELDS) {
      expect(reloaded.save[field], `field ${field}`).toEqual(written[field]);
    }
    expect(reloaded.save).toEqual(written);
  });

  it('writes through CampaignAccess.update immediately', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore({ storage });
    const campaign = createCampaignAccess(store, store.load().save);
    campaign.update({ chosenRace: 'race6', gold: 42 });
    const again = new SaveStore({ storage }).load().save;
    expect(again.chosenRace).toBe('race6');
    expect(again.gold).toBe(42);
  });
});

describe('SaveStore — damaged saves (AC 6)', () => {
  it('truncated halfway: starts with defaults, outcome "unreadable", original kept in backup', () => {
    const storage = new MemoryStorage();
    const text = JSON.stringify(fullCampaign());
    const truncated = text.slice(0, Math.floor(text.length / 2));
    storage.setItem(SAVE_KEY, truncated);

    const { save, outcome } = new SaveStore({ storage }).load();
    expect(outcome).toBe('unreadable');
    expect(save).toEqual(defaultSave());
    expect(storage.getItem(BACKUP_KEY)).toBe(truncated);
  });

  it('invalid values: starts with defaults, outcome "invalid", original kept in backup', () => {
    const storage = new MemoryStorage();
    const bad = { ...fullCampaign(), gold: -5, quality: 'ultra', chosenRace: 'race9' };
    const text = JSON.stringify(bad);
    storage.setItem(SAVE_KEY, text);

    const { save, outcome, detail } = new SaveStore({ storage }).load();
    expect(outcome).toBe('invalid');
    expect(detail).toMatch(/quality/);
    expect(save).toEqual(defaultSave());
    expect(storage.getItem(BACKUP_KEY)).toBe(text);
  });

  it('newer schema version: starts with defaults, outcome "newer-version", original kept in backup', () => {
    const storage = new MemoryStorage();
    const text = JSON.stringify({ ...fullCampaign(), schemaVersion: SAVE_SCHEMA_VERSION + 5 });
    storage.setItem(SAVE_KEY, text);

    const { save, outcome } = new SaveStore({ storage }).load();
    expect(outcome).toBe('newer-version');
    expect(save).toEqual(defaultSave());
    expect(storage.getItem(BACKUP_KEY)).toBe(text);
  });

  it('a save that is JSON but not an object is invalid', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '[1,2,3]');
    expect(new SaveStore({ storage }).load().outcome).toBe('invalid');
  });

  it('refuses to write an invalid save', () => {
    const store = new SaveStore({ storage: new MemoryStorage() });
    expect(() => store.write({ ...defaultSave(), gold: -1 })).toThrow(/invalid save/);
  });
});

describe('SaveStore — migration path (AC 7)', () => {
  /** A save exactly as the version-1 build wrote it (no `zoom` field). */
  const v1Save = (): Record<string, unknown> => {
    const { zoom: _zoom, ...rest } = fullCampaign();
    return { ...rest, schemaVersion: 1 };
  };

  it('a version-1 save loads on the current build through the production chain (1 → 2 adds zoom)', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify(v1Save()));
    const { save, outcome } = new SaveStore({ storage }).load();
    expect(outcome).toBe('migrated');
    expect(save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(save.zoom).toBe(1);
    for (const field of RULES_FIELDS) {
      if (field === 'zoom') continue;
      expect(save[field], `field ${field}`).toEqual(fullCampaign()[field]);
    }
    expect(new SaveStore({ storage }).load().outcome).toBe('loaded');
  });

  it('a version-1 save survives a later schema change through the migration chain', () => {
    // Simulate a future build: schema 3 renames `lifetimeKills` → `kills` and adds `difficulty`,
    // schema 4 restores the rules-document name so the current validator accepts it.
    const toV3: Migration = {
      from: 2,
      to: 3,
      apply: (raw) => {
        const { lifetimeKills, ...rest } = raw;
        return { ...rest, kills: lifetimeKills, difficulty: 'normal' };
      },
    };
    const toV4: Migration = {
      from: 3,
      to: 4,
      apply: (raw) => {
        const { kills, difficulty: _difficulty, ...rest } = raw;
        return { ...rest, lifetimeKills: kills };
      },
    };

    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify(v1Save()));

    const futureStore = new SaveStore({ storage, migrations: [...MIGRATIONS, toV3, toV4], targetVersion: 4 });
    const { save, outcome } = futureStore.load();

    expect(outcome).toBe('migrated');
    expect(save.schemaVersion).toBe(4);
    // Campaign progress intact.
    expect(save.campaignLevel).toBe(7);
    expect(save.gold).toBe(1234);
    expect(save.lifetimeKills).toBe(987);
    expect(save.chosenRace).toBe('race2');
    expect(save.ownedUnits).toEqual([0, 1, 2, 5, 8]);
    expect(save.regionOwners).toEqual({ r1: 'race2', r2: 'race4', r3: null });
    // Written back at the new version, so the next load is a plain "loaded".
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).schemaVersion).toBe(4);
    expect(futureStore.load().outcome).toBe('loaded');
  });

  it('a save with no migration path is treated as invalid, not crashed on', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify(v1Save()));
    const { outcome, detail } = new SaveStore({ storage, migrations: [], targetVersion: 2 }).load();
    expect(outcome).toBe('invalid');
    expect(detail).toMatch(/no migration from version 1/);
  });
});
