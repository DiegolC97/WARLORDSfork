import { ZOOM_LEVELS, type ZoomLevel } from '../../save';
import type { ScreenDefinition } from '../../shell/screen';
import { button, heading, note, row } from '../../ui/placeholder';

const ZOOM_LABELS: Readonly<Record<ZoomLevel, string>> = { 0.75: 'Far', 1: 'Normal', 1.25: 'Near' };

/** Options: sound, music and rendering zoom. Every change is written to the save at once. */
export const optionsScreen: ScreenDefinition = {
  id: 'options',
  assets: [],
  create: () => ({
    enter(ctx) {
      ctx.setClearColor(0.23, 0.23, 0.23);
      heading(ctx.overlay, 'Options');

      const soundRow = row(ctx.overlay);
      const musicRow = row(ctx.overlay);
      const zoomRow = row(ctx.overlay);
      const zoomLabel = note(zoomRow, '');
      const zoomButtons = ZOOM_LEVELS.map((level) =>
        button(zoomRow, ZOOM_LABELS[level], () => set({ zoom: level }), { action: `zoom:${level}` }),
      );
      const soundButton = button(soundRow, '', () => set({ soundOn: !ctx.campaign.read().soundOn }), {
        action: 'toggle-sound',
      });
      const musicButton = button(musicRow, '', () => set({ musicOn: !ctx.campaign.read().musicOn }), {
        action: 'toggle-music',
      });

      const refresh = () => {
        const s = ctx.campaign.read();
        soundButton.textContent = `Sound: ${s.soundOn ? 'On' : 'Off'}`;
        musicButton.textContent = `Music: ${s.musicOn ? 'On' : 'Off'}`;
        zoomLabel.textContent = `Zoom: ${ZOOM_LABELS[s.zoom]}`;
        zoomButtons.forEach((b, i) => (b.disabled = ZOOM_LEVELS[i] === s.zoom));
      };
      const set = (patch: Parameters<typeof ctx.campaign.update>[0]) => {
        ctx.campaign.update(patch);
        refresh();
      };
      refresh();

      button(ctx.overlay, 'Back', () => void ctx.navigate('back'), { action: 'back' });
    },
  }),
};
