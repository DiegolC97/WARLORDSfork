import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../../app';
import { BAR_CENTRE, BAR_PIXELS_PER_POINT, BATTLE_LENGTH_FRAMES, KILLS_PER_CHARGE, LANE_COUNT, RESULT_AUTO_CONTINUE_FRAMES } from '../../battle';
import { BLOCS, initialOwners } from '../../campaign';
import { NullEngineHost } from '../../engine/nullHost';
import { exclusiveOf, isUnitId, raceVisuals, starterUnits, unitDisplayName, unitStats, type RaceId, type UnitId } from '../../roster';
import { MemoryStorage, SaveStore, defaultSave, type CampaignSave } from '../../save';
import { battleHandle, type BattleHandle } from '../../battle';
import { RACK_GAP, RACK_SIDE_WIDTH, rackGrid } from './layout';

/** mulberry32, so every battle in this file replays exactly. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let overlayRoot: HTMLElement;
let storage: MemoryStorage;
let host: NullEngineHost;
let app: App;

const EIGHT: UnitId[] = [0, 1, 2, 3, 4, 5, 6, 18];

/** A campaign save as race1 about to attack `target` with `army`. */
const campaignSave = (army: readonly UnitId[], target: string, extra: Partial<CampaignSave> = {}): CampaignSave => ({
  ...defaultSave(),
  chosenRace: 'race1',
  regionOwners: initialOwners('race1'),
  ownedUnits: [...army],
  battleRegion: target,
  campaignLevel: 3,
  ...extra,
});

const boot = async (save?: CampaignSave) => {
  storage = new MemoryStorage();
  if (save) new SaveStore({ storage }).write(save);
  document.body.innerHTML = '<div id="ui"></div>';
  overlayRoot = document.getElementById('ui')!;
  host = new NullEngineHost();
  app = await createApp({ host, overlayRoot, storage });
  await app.shell.navigate('ready');
};

const click = async (action: string) => {
  const btn = overlayRoot.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
  if (!btn) throw new Error(`no button "${action}" on ${app.shell.activeScreenId}`);
  if (btn.disabled) throw new Error(`button "${action}" is disabled`);
  btn.click();
  await app.shell.settled();
};

const battle = () => overlayRoot.querySelector<HTMLElement>('[data-screen="battle"]')!;
const handle = (): BattleHandle => {
  const h = battleHandle(battle());
  if (!h) throw new Error('battle screen exposes no handle');
  return h;
};
const q = <T extends HTMLElement>(selector: string): T => {
  const el = battle().querySelector<T>(selector);
  if (!el) throw new Error(`no element ${selector} on the battle screen`);
  return el;
};
const rackButtons = (side: 'left' | 'right') => [...battle().querySelectorAll<HTMLButtonElement>(`[data-role="rack-${side}"] button.spawner`)];
const keyDown = (code: string, repeat = false) => window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat, cancelable: true }));
const keyUp = (code: string) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
const saved = () => new SaveStore({ storage }).load().save;

/** Campaign: race1 attacks r15 (race4's region bordering its start). */
const startCampaignBattle = async (army: readonly UnitId[] = EIGHT, target = 'r15', extra: Partial<CampaignSave> = {}) => {
  await boot(campaignSave(army, target, extra));
  await click('campaign');
  await click(`attack:${target}`);
  expect(app.shell.activeScreenId).toBe('battle');
};

const startTwoPlayer = async () => {
  await boot();
  await click('twoPlayer');
  expect(app.shell.activeScreenId).toBe('battle');
};

