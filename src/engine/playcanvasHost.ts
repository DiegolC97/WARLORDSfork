/**
 * PlayCanvas implementation of `EngineHost`. This is the only module that
 * constructs the engine application.
 */
import * as pc from 'playcanvas';
import type { AssetBackend, AssetSpec } from '../assets/loader';
import type { EngineHost } from './host';

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

  const camera = new pc.Entity('camera');
  camera.addComponent('camera', { clearColor: new pc.Color(0.05, 0.05, 0.08) });
  camera.setPosition(0, 0, 10);
  app.root.addChild(camera);

  const light = new pc.Entity('light');
  light.addComponent('light');
  light.setEulerAngles(45, 30, 0);
  app.root.addChild(light);

  app.start();

  const assetBackend: AssetBackend = {
    load(spec: AssetSpec) {
      return new Promise((resolve, reject) => {
        const existing = app.assets.find(spec.id, spec.type);
        const asset = existing ?? new pc.Asset(spec.id, spec.type, { url: spec.url });
        if (!existing) app.assets.add(asset);
        asset.ready(() => resolve(asset.resource));
        asset.once('error', (err: unknown) => reject(err));
        app.assets.load(asset);
      });
    },
    unload(spec: AssetSpec) {
      const asset = app.assets.find(spec.id, spec.type);
      if (asset) {
        asset.unload();
        app.assets.remove(asset);
      }
    },
  };

  return {
    app,
    assetBackend,
    createSceneRoot(name) {
      const root = new pc.Entity(name);
      app.root.addChild(root);
      return root;
    },
    setClearColor(r, g, b) {
      if (camera.camera) camera.camera.clearColor = new pc.Color(r, g, b);
    },
  };
}
