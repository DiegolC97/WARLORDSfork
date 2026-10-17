/**
 * PlayCanvas implementation of `EngineHost` on a WebGL device. This is the
 * only module that constructs the engine application for the browser.
 */
import * as pc from 'playcanvas';
import type { EngineHost } from './host';
import { addHostCamera, appHostMethods, engineAssetBackend } from './appHost';

export function createPlayCanvasHost(canvas: HTMLCanvasElement): EngineHost {
  const app = new pc.Application(canvas, {
    mouse: new pc.Mouse(canvas),
    touch: new pc.TouchDevice(canvas),
    keyboard: new pc.Keyboard(window),
    graphicsDeviceOptions: { alpha: false },
  });
  app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  window.addEventListener('resize', () => app.resizeCanvas());

  const camera = addHostCamera(app);

  const light = new pc.Entity('light');
  light.addComponent('light');
  light.setEulerAngles(45, 30, 0);
  app.root.addChild(light);

  app.start();

  return {
    app,
    assetBackend: engineAssetBackend(app),
    ...appHostMethods(app, camera),
  };
}
