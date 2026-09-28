import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { NullEngineHost } from '../../engine/nullHost';
import { ORIGINAL_GAME } from '../../names';
import { MemoryStorage } from '../../save';

describe('credits', () => {
  it('names the original game and its author and states the relationship (AC 8)', async () => {
    document.body.innerHTML = '<div id="ui"></div>';
    const overlayRoot = document.getElementById('ui')!;
    const app = await createApp({ host: new NullEngineHost(), overlayRoot, storage: new MemoryStorage() });
    await app.shell.navigate('ready');
    await app.shell.navigate('credits');
    const original = overlayRoot.querySelector('[data-role="original"]')!.textContent!;
    expect(original).toContain(ORIGINAL_GAME.title);
    expect(original).toContain(ORIGINAL_GAME.author);
    expect(overlayRoot.querySelector('[data-role="relationship"]')!.textContent).toMatch(/remake/i);
  });
});
