/**
 * SaveStore — the ONLY code that reads or writes stored campaign data.
 *
 * Everything else goes through `load()` / `write()` / `clear()`. Storage is
 * injected so tests run headless against an in-memory map and the browser
 * uses `localStorage`.
 *
 * Load outcomes (the game always starts; none of these throw):
 *   absent          — no save; defaults applied.
 *   loaded          — save read and validated.
 *   migrated        — older schema version brought up to date and written back.
 *   unreadable      — not valid JSON (e.g. truncated); copied to the backup key,
 *                     defaults applied. The next write replaces it.
 *   invalid         — JSON but fails validation; same treatment as unreadable.
 *   newer-version   — written by a later build; same treatment as unreadable
 *                     so a downgrade does not silently destroy progress.
 */

import { MIGRATIONS, migrateSave, type Migration } from './migrations';
import { SAVE_SCHEMA_VERSION, defaultSave, validateSave, type CampaignSave } from './schema';

export const SAVE_KEY = 'campaign.save';
export const BACKUP_KEY = 'campaign.save.backup';

export type LoadOutcome = 'absent' | 'loaded' | 'migrated' | 'unreadable' | 'invalid' | 'newer-version';

export interface LoadResult {
  save: CampaignSave;
  outcome: LoadOutcome;
  /** Human-readable explanation for non-`loaded` outcomes. */
  detail: string;
}

/** The subset of the Web Storage API the store needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export interface SaveStoreOptions {
  storage?: StorageLike;
  migrations?: readonly Migration[];
  targetVersion?: number;
}

export class SaveStore {
  private readonly storage: StorageLike;
  private readonly migrations: readonly Migration[];
  private readonly targetVersion: number;

  constructor(options: SaveStoreOptions = {}) {
    this.storage = options.storage ?? globalThis.localStorage;
    this.migrations = options.migrations ?? MIGRATIONS;
    this.targetVersion = options.targetVersion ?? SAVE_SCHEMA_VERSION;
  }

  load(): LoadResult {
    let text: string | null;
    try {
      text = this.storage.getItem(SAVE_KEY);
    } catch (err) {
      return { save: defaultSave(), outcome: 'unreadable', detail: `storage read failed: ${String(err)}` };
    }
    if (text === null) {
      return { save: defaultSave(), outcome: 'absent', detail: 'no save found; defaults applied' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      this.quarantine(text);
      return { save: defaultSave(), outcome: 'unreadable', detail: `save is not valid JSON: ${String(err)}` };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      this.quarantine(text);
      return { save: defaultSave(), outcome: 'invalid', detail: 'save is not an object' };
    }

    const migrated = migrateSave(parsed as Record<string, unknown>, this.migrations, this.targetVersion);
    if (!migrated.ok) {
      this.quarantine(text);
      const outcome: LoadOutcome = migrated.reason === 'newer-version' ? 'newer-version' : 'invalid';
      return { save: defaultSave(), outcome, detail: migrated.detail };
    }

    const validated = validateSave(migrated.raw, this.targetVersion);
    if (!validated.ok) {
      this.quarantine(text);
      return { save: defaultSave(), outcome: 'invalid', detail: validated.reason };
    }

    if (migrated.migrated) {
      this.write(validated.save);
      return { save: validated.save, outcome: 'migrated', detail: 'save migrated to current schema' };
    }
    return { save: validated.save, outcome: 'loaded', detail: 'save loaded' };
  }

  write(save: CampaignSave): void {
    const validated = validateSave({ ...save, schemaVersion: this.targetVersion }, this.targetVersion);
    if (!validated.ok) {
      throw new Error(`refusing to write an invalid save: ${validated.reason}`);
    }
    this.storage.setItem(SAVE_KEY, JSON.stringify(validated.save));
  }

  clear(): void {
    this.storage.removeItem(SAVE_KEY);
  }

  /** Keep a copy of a save we could not read so a bad build does not lose it. */
  private quarantine(text: string): void {
    try {
      this.storage.setItem(BACKUP_KEY, text);
    } catch {
      // Best effort; the game still starts.
    }
  }
}

/**
 * The live campaign as screens see it. Every `update` is written through the
 * store immediately, so screens never touch storage themselves.
 */
export interface CampaignAccess {
  read(): Readonly<CampaignSave>;
  update(patch: Partial<Omit<CampaignSave, 'schemaVersion'>>): Readonly<CampaignSave>;
}

export function createCampaignAccess(store: SaveStore, initial: CampaignSave): CampaignAccess {
  let current: CampaignSave = { ...initial };
  return {
    read: () => current,
    update(patch) {
      current = { ...current, ...patch, schemaVersion: current.schemaVersion };
      store.write(current);
      return current;
    },
  };
}
