/**
 * The hook a mounted battle screen hangs on its overlay element so tests
 * (and tooling) can read the simulation behind what is drawn. It lives in
 * the seam, not the screen folder, so other screens' tests may import it
 * without crossing the screen boundary.
 */
import type { BattleSimulation, FrameState } from './types';

export interface BattleHandle {
  readonly simulation: BattleSimulation;
  /** The frame rendered last. */
  frame(): FrameState;
}

type BattleOverlay = HTMLElement & { battle?: BattleHandle };

/** The handle the battle screen attached to `overlay`, or `null` when the element is not a battle. */
export function battleHandle(overlay: HTMLElement): BattleHandle | null {
  return (overlay as BattleOverlay).battle ?? null;
}

/** Attach (or, with `null`, remove) the handle on a battle overlay. */
export function attachBattleHandle(overlay: HTMLElement, handle: BattleHandle | null): void {
  const target = overlay as BattleOverlay;
  if (handle) target.battle = handle;
  else delete target.battle;
}
