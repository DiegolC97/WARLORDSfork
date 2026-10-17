import * as pc from 'playcanvas';
import { applyVictory, battleSetup, isRegionId, type BattleSetup } from '../../campaign';
import {
  FRAMES_PER_SECOND,
  RESULT_AUTO_CONTINUE_FRAMES,
  attachBattleHandle,
  createBattle,
  type BattleSimulation,
  type FrameState,
  type Side,
  type SideSetup,
  type SpawnerCommand,
} from '../../battle';
import { CONTESTED_LABEL, raceName, regionName } from '../../names';
import {
  BLOC_RACES,
  isUnitId,
  raceStartingUpgrades,
  raceVisuals,
  referencedAtlases,
  starterUnits,
  twoPlayerArmy,
  type RaceId,
  type UpgradeTrack,
} from '../../roster';
import { SpriteLibrary, attachFieldHandle, createFieldView, createUnitLayer, type FieldView, type UnitLayer } from '../../render';
import type { BattleResult, CampaignSave } from '../../save';
import type { ScreenContext, ScreenDefinition } from '../../shell/screen';
import { atlasAssetId, atlasFromAssets } from '../../ui/portrait';
import { buildBackdrop } from './backdrop';
import { buildHud } from './hud';
import { bindBattleInput } from './input';
import { STAGE_HEIGHT, STAGE_WIDTH, laneY } from './layout';
import { buildRack } from './rack';

/**
 * The battle screen. It renders the simulation's frame snapshot — scores,
 * territory bar, timer, both spawners and every unit — and sends spawner
 * commands back from the keyboard and the rack. It holds no rule: what a
 * unit costs to release, when a side wins and what a kill is worth all
 * come out of the snapshot. On a decided winner it writes the outcome to
 * the save (the region on a campaign victory) and hands over to the result
 * screen.
 *
 * Two layers share the original's 700 × 500 stage: the HUD, racks and
 * footer are DOM, laid out at zoom 1 and CSS-scaled by the saved zoom; the
 * field — ground, lane lines, units, projectiles — is the engine's
 * (`src/render`), a scene in field units seen through a camera whose
 * viewport is the stage's field band at that zoom. Both go through the one
 * render constant, so they line up at any zoom. Headless (no engine app)
 * the field is simply not drawn.
 *
 * In a campaign the save's `battleRegion` names the region under attack and
 * the computer drives the right spawner; with no `battleRegion` (the
 * two-player entry) both spawners are human and share the keyboard.
 */

const FRAME_SECONDS = 1 / FRAMES_PER_SECOND;
/** Never simulate more than this much wall-clock time per rendered frame (tab was hidden). */
const MAX_CATCH_UP_SECONDS = 0.25;

/** The manifest id a race's atlas is declared under as an engine texture atlas (the json is declared beside it for the racks' portraits). */
export function spriteAtlasAssetId(url: string): string {
  return `sprites:${url}`;
}

export const battleScreen: ScreenDefinition = {
  id: 'battle',
  assets: referencedAtlases().flatMap((url) => [
    { id: atlasAssetId(url), type: 'json' as const, url },
    { id: spriteAtlasAssetId(url), type: 'textureatlas' as const, url },
  ]),
  create: () => {
    let dispose: () => void = () => {};
    return {
      enter(ctx) {
        dispose = mountBattle(ctx);
      },
      exit() {
        dispose();
      },
    };
  },
};