beforeEach(() => {
  vi.spyOn(Math, 'random').mockImplementation(seeded(11));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('spawner rack (AC 1, AC 2)', () => {
  it('a campaign army of eight renders eight buttons that fit the side width, each with a portrait and its per-race name', async () => {
    await startCampaignBattle(EIGHT);
    const buttons = rackButtons('left');
    expect(buttons).toHaveLength(8);
    const grid = rackGrid(8);
    expect(grid.columns * grid.buttonWidth + (grid.columns - 1) * RACK_GAP).toBeLessThanOrEqual(RACK_SIDE_WIDTH);
    expect(grid.rows).toBe(2);
    buttons.forEach((b, i) => {
      expect(b.dataset.unit).toBe(String(EIGHT[i]));
      expect(parseInt(b.style.width, 10)).toBe(grid.buttonWidth);
      expect(parseInt(b.style.height, 10)).toBe(grid.buttonHeight);
      const name = b.querySelector<HTMLElement>('[data-role="unit-name"]')!;
      expect(name.textContent).toBe(unitDisplayName(EIGHT[i]!, 'race1'));
      const portrait = b.querySelector<HTMLElement>('[data-role="portrait"]')!;
      expect(portrait.dataset.frame).toBe(unitStats(EIGHT[i]!).sprite);
      expect(portrait.style.background).toContain('rgb(0, 114, 178)'); // race1's tint
    });
    expect(q('[data-role="rack-left"]').dataset.race).toBe('race1');
    expect(q('[data-role="rack-right"]').dataset.race).toBe('race4');
    expect(q('[data-role="rack-right"]').dataset.control).toBe('ai');
  });

  it('a two-player army of five renders five buttons through the same grid, three plus two, all one width', async () => {
    await startTwoPlayer();
    for (const side of ['left', 'right'] as const) {
      const buttons = rackButtons(side);
      expect(buttons).toHaveLength(5);
      const grid = rackGrid(5);
      expect(grid).toMatchObject({ columns: 3, rows: 2 });
      const widths = new Set(buttons.map((b) => b.style.width));
      expect(widths.size).toBe(1);
      expect(parseInt(buttons[0]!.style.width, 10)).toBe(grid.buttonWidth);
      const rack = q(`[data-role="rack-${side}"]`);
      expect(rack.dataset.columns).toBe('3');
      const race = rack.dataset.race as RaceId;
      const units = rack.dataset.units!.split(',').map(Number);
      expect(units.every(isUnitId)).toBe(true);
      expect(units.slice(0, 3)).toEqual([...starterUnits()]);
      for (const unit of units.slice(3)) if (isUnitId(unit)) expect(exclusiveOf(unit)).toBeNull();
      buttons.forEach((b, i) => {
        const unit = units[i]!;
        if (isUnitId(unit)) expect(b.querySelector('[data-role="unit-name"]')!.textContent).toBe(unitDisplayName(unit, race));
      });
      expect(rack.dataset.tint).toBe(raceVisuals(race).tint);
    }
  });

  it('a single-unit army renders one capped-width button that stays selected', async () => {
    await startCampaignBattle([5]);
    const buttons = rackButtons('left');
    expect(buttons).toHaveLength(1);
    expect(parseInt(buttons[0]!.style.width, 10)).toBe(rackGrid(1).buttonWidth);
    keyDown('KeyD');
    keyDown('KeyA');
    host.tick(1);
    expect(buttons[0]!.classList.contains('selected')).toBe(true);
    expect(q('[data-role="rack-left"] [data-role="selected-name"]').textContent).toBe(unitDisplayName(5, 'race1'));
  });

  it('clicking a rack button selects that unit', async () => {
    await startCampaignBattle(EIGHT);
    rackButtons('left')[6]!.click();
    expect(handle().simulation.snapshot().spawners.left.selected).toBe(6);
    expect(rackButtons('left')[6]!.classList.contains('selected')).toBe(true);
  });
});

describe('lane selection (AC 3)', () => {
  it('both arrows start on lane 4; the lane key cycles 1–8 with wrap and the unit spawns into the arrowed lane', async () => {
    await startTwoPlayer();
    expect(q('[data-role="arrow-left"]').dataset.lane).toBe('4');
    expect(q('[data-role="arrow-right"]').dataset.lane).toBe('4');
    const seen: string[] = [];
    for (let i = 0; i < LANE_COUNT; i++) {
      keyDown('KeyS');
      host.tick(1);
      seen.push(q('[data-role="arrow-left"]').dataset.lane!);
    }
    expect(seen).toEqual(['5', '6', '7', '8', '1', '2', '3', '4']);
    for (let i = 0; i < 4; i++) keyDown('KeyW');
    host.tick(1);
    expect(q('[data-role="arrow-left"]').dataset.lane).toBe('8');
    keyDown('ArrowDown');
    host.tick(1);
    expect(q('[data-role="arrow-right"]').dataset.lane).toBe('5');

    host.tick(unitStats(0).recharge);
    keyDown('Space');
    keyUp('Space');
    host.tick(1);
    const unit = q('[data-role="units"] .unit.left');
    expect(unit.dataset.lane).toBe('8');
    expect(handle().simulation.snapshot().units[0]).toMatchObject({ side: 'left', lane: 8 });
  });
});

describe('recharge (AC 4)', () => {
  it('a release during recharge spawns nothing; the button reads recharging until the simulation says ready', async () => {
    await startCampaignBattle(EIGHT);
    const spearman = rackButtons('left')[0]!;
    host.tick(10);
    keyDown('Space');
    keyUp('Space');
    host.tick(1);
    expect(battle().querySelectorAll('.unit.left')).toHaveLength(0);
    expect(spearman.dataset.recharge).toBe('recharging');
    let spawnedAt: number | null = null;
    for (let i = 0; i < 120; i++) {
      const s = handle().simulation.snapshot().spawners.left;
      expect(spearman.dataset.recharge).toBe(s.canRelease ? 'ready' : 'recharging');
      expect(Number(spearman.dataset.progress)).toBeCloseTo(s.rechargeProgress, 2);
      if (s.canRelease && spawnedAt === null) {
        keyDown('Space');
        keyUp('Space');
        spawnedAt = s.charged;
      }
      host.tick(1);
    }
    expect(spawnedAt).toBe(unitStats(0).recharge);
    expect(battle().querySelectorAll('.unit.left')).toHaveLength(1);
  });

  it('holding the spawn key yields one unit per recharge period, auto-repeat included (AC 8)', async () => {
    await startTwoPlayer();
    const periods = 10;
    const recharge = unitStats(0).recharge;
    keyDown('Space');
    const spawnTicks: number[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < periods * recharge + 1; i++) {
      keyDown('Space', true); // the browser's auto-repeat
      host.tick(1);
      const s = handle().simulation.snapshot();
      for (const u of s.units) {
        if (u.side === 'left' && !seen.has(u.id)) {
          seen.add(u.id);
          spawnTicks.push(s.tick);
        }
      }
    }
    keyUp('Space');
    expect(spawnTicks).toHaveLength(periods);
    for (let i = 1; i < spawnTicks.length; i++) expect(spawnTicks[i]! - spawnTicks[i - 1]!).toBe(recharge);
    // Released: nothing more spawns.
    host.tick(recharge * 2);
    expect(handle().simulation.snapshot().units.filter((u) => u.side === 'left' && !seen.has(u.id))).toHaveLength(0);
  });
});

describe('territory bar, dial and result (AC 5, AC 6)', () => {
  it('across a full battle the bar matches the scores every tick, the dial hits zero on the ending tick and the result names the winner', async () => {
    await startTwoPlayer();
    const bar = q('[data-role="territory-bar"]');
    const dial = q('[data-role="dial"]');
    expect(dial.dataset.seconds).toBe('300');
    expect(q('[data-role="seconds"]').textContent).toBe('');
    // The left player sends one unit early; it crosses unopposed for the only point of the battle.
    host.tick(unitStats(0).recharge);
    keyDown('Space');
    keyUp('Space');
    let endTick: number | null = null;
    for (let t = 0; t < BATTLE_LENGTH_FRAMES; t++) {
      host.tick(1);
      const s = handle().simulation.snapshot();
      expect(bar.dataset.target).toBe(String(BAR_CENTRE + BAR_PIXELS_PER_POINT * (s.leftScore - s.rightScore)));
      expect(bar.dataset.bar).toBe(String(s.barWidth));
      expect(bar.dataset.leftScore).toBe(String(s.leftScore));
      expect(bar.dataset.rightScore).toBe(String(s.rightScore));
      expect(dial.dataset.framesLeft).toBe(String(s.framesLeft));
      if (s.winner && endTick === null) endTick = s.tick;
    }
    const s = handle().simulation.snapshot();
    expect(s.leftScore).toBe(1);
    expect(endTick).toBe(BATTLE_LENGTH_FRAMES);
    expect(dial.dataset.framesLeft).toBe('0');
    expect(dial.classList.contains('zero')).toBe(true);
    expect(q('[data-role="seconds"]').textContent).toBe('0');
    expect(battle().dataset.winner).toBe('left');
    const panel = q('[data-role="result-panel"]');
    expect(panel.hidden).toBe(false);
    expect(q('[data-role="result-title"]').textContent).toBe('Left player wins');
    await click('finished');
    expect(app.shell.activeScreenId).toBe('result');
    const outcome = overlayRoot.querySelector<HTMLElement>('[data-role="outcome"]')!;
    expect(outcome.dataset.winner).toBe('left');
    expect(outcome.dataset.leftScore).toBe('1');
    expect(outcome.dataset.rightScore).toBe('0');
    expect(outcome.textContent).toContain('Left player wins');
  }, 60000);

  it('the seconds show in the last minute and the dial wedge shrinks', async () => {
    await startTwoPlayer();
    const wedge = q<SVGPathElement & HTMLElement>('[data-role="dial-wedge"]');
    const full = wedge.getAttribute('d');
    host.tick(24 * 10);
    expect(wedge.getAttribute('d')).not.toBe(full);
    expect(q('[data-role="seconds"]').textContent).toBe('');
    host.tick(24 * 231);
    expect(q('[data-role="dial"]').dataset.seconds).toBe('59');
    expect(q('[data-role="seconds"]').textContent).toBe('59');
  });

  it('a filled bar wins instantly and the campaign victory is written to the save', async () => {
    await startCampaignBattle(EIGHT, 'r15', { upgradeLevels: { speed: 10, armour: 10, spear: 10 } });
    keyDown('Space');
    let t = 0;
    while (handle().simulation.snapshot().winner === null && t < BATTLE_LENGTH_FRAMES) {
      host.tick(1);
      t++;
    }
    keyUp('Space');
    const s = handle().simulation.snapshot();
    expect(s.winner).toBe('left');
    expect(s.winReason).toBe('bar');
    expect(q('[data-role="territory-bar"]').classList.contains('full')).toBe(true);
    expect(q('[data-role="result-title"]').textContent).toBe('Victory');
    const save = saved();
    expect(save.lastBattle).toMatchObject({ winner: 'left', mode: 'campaign', leftScore: s.leftScore, rightScore: s.rightScore });
    expect(save.regionOwners.r15).toBe('player');
    expect(save.battleRegion).toBeNull();
    expect(save.gold).toBe(500 + s.spawners.left.gold);
    expect(save.lifetimeKills).toBe(s.spawners.left.kills);
  }, 60000);

  it('the result panel continues on its own after 240 frames', async () => {
    await startTwoPlayer();
    handle().simulation.surrender('right');
    host.tick(1);
    expect(q('[data-role="result-panel"]').hidden).toBe(false);
    host.tick(RESULT_AUTO_CONTINUE_FRAMES - 1);
    expect(app.shell.activeScreenId).toBe('battle');
    host.tick(1);
    await app.shell.settled();
    expect(app.shell.activeScreenId).toBe('result');
    expect(host.frameListeners).toBe(0);
  });
});

describe('charge meter (AC 7)', () => {
  it('fills across twenty kills and, once armed, releasing it spawns exactly eight units, one in each lane', async () => {
    await startCampaignBattle([1, 0, 2], 'r15', { upgradeLevels: { sword: 12, armour: 12 } });
    const meter = q('[data-role="charge-left"]');
    const chargeButton = q<HTMLButtonElement>('button[data-action="charge:left"]');
    expect(meter.dataset.kills).toBe('0');
    expect(chargeButton.disabled).toBe(true);
    const sim = handle().simulation;
    // One upgraded swordsman at a time holds lane 4 (so the left cannot win on the bar first);
    // the defenders are fed into the same lane as fast as they recharge and die to it one by one.
    const feedDefenders = () => {
      const s = sim.snapshot().spawners.right;
      if (!s.canRelease) return;
      while (sim.snapshot().spawners.right.selected !== 0) sim.command('right', 'previous-unit');
      while (sim.snapshot().spawners.right.lane < 4) sim.command('right', 'lane-down');
      while (sim.snapshot().spawners.right.lane > 4) sim.command('right', 'lane-up');
      sim.command('right', 'release');
    };
    const holdLane = () => {
      const s = sim.snapshot();
      if (!s.spawners.left.canRelease || s.units.some((u) => u.side === 'left' && u.lane === 4 && u.phase !== 'dead')) return;
      keyDown('Space');
      keyUp('Space');
    };
    let armedAt: number | null = null;
    for (let t = 0; t < 12000 && armedAt === null; t++) {
      feedDefenders();
      holdLane();
      host.tick(1);
      const s = sim.snapshot();
      expect(meter.dataset.kills).toBe(String(s.spawners.left.chargeKills));
      expect(Number(meter.dataset.progress)).toBeCloseTo(Math.min(1, s.spawners.left.chargeKills / KILLS_PER_CHARGE), 2);
      expect(meter.classList.contains('armed')).toBe(s.spawners.left.chargeReady);
      expect(chargeButton.disabled).toBe(!s.spawners.left.chargeReady);
      if (s.spawners.left.chargeReady) armedAt = s.tick;
      if (s.winner) break;
    }
    expect(armedAt, 'the left side never armed its charge').not.toBeNull();
    const before = new Set(handle().simulation.snapshot().units.filter((u) => u.side === 'left').map((u) => u.id));
    keyDown('KeyQ');
    keyUp('KeyQ');
    host.tick(1);
    const after = handle().simulation.snapshot();
    const fresh = after.units.filter((u) => u.side === 'left' && !before.has(u.id));
    expect(fresh).toHaveLength(LANE_COUNT);
    expect(fresh.map((u) => u.lane).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(after.spawners.left.chargeKills).toBe(0);
    expect(meter.dataset.kills).toBe('0');
    expect(meter.classList.contains('armed')).toBe(false);
  }, 60000);
});

describe('same race on both sides (AC 9)', () => {
  it('units of the two sides share the race tint and differ only by the accent layer', async () => {
    // The player's own holdout is defended by the player's race.
    const holdout = BLOCS.race1.regions.find((r) => !BLOCS.race1.starting.includes(r))!;
    await startCampaignBattle(EIGHT, holdout);
    expect(q('[data-role="rack-right"]').dataset.race).toBe('race1');
    host.tick(unitStats(0).recharge);
    keyDown('Space');
    keyUp('Space');
    host.tick(1);
    const sim = handle().simulation;
    // Give the right side a unit too, whatever the AI has done.
    while (!sim.snapshot().spawners.right.canRelease) host.tick(1);
    sim.command('right', 'release');
    host.tick(1);
    const left = q('.unit.left');
    const right = q('.unit.right');
    expect(left.style.getPropertyValue('--tint')).toBe(raceVisuals('race1').tint);
    expect(right.style.getPropertyValue('--tint')).toBe(raceVisuals('race1').tint);
    expect(left.dataset.accent).toBe('pennant-white-right');
    expect(right.dataset.accent).toBe('pennant-black-left');
    expect(left.querySelector('[data-role="accent"]')).not.toBeNull();
    expect(right.querySelector('[data-role="accent"]')).not.toBeNull();
  });
});

describe('two players on one keyboard (AC 10)', () => {
  it('simultaneous key events for both sides are all honoured', async () => {
    await startTwoPlayer();
    keyDown('KeyW');
    keyDown('ArrowUp');
    keyDown('KeyD');
    keyDown('ArrowRight'); // right player's Right = previous unit (mirrored)
    host.tick(1);
    const s = handle().simulation.snapshot();
    expect(s.spawners.left).toMatchObject({ lane: 3, selected: 1 });
    expect(s.spawners.right).toMatchObject({ lane: 3, selected: 4 });
    keyDown('KeyA');
    keyDown('ArrowLeft');
    host.tick(unitStats(0).recharge);
    keyDown('Space');
    keyDown('Enter');
    keyUp('Space');
    keyUp('Enter');
    host.tick(1);
    const after = handle().simulation.snapshot();
    expect(after.spawners.left.selected).toBe(0);
    expect(after.spawners.right.selected).toBe(0);
    expect(after.units.filter((u) => u.side === 'left')).toHaveLength(1);
    expect(after.units.filter((u) => u.side === 'right')).toHaveLength(1);
    expect(after.units.every((u) => u.lane === 3)).toBe(true);
  });

  it('in a campaign the arrow set also drives the left player and the AI side ignores keys', async () => {
    await startCampaignBattle(EIGHT);
    keyDown('ArrowUp');
    keyDown('ArrowRight');
    host.tick(1);
    const s = handle().simulation.snapshot();
    expect(s.spawners.left).toMatchObject({ lane: 3, selected: 1 });
    keyDown('ArrowLeft');
    host.tick(1);
    expect(handle().simulation.snapshot().spawners.left.selected).toBe(0);
  });

  it('key listeners are removed when the screen exits', async () => {
    await startTwoPlayer();
    await click('menu');
    expect(app.shell.activeScreenId).toBe('menu');
    expect(host.frameListeners).toBe(0);
    expect(() => keyDown('KeyW')).not.toThrow();
  });
});

describe('footer and surrender', () => {
  it('shows the level, offers main menu / surrender / options, and surrender hands the battle to the right side', async () => {
    await startCampaignBattle(EIGHT);
    expect(q('[data-role="level"]').textContent).toBe('Level 3');
    for (const action of ['menu', 'surrender', 'options']) expect(battle().querySelector(`button[data-action="${action}"]`)).not.toBeNull();
    await click('surrender');
    host.tick(1);
    const s = handle().simulation.snapshot();
    expect(s.winner).toBe('right');
    expect(q('[data-role="result-title"]').textContent).toBe('Defeat');
    expect(saved().lastBattle).toMatchObject({ winner: 'right', mode: 'campaign' });
    expect(saved().regionOwners.r15).toBe('race4');
    expect(saved().battleRegion).toBeNull();
    await click('finished');
    expect(overlayRoot.querySelector<HTMLElement>('[data-role="outcome"]')!.textContent).toContain('Defeat');
  });

  it('two-player shows the two-player indicator and the main menu control leaves the battle', async () => {
    await startTwoPlayer();
    expect(q('[data-role="level"]').dataset.level).toBe('two-player');
    await click('menu');
    expect(app.shell.activeScreenId).toBe('menu');
  });
});
