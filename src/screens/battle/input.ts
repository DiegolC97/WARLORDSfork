/**
 * Keyboard input for two players on one keyboard (rules §3).
 *
 * The left player uses W/S for the lane, A/D for the unit, Space to release
 * and Q to charge; the right player uses the arrows (Right = previous,
 * Left = next, mirrored as in the original), Enter and 0. In a campaign the
 * left player may use either set. Each key is looked up by its physical
 * `code`, so the layout does not matter.
 *
 * Lane and unit keys act once per press (auto-repeat is ignored). Release
 * and charge keys are *held state*: the press acts at once and the key is
 * then sampled every frame while down, so holding a spawn key releases one
 * unit per recharge period — the simulation refuses the rest. Each side's
 * state is independent, so simultaneous presses are never dropped.
 */
import type { Side, SpawnerCommand } from '../../battle';

type Binding = { side: Side; command: SpawnerCommand };

const LEFT_KEYS: Readonly<Record<string, SpawnerCommand>> = {
  KeyW: 'lane-up',
  KeyS: 'lane-down',
  KeyA: 'previous-unit',
  KeyD: 'next-unit',
  Space: 'release',
  KeyQ: 'charge',
};

const RIGHT_KEYS: Readonly<Record<string, SpawnerCommand>> = {
  ArrowUp: 'lane-up',
  ArrowDown: 'lane-down',
  ArrowRight: 'previous-unit',
  ArrowLeft: 'next-unit',
  Enter: 'release',
  NumpadEnter: 'release',
  Digit0: 'charge',
  Numpad0: 'charge',
};

const HELD_COMMANDS: ReadonlySet<SpawnerCommand> = new Set(['release', 'charge']);

export interface InputOptions {
  /** Which sides a human drives. The right side's keys are ignored when the AI holds it. */
  readonly humans: readonly Side[];
  /** When true the arrow set also drives the left player (campaign). */
  readonly leftUsesBothSets: boolean;
  readonly issue: (side: Side, command: SpawnerCommand) => void;
  /** Listener target; `window` in the game, injectable for tests. */
  readonly target?: EventTarget;
}

export interface BattleInput {
  /** Re-issue every held release/charge key; call once per frame before the simulation ticks. */
  pumpHeld(): void;
  /** Commands currently held, for tests and the HUD. */
  held(side: Side): readonly SpawnerCommand[];
  dispose(): void;
}

export function bindBattleInput(options: InputOptions): BattleInput {
  const target = options.target ?? window;
  const held: Record<Side, Set<SpawnerCommand>> = { left: new Set(), right: new Set() };

  const bindingsFor = (code: string): Binding[] => {
    const out: Binding[] = [];
    const left = LEFT_KEYS[code];
    if (left && options.humans.includes('left')) out.push({ side: 'left', command: left });
    const right = RIGHT_KEYS[code];
    if (right) {
      if (options.humans.includes('right')) out.push({ side: 'right', command: right });
      else if (options.leftUsesBothSets && options.humans.includes('left')) {
        // The campaign player on the arrow set: Left/Right are not mirrored for them.
        const unmirrored: SpawnerCommand =
          right === 'previous-unit' ? 'next-unit' : right === 'next-unit' ? 'previous-unit' : right;
        out.push({ side: 'left', command: unmirrored });
      }
    }
    return out;
  };

  const codeOf = (e: KeyboardEvent): string => e.code || keyToCode(e.key);

  const onKeyDown = (event: Event) => {
    const e = event as KeyboardEvent;
    const bindings = bindingsFor(codeOf(e));
    if (bindings.length === 0) return;
    e.preventDefault();
    if (e.repeat) return;
    for (const { side, command } of bindings) {
      if (HELD_COMMANDS.has(command)) held[side].add(command);
      options.issue(side, command);
    }
  };
  const onKeyUp = (event: Event) => {
    const e = event as KeyboardEvent;
    for (const { side, command } of bindingsFor(codeOf(e))) held[side].delete(command);
  };
  const onBlur = () => {
    held.left.clear();
    held.right.clear();
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  return {
    pumpHeld() {
      for (const side of ['left', 'right'] as const) {
        for (const command of held[side]) options.issue(side, command);
      }
    },
    held: (side) => [...held[side]],
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      onBlur();
    },
  };
}

/** Fallback for events without a physical code (synthetic events): map the key value to a code. */
function keyToCode(key: string): string {
  if (key === ' ') return 'Space';
  if (key.length === 1 && /[a-z]/i.test(key)) return `Key${key.toUpperCase()}`;
  if (key.length === 1 && /[0-9]/.test(key)) return `Digit${key}`;
  return key;
}