function mountBattle(ctx: ScreenContext): () => void {
  const save = ctx.campaign.read();
  const { zoom } = save;
  // The screen's own background, behind the stage; the DOM overlay is transparent so the engine shows through.
  ctx.setClearColor(0.102, 0.086, 0.071);
  const overlay = ctx.overlay;
  overlay.classList.add('battle');
  overlay.dataset.zoom = String(zoom);

  // ---- who fights
  const target = save.battleRegion;
  const setup: BattleSetup | null = target !== null && isRegionId(target) ? battleSetup(save.regionOwners, target) : null;
  const mode: BattleResult['mode'] = setup ? 'campaign' : 'two-player';
  const leftRace: RaceId = save.chosenRace ?? BLOC_RACES[0];
  const ownedArmy = save.ownedUnits.filter(isUnitId);
  const left: SideSetup = {
    race: leftRace,
    army: setup ? (ownedArmy.length > 0 ? ownedArmy : [...starterUnits()]) : twoPlayerArmy(leftRace),
    control: 'human',
    // A campaign carries its levels in the save (the handicap was written when the race was picked);
    // a two-player side starts at its race's handicap alone (rules §14).
    upgrades: setup ? (save.upgradeLevels as Partial<Record<UpgradeTrack, number>>) : raceStartingUpgrades(leftRace),
    autoSend: save.autoSendOn,
  };
  const rightRace: RaceId | null = setup
    ? setup.defender.kind === 'race'
      ? setup.defender.race
      : null
    : (BLOC_RACES[Math.floor(Math.random() * BLOC_RACES.length)] ?? BLOC_RACES[0]);
  // The defending race starts at its handicap too (rules §12.3); the contested host has no race, so no handicap.
  const rightUpgrades = rightRace ? raceStartingUpgrades(rightRace) : {};
  const right: SideSetup = setup
    ? { race: rightRace, army: setup.units, control: 'ai', statBonus: setup.statBonus, upgrades: rightUpgrades }
    : { race: rightRace, army: twoPlayerArmy(rightRace ?? BLOC_RACES[0]), control: 'human', upgrades: rightUpgrades };
  const sim = createBattle({ left, right });

  overlay.dataset.mode = mode;
  overlay.dataset.seed = String(sim.snapshot().seed);
  if (setup) {
    overlay.dataset.region = setup.region;
    overlay.dataset.defender = setup.defender.kind === 'race' ? setup.defender.race : 'contested';
  }

  // ---- the stage
  const viewport = document.createElement('div');
  viewport.className = 'viewport';
  overlay.appendChild(viewport);
  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.dataset.role = 'stage';
  stage.style.width = `${STAGE_WIDTH}px`;
  stage.style.height = `${STAGE_HEIGHT}px`;
  stage.style.transform = `scale(${zoom})`;
  viewport.appendChild(stage);
  stage.appendChild(buildBackdrop());

  const hud = buildHud(stage, (side) => issue(side, 'charge'));

  const field = document.createElement('div');
  field.className = 'field';
  field.dataset.role = 'field';
  stage.appendChild(field);
  const atlasFor = (race: RaceId | null) => atlasFromAssets(ctx.assets, race ? raceVisuals(race).atlas : referencedAtlases()[0]);
  const leftAtlas = atlasFor(leftRace);
  const rightAtlas = atlasFor(rightRace);

  // ---- the engine's field: camera, ground, units — absent headless
  const drawnRaces: Record<Side, RaceId> = { left: leftRace, right: rightRace ?? leftRace };
  let fieldView: FieldView | null = null;
  let unitLayer: UnitLayer | null = null;
  let library: SpriteLibrary | null = null;
  if (ctx.app && ctx.root) {
    const atlases: Partial<Record<RaceId, pc.TextureAtlas>> = {};
    for (const race of new Set(Object.values(drawnRaces))) {
      const id = spriteAtlasAssetId(raceVisuals(race).atlas);
      const resource = ctx.assets.has(id) ? ctx.assets.get<unknown>(id) : null;
      if (resource instanceof pc.TextureAtlas) atlases[race] = resource;
    }
    library = new SpriteLibrary(ctx.app.graphicsDevice, atlases);
    fieldView = createFieldView(ctx.app, ctx.root, zoom);
    unitLayer = createUnitLayer({
      app: ctx.app,
      root: ctx.root,
      library,
      flat: fieldView.flat,
      races: drawnRaces,
      tints: { left: raceVisuals(drawnRaces.left).tint, right: raceVisuals(drawnRaces.right).tint },
    });
    attachFieldHandle(overlay, { view: fieldView, units: unitLayer, library });
  }
  const arrows = {} as Record<Side, HTMLDivElement>;
  for (const side of ['left', 'right'] as const) {
    const arrow = document.createElement('div');
    arrow.className = `lane-arrow ${side}`;
    arrow.dataset.role = `arrow-${side}`;
    arrow.dataset.side = side;
    arrow.textContent = side === 'left' ? '▶' : '◀';
    field.appendChild(arrow);
    arrows[side] = arrow;
  }

  const racks = document.createElement('div');
  racks.className = 'racks';
  stage.appendChild(racks);
  const leftRack = buildRack(racks, {
    side: 'left',
    race: leftRace,
    army: left.army,
    ...leftAtlas,
    onSelect: (index) => select('left', index),
  });
  const rightRack = buildRack(racks, {
    side: 'right',
    race: rightRace,
    army: right.army,
    ...rightAtlas,
    onSelect: (index) => select('right', index),
  });
  leftRack.root.dataset.control = left.control;
  rightRack.root.dataset.control = right.control;
  if (setup && setup.statBonus !== 1) {
    const bonus = document.createElement('span');
    bonus.className = 'stat-bonus';
    bonus.dataset.role = 'stat-bonus';
    bonus.dataset.bonus = String(setup.statBonus);
    bonus.textContent = `×${setup.statBonus}`;
    bonus.title = `Defender stats ×${setup.statBonus}`;
    rightRack.root.querySelector('.rack-header')?.appendChild(bonus);
  }

  // ---- footer
  const footer = document.createElement('div');
  footer.className = 'footer';
  footer.dataset.role = 'footer';
  stage.appendChild(footer);
  const level = document.createElement('span');
  level.className = 'level';
  level.dataset.role = 'level';
  level.textContent = setup ? `Level ${save.campaignLevel}` : '2 Player';
  level.dataset.level = setup ? String(save.campaignLevel) : 'two-player';
  const matchup = document.createElement('span');
  matchup.className = 'matchup';
  matchup.dataset.role = 'matchup';
  matchup.textContent = setup
    ? `${raceName(leftRace)} attacking ${regionName(setup.region)} · ${rightRace ? raceName(rightRace) : `${CONTESTED_LABEL} host`}`
    : `${raceName(leftRace)} vs ${raceName(rightRace ?? leftRace)}`;
  footer.append(level, matchup);
  const controls = document.createElement('div');
  controls.className = 'controls';
  footer.appendChild(controls);
  footerButton(controls, 'Main menu', 'menu', () => {
    if (setup) ctx.campaign.update({ battleRegion: null });
    void ctx.navigate('menu');
  });
  const surrender = footerButton(controls, 'Surrender', 'surrender', () => sim.surrender('left'));
  footerButton(controls, 'Options', 'options', () => void ctx.navigate('options'));
  footerButton(controls, 'Retreat', 'retreat', () => {
    if (setup) ctx.campaign.update({ battleRegion: null });
    void ctx.navigate('retreat');
  });

  // ---- result panel
  const panel = document.createElement('div');
  panel.className = 'result-panel';
  panel.dataset.role = 'result-panel';
  panel.hidden = true;
  const panelTitle = document.createElement('h2');
  panelTitle.dataset.role = 'result-title';
  const panelScores = document.createElement('p');
  panelScores.dataset.role = 'result-scores';
  const continueButton = document.createElement('button');
  continueButton.type = 'button';
  continueButton.dataset.action = 'finished';
  continueButton.textContent = 'Continue';
  panel.append(panelTitle, panelScores, continueButton);
  stage.appendChild(panel);

  // ---- commands
  const issue = (side: Side, command: SpawnerCommand) => {
    sim.command(side, command);
  };
  const select = (side: Side, index: number) => {
    const current = sim.snapshot().spawners[side].selected;
    const count = sim.snapshot().sides[side].army.length;
    const forward = (index - current + count) % count;
    const backward = (current - index + count) % count;
    const steps = forward <= backward ? forward : backward;
    const command: SpawnerCommand = forward <= backward ? 'next-unit' : 'previous-unit';
    for (let i = 0; i < steps; i++) sim.command(side, command);
    render(sim.snapshot());
  };
  const input = bindBattleInput({
    humans: setup ? ['left'] : ['left', 'right'],
    leftUsesBothSets: Boolean(setup),
    issue,
  });

  // ---- rendering
  let lastFrame: FrameState = sim.snapshot();
  let ended = false;
  let finished = false;
  const render = (frame: FrameState) => {
    lastFrame = frame;
    hud.update(frame);
    leftRack.update(frame);
    rightRack.update(frame);
    unitLayer?.update(frame);
    for (const side of ['left', 'right'] as const) {
      const lane = frame.spawners[side].lane;
      arrows[side].style.top = `${laneY(lane) - 18}px`;
      arrows[side].dataset.lane = String(lane);
    }
    overlay.dataset.tick = String(frame.tick);
    overlay.dataset.winner = frame.winner ?? '';
    surrender.disabled = frame.winner !== null;
    continueButton.disabled = frame.winner === null;
    if (frame.winner && !ended) {
      ended = true;
      panel.hidden = false;
      panel.dataset.winner = frame.winner;
      panelTitle.textContent = resultTitle(frame.winner, mode);
      panelScores.textContent = `${frame.leftScore} – ${frame.rightScore}`;
      overlay.dataset.result = frame.winner;
      recordOutcome(frame);
    }
  };
  const recordOutcome = (frame: FrameState) => {
    const winner = frame.winner!;
    const result: BattleResult = { winner, leftScore: frame.leftScore, rightScore: frame.rightScore, mode };
    const current = ctx.campaign.read();
    const patch: Partial<Omit<CampaignSave, 'schemaVersion'>> = { lastBattle: result };
    if (setup) {
      patch.gold = current.gold + frame.spawners.left.gold;
      patch.lifetimeKills = current.lifetimeKills + frame.spawners.left.kills;
      if (winner === 'left') Object.assign(patch, applyVictory(current, setup.region) ?? { battleRegion: null });
      else patch.battleRegion = null;
    }
    ctx.campaign.update(patch);
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    void ctx.navigate('finished');
  };
  continueButton.addEventListener('click', finish);

  // ---- the frame loop: fixed 24 fps steps from the host's frames
  // The simulation stops on the deciding tick; the result panel's wait is
  // presentation, so the screen counts its own frames after the decision.
  let accumulator = 0;
  let framesSinceDecision = 0;
  const step = () => {
    input.pumpHeld();
    sim.tick();
    const frame = sim.snapshot();
    render(frame);
    if (frame.winner && ++framesSinceDecision >= RESULT_AUTO_CONTINUE_FRAMES) finish();
  };
  ctx.onFrame((dt) => {
    fieldView?.layout();
    accumulator += Math.min(dt, MAX_CATCH_UP_SECONDS);
    while (accumulator >= FRAME_SECONDS - 1e-9 && !finished) {
      accumulator -= FRAME_SECONDS;
      step();
    }
  });
  render(lastFrame);

  attachBattleHandle(overlay, { simulation: sim, frame: () => lastFrame });

  return () => {
    input.dispose();
    attachBattleHandle(overlay, null);
    attachFieldHandle(overlay, null);
    unitLayer?.destroy();
    fieldView?.destroy();
    library?.destroy();
  };
}

function footerButton(parent: HTMLElement, label: string, action: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.dataset.action = action;
  b.addEventListener('click', onClick);
  parent.appendChild(b);
  return b;
}

function resultTitle(winner: Side, mode: BattleResult['mode']): string {
  if (mode === 'campaign') return winner === 'left' ? 'Victory' : 'Defeat';
  return winner === 'left' ? 'Left player wins' : 'Right player wins';
}
