/**
 * A side's spawner rack: one button per unit in the army, laid out by
 * `rackGrid` so one to eight buttons share the side's width. Each button
 * shows the unit's portrait (its frame in the race atlas over the race
 * tint) and its per-race name, and reflects the spawner's recharge state
 * every frame. The rack issues selection back; it decides nothing.
 */
import type { FrameState, Side } from '../../battle';
import { CONTESTED_COLOUR } from '../../campaign';
import { unitName } from '../../names';
import { raceVisuals, referencedAtlases, unitDisplayName, unitStats, type RaceId, type UnitId } from '../../roster';
import { buildPortrait, type AtlasJson } from '../../ui/portrait';
import { RACK_GAP, rackGrid } from './layout';

export type { AtlasJson } from '../../ui/portrait';

export interface RackOptions {
  readonly side: Side;
  /** The race the side fields, or `null` for the contested regions' mixed host (base names, contested colour). */
  readonly race: RaceId | null;
  readonly army: readonly UnitId[];
  /** Parsed atlas, or `null` when it is not available (headless). */
  readonly atlas: AtlasJson | null;
  /** Url of the atlas image, resolved from the atlas json's `texture`. */
  readonly atlasImage: string | null;
  readonly onSelect: (index: number) => void;
}

export interface Rack {
  readonly root: HTMLDivElement;
  update(frame: FrameState): void;
}

export function buildRack(parent: HTMLElement, options: RackOptions): Rack {
  const { side, race, army } = options;
  const visuals = race
    ? raceVisuals(race)
    : { tint: CONTESTED_COLOUR, atlas: referencedAtlases()[0] ?? '', frame: (unit: UnitId) => unitStats(unit).sprite };
  const nameOf = (unit: UnitId) => (race ? unitDisplayName(unit, race) : unitName(unit));
  const grid = rackGrid(army.length);

  const root = document.createElement('div');
  root.className = `rack ${side}`;
  root.dataset.role = `rack-${side}`;
  root.dataset.side = side;
  root.dataset.race = race ?? 'contested';
  root.dataset.units = army.join(',');
  root.dataset.columns = String(grid.columns);
  root.dataset.rows = String(grid.rows);
  root.dataset.atlas = visuals.atlas;
  root.dataset.tint = visuals.tint;
  root.style.setProperty('--button-width', `${grid.buttonWidth}px`);
  root.style.setProperty('--button-height', `${grid.buttonHeight}px`);
  root.style.setProperty('--rack-gap', `${RACK_GAP}px`);
  root.style.setProperty('--tint', visuals.tint);
  parent.appendChild(root);

  const header = document.createElement('div');
  header.className = 'rack-header';
  const selectedName = document.createElement('span');
  selectedName.className = 'selected-name';
  selectedName.dataset.role = 'selected-name';
  header.appendChild(selectedName);
  root.appendChild(header);

  const buttonsRow = document.createElement('div');
  buttonsRow.className = 'buttons';
  root.appendChild(buttonsRow);

  const buttons = army.map((unit, index) => {
    const name = nameOf(unit);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'spawner';
    b.dataset.action = `select:${side}:${index}`;
    b.dataset.unit = String(unit);
    b.dataset.index = String(index);
    b.title = name;
    b.style.width = `${grid.buttonWidth}px`;
    b.style.height = `${grid.buttonHeight}px`;
    const portrait = buildPortrait(unit, visuals.frame(unit), visuals.tint, { atlas: options.atlas, atlasImage: options.atlasImage }, name);
    const label = document.createElement('span');
    label.className = 'name';
    label.dataset.role = 'unit-name';
    label.textContent = name;
    const progress = document.createElement('span');
    progress.className = 'recharge';
    progress.dataset.role = 'recharge';
    b.append(portrait, label, progress);
    b.addEventListener('click', () => options.onSelect(index));
    buttonsRow.appendChild(b);
    return { b, progress };
  });

  const update = (frame: FrameState) => {
    const s = frame.spawners[side];
    selectedName.textContent = nameOf(s.unit);
    root.dataset.selected = String(s.selected);
    root.dataset.lane = String(s.lane);
    buttons.forEach(({ b, progress }, index) => {
      const selected = index === s.selected;
      b.classList.toggle('selected', selected);
      // The running charge is one counter; the selected unit's threshold comes from the spawner,
      // the others' from the roster, so every button shows whether it would be ready if picked.
      const needed = selected ? s.rechargeTime : unitStats(army[index]!).recharge;
      const ready = frame.winner === null && s.charged >= needed;
      const fraction = Math.min(1, s.charged / needed);
      b.classList.toggle('ready', ready);
      b.classList.toggle('recharging', !ready);
      b.dataset.recharge = ready ? 'ready' : 'recharging';
      b.dataset.progress = fraction.toFixed(2);
      progress.style.height = `${Math.round((1 - fraction) * 100)}%`;
    });
  };

  return { root, update };
}
