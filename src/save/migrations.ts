/**
 * Save migrations — the defined path from an older schema version to the
 * current one.
 *
 * To change the campaign's shape:
 *   1. Edit `CampaignSave` and bump `SAVE_SCHEMA_VERSION` in `schema.ts`.
 *   2. Append a `Migration` here with `from: <old>`, `to: <old + 1>`.
 * Migrations run in a chain (1→2→3…) over the raw JSON object *before*
 * validation, so a v1 file is always readable by a later build.
 */

export type RawSave = Record<string, unknown>;

export interface Migration {
  from: number;
  to: number;
  apply(raw: RawSave): RawSave;
}

/** Production migration chain, in order. */
export const MIGRATIONS: readonly Migration[] = [
  {
    // 1 → 2: the options screen gained a rendering zoom setting.
    from: 1,
    to: 2,
    apply: (raw) => ({ ...raw, zoom: 1 }),
  },
];

export type MigrateResult =
  | { ok: true; raw: RawSave; migrated: boolean }
  | { ok: false; reason: 'newer-version' | 'no-migration-path' | 'bad-version'; detail: string };

/**
 * Bring `raw` up to `targetVersion` by walking the `migrations` chain.
 * Pure: never touches storage, never mutates the input.
 */
export function migrateSave(
  raw: RawSave,
  migrations: readonly Migration[],
  targetVersion: number,
): MigrateResult {
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'bad-version', detail: `schemaVersion is ${String(version)}` };
  }
  if (version > targetVersion) {
    return {
      ok: false,
      reason: 'newer-version',
      detail: `save is version ${version}, this build reads up to ${targetVersion}`,
    };
  }

  let current: RawSave = { ...raw };
  let at = version;
  while (at < targetVersion) {
    const step = migrations.find((m) => m.from === at);
    if (!step) {
      return { ok: false, reason: 'no-migration-path', detail: `no migration from version ${at}` };
    }
    current = { ...step.apply({ ...current }), schemaVersion: step.to };
    at = step.to;
  }
  return { ok: true, raw: current, migrated: version !== targetVersion };
}
