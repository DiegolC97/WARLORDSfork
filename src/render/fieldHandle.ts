/**
 * The hook a mounted battle screen hangs on its overlay element beside the
 * battle handle (`overlay.battle`, `src/battle/handle.ts`) so tests and
 * browser tooling can reach the engine side of what is drawn: the field
 * view (camera), the unit layer and the sprite library. It lives in the
 * render seam, not the screen folder, so other screens' tests may import
 * it without crossing the screen boundary.
 */
import type { FieldView } from './fieldView';
import type { SpriteLibrary } from './spriteLibrary';
import type { UnitLayer } from './unitLayer';

export interface FieldHandle {
  readonly view: FieldView;
  readonly units: UnitLayer;
  readonly library: SpriteLibrary;
}

type FieldOverlay = HTMLElement & { field?: FieldHandle };

/** The field handle of the battle screen mounted on `overlay`, or `null` when it runs headless or is not a battle. */
export function fieldHandle(overlay: HTMLElement): FieldHandle | null {
  return (overlay as FieldOverlay).field ?? null;
}

/** Attach (or, with `null`, remove) the handle on a battle overlay. */
export function attachFieldHandle(overlay: HTMLElement, handle: FieldHandle | null): void {
  const target = overlay as FieldOverlay;
  if (handle) target.field = handle;
  else delete target.field;
}
