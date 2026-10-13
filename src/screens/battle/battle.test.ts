import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type App } from '../../app';
import { NullEngineHost } from '../../engine/nullHost';
import { exclusiveOf, isUnitId, raceVisuals, starterUnits, unitDisplayName, type RaceId } from '../../roster';
import { MemoryStorage } from '../../save';

let overlayRoot: HTMLElement;
let app: App;

const click = async (action: string) => {
  const btn = overlayRoot.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
  if (!btn) throw new Error(`no button "${action}" on ${app.shell.activeScreenId}`);
  btn.click();
  await app.shell.settled();
};

beforeEach(async () => {
  document.body.innerHTML = '<div id="ui"></div>';
  overlayRoot = document.getElementById('ui')!;
  app = await createApp({ host: new NullEngineHost(), overlayRoot, storage: new MemoryStorage() });
  await app.shell.navigate('ready');
});

describe('two-player battle fields the roster\'s two-player armies (AC 7)', () => {
  it('each side gets the trio plus two generics named for its race, drawn through the definition', async () => {
    await click('twoPlayer');
    const battle = overlayRoot.querySelector<HTMLElement>('[data-screen="battle"]')!;
    expect(battle.dataset.mode).toBe('two-player');
    for (const side of ['left', 'right'] as const) {
      const line = battle.querySelector<HTMLElement>(`[data-role="two-player-${side}"]`)!;
      const race = line.dataset.race as RaceId;
      const units = line.dataset.units!.split(',').map(Number);
      expect(units.every(isUnitId)).toBe(true);
      expect(units).toHaveLength(5);
      expect(units.slice(0, 3)).toEqual([...starterUnits()]);
      for (const unit of units.slice(3)) if (isUnitId(unit)) expect(exclusiveOf(unit)).toBeNull();
      for (const unit of units) if (isUnitId(unit)) expect(line.textContent).toContain(unitDisplayName(unit, race));
      expect(line.dataset.atlas).toBe(raceVisuals(race).atlas);
      expect(line.dataset.tint).toBe(raceVisuals(race).tint);
    }
  });
});
