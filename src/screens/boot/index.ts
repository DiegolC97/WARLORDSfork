import type { AssetManifest } from '../../assets/loader';
import { GAME_TITLE_TEXT } from '../../names';
import type { ScreenDefinition } from '../../shell/screen';
import { button, heading, note } from '../../ui/placeholder';

/** Boot: proves the asset loader works and reports how the save was loaded. */
const assets: AssetManifest = [
  { id: 'placeholder-atlas', type: 'textureatlas', url: 'assets/ui/placeholder-atlas.json' },
];

export const bootScreen: ScreenDefinition = {
  id: 'boot',
  assets,
  create: () => ({
    enter(ctx) {
      document.title = GAME_TITLE_TEXT;
      ctx.setClearColor(0.05, 0.05, 0.08);
      heading(ctx.overlay, `${GAME_TITLE_TEXT} — boot`);
      note(ctx.overlay, `Save: ${ctx.saveOutcome.outcome} — ${ctx.saveOutcome.detail}`);
      note(ctx.overlay, `Assets: ${ctx.assets.has('placeholder-atlas') ? 'placeholder atlas loaded' : 'none'}`);
      button(ctx.overlay, 'Continue', () => void ctx.navigate('ready'), { action: 'ready' });
    },
  }),
};
