import { createApp } from './app';
import { createPlayCanvasHost } from './engine/playcanvasHost';

const canvas = document.getElementById('game');
const overlayRoot = document.getElementById('ui');
if (!(canvas instanceof HTMLCanvasElement) || !overlayRoot) {
  throw new Error('index.html must contain <canvas id="game"> and <div id="ui">');
}

createApp({
  host: createPlayCanvasHost(canvas),
  overlayRoot,
  storage: window.localStorage,
}).catch((err: unknown) => {
  console.error('failed to boot', err);
});
